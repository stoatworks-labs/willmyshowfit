/**
 * Suggesting a card loadout for a chassis whose stock one does not fit.
 *
 * The stock profiles answer "will it fit as it ships". This answers the more
 * useful question for anyone specifying a build: "is there *any* way to fill
 * this chassis that takes my show, and what is the smallest one?"
 *
 * Only chassis that publish a card catalogue get this. Barco's Event Master
 * chassis carry slot counts but no per-card port breakdown in the spec sheets
 * read for this database, so they are deliberately excluded rather than filled
 * in with plausible-looking inventions — `whyNoLoadout` says so in words.
 *
 * ## How the search works, and why it is small
 *
 * Input plugs and output plugs never compete for the same slot on these
 * chassis, and a demand in one direction can never be met by a port in the
 * other. So the two directions are solved **independently**, which turns one
 * intractable search over ~27,000 combined loadouts into two searches over a
 * few hundred each.
 *
 * Within a direction, loadouts are enumerated in increasing card count, so the
 * first feasible one found is minimal by construction. Among equals at the same
 * card count, fewer distinct card types wins — a build of four identical cards
 * is easier to order, stock and swap on site than one of four different ones —
 * and then the tightest fit, so a big multi-format card is not specified to
 * carry one signal a small card would take.
 *
 * The chosen loadout is then run through the ordinary `evaluateConfig`, so pool
 * checks, caveats and the aux-layer rules all apply exactly as they do to a
 * stock profile. Nothing here is a second, parallel notion of "fits".
 */

import type { Card, DeviceConfig, Port } from '../model/types.ts'
import type { Show } from '../profiles/video.ts'
import { buildDemands } from '../profiles/video.ts'
import { evaluateConfig, type VideoDevice } from './evaluate.ts'
import {
  expandToPlugs,
  matchPorts,
  resourcesOf,
  type ConfigResult,
  type PlugDemand,
} from './solve.ts'

export interface CardCount {
  card: Card
  count: number
}

export interface LoadoutProposal {
  /** The synthesised configuration, ready to hand to `evaluateConfig`. */
  config: DeviceConfig
  inputCards: CardCount[]
  outputCards: CardCount[]
  slotsUsed: { input: number; output: number }
  slotsAvailable: { input: number; output: number; either: number }
  /** How the proposal fares once pools and caveats are applied too. */
  result: ConfigResult
  /** True when this is materially different from what the chassis ships as. */
  differsFromStock: boolean
}

export type LoadoutOutcome =
  | { kind: 'proposed'; proposal: LoadoutProposal }
  | { kind: 'stock-already-fits' }
  | { kind: 'no-loadout-fits'; reason: string }
  | { kind: 'not-supported'; reason: string }

/**
 * Chassis with slots but no published card catalogue. Being explicit beats
 * silently offering nothing, because "no suggestion" and "cannot suggest" look
 * identical in a UI and mean very different things.
 */
export function whyNoLoadout(device: VideoDevice): string | null {
  if (!device.slots) {
    return `The ${device.model} has fixed connectors — there are no cards to choose.`
  }
  if (!device.availableCards || device.availableCards.length === 0) {
    return `${device.vendor} publishes slot counts for the ${device.model} but not a per-card connector breakdown in the documents this database is built from, so a loadout cannot be suggested without inventing the cards. The stock configuration above is real; a custom one would not be.`
  }
  return null
}

// ------------------------------------------------------------------ search

/**
 * Every way to pick `total` cards from `types` kinds, as count vectors.
 * Generated in a fixed order so the search is deterministic.
 */
function combosOfSize(types: number, total: number): number[][] {
  const out: number[][] = []
  const walk = (i: number, left: number, acc: number[]) => {
    if (i === types - 1) {
      out.push([...acc, left])
      return
    }
    for (let n = left; n >= 0; n--) walk(i + 1, left - n, [...acc, n])
  }
  walk(0, total, [])
  return out
}

function portsFromCards(cards: Card[], counts: number[], direction: 'in' | 'out'): Port[] {
  const ports: Port[] = []
  let cardIndex = 0
  const prefix = direction === 'in' ? 'IN' : 'OUT'
  let plugNo = 1

  for (let c = 0; c < cards.length; c++) {
    for (let n = 0; n < counts[c]; n++) {
      cardIndex += 1
      const cardId = `${direction}-${cardIndex}`
      for (const template of cards[c].ports) {
        ports.push({
          ...template,
          id: `${prefix} ${plugNo}`,
          cardId,
          // Output cards on these chassis feed program or aux; the multiviewer
          // has its own plugs and is carried over from the stock config.
          ...(direction === 'out' && !template.roles
            ? { roles: ['program', 'aux'] as Port['roles'] }
            : {}),
        })
        plugNo += 1
      }
    }
  }
  return ports
}

