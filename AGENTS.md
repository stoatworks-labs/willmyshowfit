# AGENTS.md

Onboarding for anyone — human or model — picking this repo up. The README says
what the tool does; this says how it is built and what you can and cannot trust.

## The one idea

A device is **a bag of typed ports and a set of capacity pools**. A show is
**a set of demands on them**. The solver knows nothing else.

```
src/lib/model/types.ts      the generic core — no idea what a "layer" is
src/lib/model/signal.ts     pixel rates, SDI classes, DP link budgets
src/lib/profiles/video.ts   what a show IS, and how it becomes demands
src/lib/fit/solve.ts        port matching + pool checking
src/lib/fit/evaluate.ts     one device, one verdict; then ranking
src/lib/fit/loadout.ts      searching the card catalogue for a loadout that fits
src/lib/topology/propose.ts a fit turned into a patch list
src/lib/io/xml.ts           save/load
src/lib/report/html.ts      the report, one generator for screen and file
src/data/*.ts               the device database
                            (analogway.ts = the current lines,
                             analogway-legacy.ts = Midra pre-4K + LiveCore)
src/ui/*.tsx                React, no framework beyond it
```

**The core must not learn what a screen is.** `Device<TRules>` is generic
precisely so the video profile can hang `VideoRules` off it without the core
knowing. A sound-desk profile — the stretch goal — adds its own port kinds,
its own pool scopes and its own rules type, and reuses `matchPorts` and
`checkPools` unchanged. If you find yourself adding `layers` to `types.ts`,
stop.

## Load-bearing invariants

**Mirror and select groups collapse to one resource.** `mirrorGroup` = several
connectors carrying the same signal (a Midra output is HDMI *and* 12G-SDI).
`selectGroup` = several connectors of which one may be active (a Midra input is
HDMI *or* 3G-SDI). Both are ONE assignable thing. Treating them as separate
plugs overstates a Midra by a third, and it is the single easiest mistake to
make here.

**Plug fitting is a bipartite matching, not a count.** `matchPorts` is Kuhn's
algorithm. Resources are tried in preference order — exact connector before
adapter, least-capable-that-works before most-capable — so the first feasible
assignment is also a sensible one to draw on a wiring diagram, and a 12G-SDI
plug is not burnt on an HD feed while an HD plug idles.

**Pixel rates include blanking.** A plug limit ("600 MHz max", "297 Mpix/sec")
is a total-raster figure. Active pixels under-report every format by roughly
20%. Standard formats use published timings; anything else uses CVT-RB v2.

**CVT-RB v2 uses the ESTIMATED line period.** It subtracts the 460 µs minimum
vertical blanking from the frame time *before* dividing by active lines.
Recomputing against the settled vertical total is the obvious-looking
improvement and puts every clock several percent low — which reads as "this
just fits" on a plug where it does not. Pinned by a test against the published
1920×1080p60 figures (2000×1111, 133.32 MHz).

**Layer costs are each vendor's arithmetic, never derived.** Analog Way's 4K:2K
is 1:2. Barco's 4K:DL:2K is 1:2:4. They differ because their small unit is a
different size. A pixel-count ratio would silently overrule both.

**Card capacity is per SLOT, not per chassis** (`DeviceConfig.cardCapacity`),
because a chassis can mix card ratings — Barco's E2 Tri-combo is a Gen 1 chassis
carrying both 1x-4K60 combo cards and 2x-4K60 Tri-combos. It gets its own pass
(`checkCardCapacity`) rather than a pool, since `checkPools` compares every
instance of a scope against one capacity and the whole point is that they
differ. The backplane cap is a separate, ordinary system pool.

**Cost is measured against 4K60's LINK clock, 594 MHz** — not its active pixel
rate of 498. The demands carry link rates, so measuring against the active rate
puts 1080p60 at 0.30 of a 4K60 instead of exactly 0.25, and four HD signals then
overflow a card the vendor says holds precisely four.

**A multi-cable 4K60 is ONE 4K60 to a card.** `expandToPlugs` halves the rate
per cable, so the cost function reconstructs the full rate and divides the cost
back across the cables. Charging each half separately bills it twice, which on
a one-4K60 card is the difference between fitting and not.

