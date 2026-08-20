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
src/lib/topology/propose.ts a fit turned into a patch list
src/lib/io/xml.ts           save/load
src/lib/report/html.ts      the report, one generator for screen and file
src/data/*.ts               the device database
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

## Verified vs assumed

**Verified:** the engine. 45 tests cover the signal maths against published
timings, mirror/select collapsing, the matching (including the four-SDI-sources
case a count gets wrong), dual-cable rate splitting, adapter selection, layer
costing, all four pool scopes, the aux-layer rule per vendor, the vision-mixer
shape check, and XML round-tripping.

**Assumed, and badged in the UI:**

- **All device data is vendor paperwork.** No hardware has been connected. No
  show has been built from a topology this tool produced.
- **PixelHue screens spanning two output cards** are charged to both. PixelHue
  does not publish what actually happens. Conservative — it can report "does not
  fit" for something an engineer would make work.
- **Aquilon VPU mixer/slice modelling** exists in `VideoRules.mixers` but is not
  yet used in a verdict. The live-read allocation data is real
  (32 of 64 mixers, slices per screen); what drives slice count is assumed to be
  canvas width and is *not* proven.
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

## Deployment

Cloudflare Worker serving static assets, apex + `www` custom domains declared in
`wrangler.toml`. No `main` in that file, which is what makes "nothing is
uploaded" a property of the deployment rather than a promise — if it ever gains
one, the privacy claim in the README becomes false.

Fleet conventions apply: see `~/.claude` memory for the deploy path, the
push-before-deploy race, and the dirty-tree trap.

## Next

1. **Custom card-loadout solver.** The chassis all carry `slots` and
   `availableCards` already; nothing consumes them yet.
2. **Aquilon mixer/slice verdicts**, once the slice rule is confirmed.
3. **Audio profile** for sound desks — the reason the core is generic.