/**
 * Fewest cards, then fewest distinct card types, then the tightest fit.
 *
 * The last tiebreak used to prefer the *most* spare plugs, on the theory that
 * headroom is free. It is not: it specified a six-connector Tri-combo card to
 * carry one HDMI source, when a four-connector HDMI card does the same job for
 * less money. "Smallest arrangement that fits" has to mean smallest, or the
 * suggestion is not the one a person would actually order.
 */
function bestOf(
  candidates: { counts: number[]; ports: Port[]; spare: number }[],
): { counts: number[]; ports: Port[] } | null {
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => {
    const at = a.counts.filter((n) => n > 0).length
    const bt = b.counts.filter((n) => n > 0).length
    if (at !== bt) return at - bt
    return a.ports.length - b.ports.length
  })[0]
}

/**
 * A card's 4K60 rating, not its connector count, is usually what runs out.
 * The search has to know that, or it proposes a loadout with plenty of sockets
 * that `evaluateConfig` then rejects — and "no loadout fits" would be wrong.
 */
function capacityHolds(cards: Card[], counts: number[], sol: ReturnType<typeof matchPorts>): boolean {
  const capOf = new Map<string, number>()
  let idx = 0
  for (let c = 0; c < cards.length; c++) {
    for (let n = 0; n < counts[c]; n++) {
      idx += 1
      if (cards[c].max4k60 != null) capOf.set(String(idx), cards[c].max4k60!)
    }
  }
  if (capOf.size === 0) return true

  const used = new Map<string, number>()
  for (const a of sol.assignments) {
    const slot = a.port.cardId?.split('-')[1]
    if (!slot || !capOf.has(slot)) continue
    // Same rule as evaluateConfig: a multi-cable 4K60 is one 4K60 to the card.
    const UHD60_CLOCK = 594e6
    const cables = a.demand.cable?.of ?? 1
    const full = a.demand.need.pixelRateHz * cables
    const whole = full > UHD60_CLOCK * 0.55 ? 1 : full > UHD60_CLOCK * 0.28 ? 0.5 : 0.25
    used.set(slot, (used.get(slot) ?? 0) + whole / cables)
  }
  for (const [slot, amount] of used) {
    if (amount > capOf.get(slot)! + 1e-9) return false
  }
  return true
}

function solveDirection(
  cards: Card[],
  slots: number,
  demands: PlugDemand[],
  direction: 'in' | 'out',
): { counts: number[]; ports: Port[] } | null {
  if (demands.length === 0) return { counts: cards.map(() => 0), ports: [] }
  if (slots <= 0) return null

  for (let total = 1; total <= slots; total++) {
    const feasible: { counts: number[]; ports: Port[]; spare: number }[] = []

    for (const counts of combosOfSize(cards.length, total)) {
      const ports = portsFromCards(cards, counts, direction)
      if (ports.length < demands.length) continue // cheap prune before matching

      const resources = resourcesOf({
        id: 'probe',
        label: 'probe',
        stock: false,
        ports,
        pools: [],
      })
      const sol = matchPorts(resources, demands)
      if (sol.ok && capacityHolds(cards, counts, sol)) {
        feasible.push({ counts, ports, spare: sol.spare.length })
      }
    }

    const best = bestOf(feasible)
    if (best) return best
  }
  return null
}

// ---------------------------------------------------------------- proposal