**`rebalanceCards` runs after matching.** The matcher places plugs and knows
nothing about the cards behind them, so it will pack four 4K60 signals onto one
two-4K60 card while an identical card sits empty. The repair pass moves signals
to free compatible plugs on emptier cards. It is a local search, not a
guarantee — but it fixes the bunching that actually happens, and anything left
over is still reported honestly as over capacity.

**`PoolScope` is why the engine does not lie.** `system`, `per-screen`,
`per-output` and `per-output-card`. PixelHue budgets layers per output card, and
that is a completely different answer from the same number budgeted system-wide.

**Every user-typed string is escaped** in `report/html.ts` and `io/xml.ts`. The
report is injected with `dangerouslySetInnerHTML`, so the generator is the only
thing standing between a show name and the DOM. It emits no scripts.

## Data rules, enforced by tests

`src/lib/__tests__/data.test.ts` fails the build if any of these break:

1. Anything `documented` carries a citation naming the actual document — not
   "the vendor website".
2. Anything `unverified` explains itself in a note.
3. Device ids unique; port ids unique within a config; every config has plugs
   in both directions.
4. Every device's `layerCosting.poolId` names a pool that config actually has.
5. Layer class ladders are monotonic — a bigger class never costs less.

**"Cannot edge-blend" and "is a vision mixer" are two different claims.**
`VideoRules.edgeBlending: false` blocks a screen spanning more than one output;
`VideoRules.category` decides which section it is ranked in. They were one flag
until the pre-4K Midra arrived — a presentation switcher with freely placed
layers and no soft edge, which needs one answer to each. `deviceClass()` prefers
`category` and falls back to reading `edgeBlending`, so nothing else moved.

## Verified vs assumed

**Verified:** the engine. 82 tests cover the signal maths against published
timings, mirror/select collapsing, the matching (including the four-SDI-sources
case a count gets wrong), dual-cable rate splitting, adapter selection, layer
costing, all four pool scopes, the aux-layer rule per vendor, the vision-mixer
shape check, XML round-tripping, and the loadout search (minimality, slot limits, honest
failure, and that it refuses to invent cards for chassis without a catalogue).

**Assumed, and badged in the UI:**

- **All device data is vendor paperwork.** No hardware has been connected. No
  show has been built from a topology this tool produced.
- **The SmartMatriX Ultra is `unverified` throughout** — the only device in the
  database with no vendor document behind it. Analog Way's archived product page
  has had its downloads removed; the input figures come from a trade-press
  listing, the output plug mix is assumed to be the Ascender's board, and no
  layer count is published anywhere this could be found. Do not quietly promote
  it because the numbers look plausible beside its siblings.
- **The Universal Analog plugs on every Midra and LiveCore are not modelled.**
  There is no analog-video `ConnectorKind`, so those four-to-twelve plugs per
  device are simply absent and the counts here sit below the vendor headline.
  The vendors' own digital-plug subtotals are what is modelled, and they match.
- **PixelHue screens spanning two output cards** are charged to both. PixelHue
  does not publish what actually happens. Conservative — it can report "does not
  fit" for something an engineer would make work.
- **The LivePremier scaling-engine boundary IS used in a verdict** now
  (`VideoRules.vpu`). Four output links per engine; a layer on a wider screen
  wraps and costs twice. That rule is the manual's (v6.0 §5.5.4) and was
  confirmed on an Aquilon C where a six-output screen reported two mixers per
  slice. **Optimized mode removes the boundary and is not modelled** — a chassis
  running it takes more than this tool says.
- **The rest of the VPU model is deliberately not modelled.** A VPU is an 8x8
  link field holding 64 dual-link, 16 4K or 4 5K layers; none of that binds
  before the headline mixing-layer count does, so modelling it would add
  machinery without changing an answer.
- **Barco E2 Gen 2's layer ladder** is the Gen 1 sheet's, inferred.
- **Barco S3 standalone's "4 mixable"** is read as 4K layers, inferred.
- **Roland V-600UHD layer count** is `unverified` — Roland publishes none.
- **Alta Zenith 100's plug mix** is the series figure; Analog Way publishes the
  same connector breakdown for both models while quoting different totals.
- **E3's standard connector counts** sum to 18 for a 16-input system, so all 18
  plugs are listed and an `input-plugs` pool caps the total. Correct in both
  directions; a fixed mix of 16 would wrongly reject a nine-HDMI show.

## Vendor documents that contradict themselves

Recorded in the data with the discrepancy stated, not smoothed over:

- **Barco E2 Gen 1** — the Mixers row duplicates the Scaled Aux text and says
  nothing about layers. Layer figures come from the separate "PIP layers (per
  chassis)" section, which is the clearest layer statement Barco publishes for
  any Event Master chassis and is where the 1:2:4 ladder comes from.
- **PixelHue F8** — body copy says 8 output slots (agreeing with both the
  32-output maximum and the 16× 4K layer figure); the card-layout diagram is
  labelled 6. Eight is used; the caveat says to confirm against the chassis.

## Where the Barco card catalogue came from

Barco publishes no per-card connector table in the four chassis sheets this
database was built from — which is why Event Master had no loadout suggestions
at first. The **Tri-combo** sheets publish it in passing, while describing their
own pre-loaded configurations, and the three statements reconcile *exactly* with
the input and output totals of three different chassis:

- Tri-combo card = 4x 12G-SDI + 1x HDMI 2.0 + 1x DP 1.2 (six connectors,
  capped at 2x 4K60 — the plug count is not the 4K count)
- HDMI 2.0 quad and DP 1.2 quad = four each
- Gen 1 HDMI/DP combo = 2 + 2, which is forced by the chassis totals

**And the Gen 1 HDMI output card's four connectors are not equal**: top two at
297 MPix/s, bottom two at 165. The chassis sheets quote only 297. That
correction changed the E2 Gen 1 and S3 standalone stock profiles — both had been
claiming twice the 2560x1600 output capability they have. Found because a
loadout test disagreed with the data, which is the whole point of having both.

## Deployment

Cloudflare Worker serving static assets, apex + `www` custom domains declared in
`wrangler.toml`. No `main` in that file, which is what makes "nothing is
uploaded" a property of the deployment rather than a promise — if it ever gains
one, the privacy claim in the README becomes false.

Fleet conventions apply: see `~/.claude` memory for the deploy path, the
push-before-deploy race, and the dirty-tree trap.

## The loadout search

`proposeLoadout` runs only for chassis that missed and that publish a card
catalogue. ~1.5 ms each, ~14 ms for a whole pass, so it runs inline in the same
memo as the evaluation rather than behind a button.

**Input and output are solved independently.** They never compete for the same
slot and a demand in one direction can never be met by a port in the other, so
one search over ~27,000 combined loadouts becomes two over a few hundred each.
`either` slots are handled by trying every split.

Loadouts are enumerated in increasing card count, so the first feasible one is
minimal by construction. Ties break on fewest distinct card types, then
**fewest plugs** — the tightest fit. That last one was originally "most spare
plugs", which specified a six-connector Tri-combo to carry a single HDMI
source; "smallest arrangement that fits" has to mean smallest or the suggestion
is not one anybody would order. Multiviewer plugs belong to the chassis, not a card, so those
demands are excluded from card selection and the stock config's MVR ports are
carried over — otherwise the search buys an output card to serve a multiviewer
that already has its own plugs.

Chassis-level pools (layers, canvas, connector maxima) carry over from the stock
config, because they are properties of the box. PixelHue's per-output-card layer
pool re-scopes itself for free, since its capacity is stated per card.

**A generated loadout is always `inferred`, never `documented`**, and says in
its own provenance note that it is not a product. Slot-position rules are not
modelled.

`whyNoLoadout()` returns a sentence rather than null for chassis that cannot be
searched — "no suggestion" and "cannot suggest" look identical in a UI and mean
very different things.

## Next

1. **Aquilon mixer/slice verdicts**, once the slice rule is confirmed.
2. **Audio profile** for sound desks — the reason the core is generic.
3. **Barco Tri-combo chassis** (E2 Tri-combo, S3 Tri-combo Gen 2) are now fully
   documented as a side effect of reading their sheets for the card catalogue —
   adding them is mostly data entry.