export function proposeLoadout(device: VideoDevice, show: Show): LoadoutOutcome {
  const unsupported = whyNoLoadout(device)
  if (unsupported) return { kind: 'not-supported', reason: unsupported }

  const stock = device.configs.find((c) => c.stock) ?? device.configs[0]
  const stockResult = evaluateConfig(device, stock, show)
  if (stockResult.verdict === 'fits') return { kind: 'stock-already-fits' }

  const cards = device.availableCards!
  const inputCards = cards.filter((c) => c.slot === 'input' || c.slot === 'either')
  const outputCards = cards.filter((c) => c.slot === 'output' || c.slot === 'either')
  const slots = device.slots!

  const auxLayers = device.rules.auxLayers ?? 'from-pool'
  const demands = buildDemands(show, { costing: device.rules.layerCosting, auxLayers })
  const plugs = expandToPlugs(demands.ports)

  // The multiviewer plugs are part of the chassis, not of a card, so those
  // demands are met by the stock config's own multiviewer ports and must not
  // drive card selection.
  const mvPorts = stock.ports.filter((p) => p.roles?.includes('multiviewer'))
  const isMvDemand = (d: PlugDemand) => d.roles?.length === 1 && d.roles[0] === 'multiviewer'

  const inDemands = plugs.filter((d) => d.direction === 'in')
  const outDemands = plugs.filter((d) => d.direction === 'out' && !isMvDemand(d))

  // `either` slots can go to whichever side needs them. Try every split,
  // cheapest total first, so a chassis is never told it cannot fit a show that
  // a different split would have taken.
  const either = slots.either ?? 0
  let best: { inCounts: number[]; outCounts: number[]; ports: Port[]; used: { input: number; output: number } } | null =
    null

  for (let toInput = 0; toInput <= either; toInput++) {
    const inSlots = slots.input + toInput
    const outSlots = slots.output + (either - toInput)

    const inSol = solveDirection(inputCards, inSlots, inDemands, 'in')
    if (!inSol) continue
    const outSol = solveDirection(outputCards, outSlots, outDemands, 'out')
    if (!outSol) continue

    const usedIn = inSol.counts.reduce((a, b) => a + b, 0)
    const usedOut = outSol.counts.reduce((a, b) => a + b, 0)
    const candidate = {
      inCounts: inSol.counts,
      outCounts: outSol.counts,
      ports: [...inSol.ports, ...outSol.ports, ...mvPorts],
      used: { input: usedIn, output: usedOut },
    }
    if (!best || usedIn + usedOut < best.used.input + best.used.output) best = candidate
  }

  if (!best) {
    return {
      kind: 'no-loadout-fits',
      reason: `No arrangement of ${device.vendor}'s cards within this chassis's ${slots.input} input and ${slots.output} output slots has a plug for every signal.`,
    }
  }

  const inList = inputCards
    .map((card, i) => ({ card, count: best!.inCounts[i] }))
    .filter((c) => c.count > 0)
  const outList = outputCards
    .map((card, i) => ({ card, count: best!.outCounts[i] }))
    .filter((c) => c.count > 0)

  // Slot id -> that card's 4K60 rating, so the ordinary evaluation applies the
  // same per-card cap to a generated loadout as it does to a stock one.
  const cardCapacity: Record<string, number> = {}
  for (const [dir, counts, list] of [
    ['in', best.inCounts, inputCards],
    ['out', best.outCounts, outputCards],
  ] as const) {
    let idx = 0
    for (let c = 0; c < list.length; c++) {
      for (let n = 0; n < counts[c]; n++) {
        idx += 1
        if (list[c].max4k60 != null) cardCapacity[`${dir}-${idx}`] = list[c].max4k60!
      }
    }
  }

  const config: DeviceConfig = {
    id: 'custom',
    label: `Suggested loadout (${describeCards(inList)} in, ${describeCards(outList)} out)`,
    stock: false,
    ports: best.ports,
    ...(Object.keys(cardCapacity).length > 0 ? { cardCapacity } : {}),
    // Chassis-level capacity — layers, canvas, connector maxima — belongs to
    // the box, not to the cards, so it carries over from the stock profile.
    // PixelHue's per-output-card layer pool re-scopes itself automatically,
    // because its capacity is stated per card rather than per system.
    pools: stock.pools,
    cards: [
      ...inList.map((c) => ({ cardId: c.card.id, count: c.count })),
      ...outList.map((c) => ({ cardId: c.card.id, count: c.count })),
    ],
    provenance: {
      confidence: 'inferred',
      citations: [],
      notes: [
        'This loadout was generated by searching the published card catalogue, not read from a vendor document. The cards and the slot counts are documented; this particular arrangement of them is not a product, and slot-position restrictions are not modelled — check it against the vendor\'s own slot diagram before ordering.',
      ],
    },
  }

  const result = evaluateConfig(device, config, show)
  const stockCards = new Map((stock.cards ?? []).map((c) => [c.cardId, c.count]))
  const differsFromStock =
    (config.cards ?? []).length !== stockCards.size ||
    (config.cards ?? []).some((c) => stockCards.get(c.cardId) !== c.count)

  // Suggesting a loadout that still does not fit is worse than saying so.
  if (result.verdict === 'does-not-fit' || result.verdict === 'impossible') {
    return {
      kind: 'no-loadout-fits',
      reason:
        result.blockers[0] ??
        'A loadout with enough plugs exists, but the chassis runs out of capacity elsewhere.',
    }
  }

  return {
    kind: 'proposed',
    proposal: {
      config,
      inputCards: inList,
      outputCards: outList,
      slotsUsed: best.used,
      slotsAvailable: { input: slots.input, output: slots.output, either },
      result,
      differsFromStock,
    },
  }
}

function describeCards(list: CardCount[]): string {
  if (list.length === 0) return '0 cards'
  return list.map((c) => `${c.count}x ${shortName(c.card.label)}`).join(' + ')
}

function shortName(label: string): string {
  return label
    .replace(/\s*(input|output)\s*card$/i, '')
    .replace(/^\d+x\s*/, '')
    .trim()
}
