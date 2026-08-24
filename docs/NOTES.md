# Notes

Working notes for this repo: status, decisions, and the traps that have actually bitten.
Migrated out of Claude Code's memory on 2026-08-24, so they are written in the first
person and dated by when each thing was learned — that date is usually the useful part.

Cross-cutting notes that are not specific to this repo live in
[fleet-notes](https://github.com/stoatworks-labs/fleet-notes).

*Will My Show Fit? — browser tool matching a show spec against 37 video switchers; PUBLIC + LIVE on its own apex domain willmyshowfit.com, engine tested but zero hardware verification*

`~/projects/video/willmyshowfit`, React/TS/Vite static SPA, MIT, v0.4.0, created
2026-08-20. **PUBLIC and LIVE**: `github.com/stoatworks-labs/willmyshowfit` and
**https://willmyshowfit.com**.

**The first fleet tool on its OWN APEX DOMAIN**, not a `*.stoatworks-labs.com`
subdomain. Zone registered through Cloudflare 2026-08-20 and already active in
the account. `wrangler.toml` declares **two** custom-domain routes, apex and
`www`, both attached and serving. Otherwise the standard shape: static-assets
Worker, no `main`, `public/_headers` CSP ([pages demo hosting](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_pages_demo_hosting.md)).

Takes a show — screens with canvases, layers, sources, destinations — and says
which switchers take it, with a proposed wiring topology per fit. XML in/out,
HTML + printable-PDF reports.

## Architecture: generic core, video profile first

Allan's explicit choice, because **sound desks are a stated stretch goal**.
`Device<TRules>` is a bag of typed **ports** and capacity **pools**; a show is
demands on them. `src/lib/model/types.ts` must never learn what a layer is —
that lives in `src/lib/profiles/video.ts`. An audio profile adds its own port
kinds, pool scopes and rules type and reuses `matchPorts`/`checkPools` unchanged.

**`PoolScope` is the load-bearing generalisation**: `system` / `per-screen` /
`per-output` / `per-output-card`. It exists because **PixelHue budgets mixing
layers PER OUTPUT CARD** — an F8 advertising 16x 4K layers still cannot put three
on a screen living on one card. Same number, completely different answer.

**Plug fitting is a bipartite matching (Kuhn's), never a count.** Four SDI
cameras and two SDI plugs is a "no" that counting cannot see. Verified against a
live diagnostic when the example show looked broken — the matcher was right and
the *example* was wrong.

**Mirror/select groups collapse to ONE resource.** A Midra output is HDMI *and*
12G-SDI carrying the same picture; its inputs 1–2 are HDMI *or* 3G-SDI. Counting
back-panel sockets overstates a Midra by a third. Easiest mistake in the repo.

## Traps already paid for

- **CVT-RB v2 must subtract the 460 µs minimum vertical blanking from the frame
  time BEFORE dividing by active lines.** Dividing the whole frame time gives
  ~1096 lines instead of 1111 for 1080p60 and puts every clock several percent
  low — which reads as "this just fits" on a plug where it does not. Same family
  of error as the CVT trap in [otter edid editor](https://github.com/stoatworks-labs/otter-edid-editor/blob/main/docs/NOTES.md) (`otter-edid-editor`); a test pins
  2000x1111 / 133.32 MHz. **Found by a test, not by inspection.**
- **Pixel rates include blanking.** Active pixels under-report ~20%.
- **Layer costs are each vendor's own published arithmetic, NEVER derived.**
  Analog Way 4K:2K = 1:2. Barco 4K:DL:2K = 1:2:4. They differ because their small
  unit differs; a pixel-count ratio silently overrules both.
- **Failure reasons must be ranked by the connector the signal wants.** Ungated,
  a 4K60 DisplayPort source that overran the DP 1.1 link budget was told "SDI
  cannot take DISPLAYPORT" — true, useless, points at the wrong plug.
- **Count output PLUGS, not destination entries**, when deciding a screen spans
  outputs. One entry reading "LED processor x3" is three outputs.

## Vendor documents that contradict themselves — recorded, not smoothed over

- **Barco E2 Gen 1 spec sheet duplicates its Scaled Aux text into the Mixers
  row**, so that row says nothing about layers. Figures come from the separate
  "PIP layers (per chassis)" section — 2K:16 / DL:8 / 4K:4 — which is the
  clearest layer statement Barco publishes anywhere and is the source of the
  1:2:4 ladder used for all four Event Master chassis.
- **PixelHue F8 datasheet disagrees with itself on output slots**: body copy says
  8 (agreeing with both the 32-output max and the 16x 4K layer figure), the card
  diagram is labelled 6. Eight used; caveat says confirm against the chassis.
- **Barco ENCORE3's standard config lists connector maxima summing to 18 for a
  16-input system.** All 18 plugs are listed and an `input-plugs` pool caps the
  total — correct in both directions. A fixed mix of 16 would wrongly reject a
  nine-HDMI show. That's what the `input-plugs`/`output-plugs` pools are for.

## Data discipline

Same posture as [otter edid editor](https://github.com/stoatworks-labs/otter-edid-editor/blob/main/docs/NOTES.md) (`otter-edid-editor`): `documented` / `inferred` /
`unverified` with mandatory citations, and **`data.test.ts` fails the build** if
anything claims `documented` without one, or `unverified` without a note
explaining itself. 73 tests total.

## Custom card-loadout solver — SHIPPED 2026-08-21 (this was the v2 item)

`src/lib/fit/loadout.ts`. Runs only for chassis that missed AND publish a card
catalogue, so **Analog Way LivePremier and PixelHue only**.

**Input and output are solved INDEPENDENTLY** — they never compete for a slot
and a demand in one direction can never be met by a port in the other. That
turns one search over ~27,000 combined loadouts into two over a few hundred
each: **1.5 ms per chassis, ~14 ms a full pass**, so it runs inline in the same
`useMemo` as the evaluation rather than behind a button. Measured, not guessed.

Loadouts enumerated in **increasing card count**, so the first feasible one is
minimal by construction; ties break on fewest distinct card types (four
identical cards beat four different ones for ordering and swapping on site),
then most spare plugs.

Two things that would otherwise be wrong:
- **Multiviewer plugs belong to the chassis, not a card.** MV demands are
  excluded from card selection and the stock config's MVR ports are carried
  over, or the search buys an output card to serve a multiviewer that already
  has plugs.
- **Chassis-level pools carry over from the stock config** (layers, canvas,
  connector maxima) because they are properties of the box. PixelHue's
  per-output-card layer pool re-scopes itself for free, since its capacity is
  stated per card.

The proposal then goes through the ordinary `evaluateConfig` — **no second,
looser notion of "fits"** — and if it still fails, it reports that instead of
suggesting a loadout that does not work.

**`whyNoLoadout()` returns a SENTENCE, not null**, for chassis it cannot search.
"No suggestion" and "cannot suggest" look identical in a UI and mean very
different things. Only the fixed-connector switchers hit it now.

**Tiebreak is fewest cards -> fewest distinct types -> FEWEST PLUGS.** The last
one was originally *most spare* plugs, which specified a six-connector Tri-combo
to carry one HDMI source. "Smallest arrangement that fits" has to mean smallest.

## Barco CARD CAPACITY + BACKPLANE — modelled 2026-08-21 (Allan raised it)

**A 4K plug uses up a whole card.** The tool counted connectors and only had a
caveat admitting the cap existed; counting connectors **overstates an E2 Gen 1
by 4x**. Both limits are documented per chassis and now enforced:

- **Per card**: `"HDMI output card supports 1 4K60p or 4 HD"`. Gen 1 card = four
  connectors, **one** 4K60 between them, so one 4K60 source strands the other
  three sockets. Gen 2 = 2 per card. **ENCORE3 = 4 per card.**
- **Per chassis (backplane)**: caps BELOW the sum of the fitted cards. E2 Gen 1
  = four output cards at 1x 4K60 each and still **only 3x 4K outputs**.

**Capacity is per SLOT (`DeviceConfig.cardCapacity`), not per chassis** — a
chassis can mix ratings (E2 Tri-combo is a Gen 1 chassis with both 1x and 2x
cards). Needs its own pass (`checkCardCapacity`), because `checkPools` compares
every instance of a scope against ONE capacity.

Three things that had to be right, each of which was wrong first:
1. ☠️ **Measure against 4K60's LINK clock (594 MHz), not its active rate (498).**
   Demands carry link rates; against the active rate 1080p60 comes out at 0.30 of
   a 4K60 instead of exactly 0.25, and four HD then overflow a card the vendor
   says holds exactly four.
2. ☠️ **A multi-cable 4K60 is ONE 4K60 to a card.** `expandToPlugs` halves the
   rate per cable, so reconstruct the full rate and divide the cost back.
   Charging halves separately bills it twice.
3. ☠️ **`matchPorts` knows nothing about cards** and bunched four 4K60s onto a
   two-4K60 card while an identical card sat empty. `rebalanceCards()` repairs
   afterwards (local search) rather than turning a clean bipartite match into a
   constrained one.

Headline result: **an E2 Gen 2 shows twelve HDMI 2.0 inputs and takes 4K60 on
eight of them**; the ninth fails on card capacity with three connectors free.

## LivePremier SCALING-ENGINE BOUNDARY — modelled 2026-08-21

This is what Analog Way's **"depending on the screens setup"** is hiding, and it
changes verdicts. `VideoRules.vpu.scalingEngineOutputs = 4`: an engine spans
**four output links**, so a layer on a screen wider than four outputs takes a
second layer link and **costs twice** (User Manual v6.0 §5.5.4). Confirmed on
the Aquilon C — a six-output screen reported **two mixers per slice**.

**It is a CLIFF at five outputs, not a slope.** Four-output blend to five-output
doubles that screen's whole layer bill. On an RS2 that turns a clean eight-layer
fit into a **trade-off** (split-layer mode has 16), which the tool states with
the cost attached rather than refusing.

**The rest of the VPU model is deliberately NOT modelled** — a VPU is an 8x8
link field holding 64 DUAL / 16 4K / 4 5K layers, and none of it binds before
the headline mixing-layer count does. Machinery that would change no answer.
**Optimized mode (§5.5.6) removes the boundary and is NOT modelled**; a chassis
running it takes more than this says. Caveat states it. See
[livepremier vpu visualizer](https://github.com/stoatworks-labs/aquilon-vpu-map/blob/main/docs/NOTES.md) (`aquilon-vpu-map`) for the hardware reads behind all of it.

## The Barco card catalogue — FOUND 2026-08-21, and what it exposed

Barco publishes **no per-card connector table in any of the four chassis spec
sheets**. It IS published, in passing, on the **Tri-combo sheets** while they
describe their own pre-loaded configurations:
- `assets.barco.com/m/3d46b7fb2bf0dda9/original/E2-Tri-combo-en-Spec-sheet.pdf`
- `assets.barco.com/m/75c834964686437e/original/S3-Tri-combo-Gen-2-en-Spec-sheet.pdf`

Cards: **Tri-combo = 4x 12G-SDI + 1x HDMI 2.0 + 1x DP 1.2** (six connectors but
**capped at 2x 4K60** — plug count is NOT the 4K count); HDMI 2.0 quad and
DP 1.2 quad = 4 each; Gen 1 HDMI/DP combo = 2+2. The Gen 1 splits are arithmetic
but **reconcile exactly across three different chassis**, so they are `inferred`
with the arithmetic in the note. **Gen 2 cards drop into Gen 1 chassis**;
**ENCORE3 takes Gen 2 only** ("occupy with Event Master Gen2 cards").

☠️ **The same reading exposed an overstatement in data I had already written.**
A **Gen 1 HDMI output card's four connectors are NOT equal** — Barco rates the
top two at **297 MPix/s and the bottom two at 165**. So an E2 Gen 1's eight HDMI
outputs are four that carry 2560x1600 and four that do not. Both E2 Gen 1 and
S3 standalone stock profiles had been claiming **twice** the capability they
have. **The chassis sheets quote only the 297 figure** — the split is on a
different sheet for a different product. Found because a loadout test disagreed
with the data, which is the argument for having both.

**barco.com 403s scripted fetches** (WebFetch and curl with a browser UA alike);
**assets.barco.com serves the PDFs fine**. Search for the asset URL, don't try
the product page.

A generated loadout is always `inferred`, never `documented`, and its provenance
note says it is not a product and that **slot-position rules are not modelled**.

Sanity check it reproduces: 12 SDI cameras + 2 SDI playback + 5 HDMI + 1 DP 4K60
on an RS4 gives 4x 12G-SDI + 1x 8-plug HDMI 1.4 + 1x DP input cards, 2x HDMI 2.0
output. Note it picks the **8-plug HDMI 1.4 card over two 4-plug HDMI 2.0 ones**
— capability-aware minimisation, since HDMI 1.4 at 300 MHz carries 1080p60. RS1
and RS2 correctly report that no arrangement fits (too few slots).

**The honest gap: no hardware has ever been connected, and no show has been built
from a topology it proposed.** Whole database is vendor paperwork. README,
AGENTS.md and the UI all say so; don't let a later pass quietly upgrade it.

37 devices: Analog Way (Midra 4K x4 with each operating mode as a separate
config, Alta Zenith 100/200, Aquilon RS alpha + RS1–RS6), Barco (S3 standalone,
E2 Gen 1, E2 Gen 2, ENCORE3), PixelHue (F4, F8), Roland (V-160HD, VR-400UHD,
V-600UHD), Blackmagic (ATEM 1/2/4 M/E Constellation 4K).

**Aquilon datasheet URLs follow a pattern** that works for the whole line:
`s3.eu-west-3.amazonaws.com/aw.store01/Site+Internet/Series/LivePremier/Products/Aquilon+<M>/Technical+Datasheet/Aquilon-<M>-datasheet-en.pdf`.
The same pattern **403s for Midra and Alta** — the Midra numbers came from the
V3.1 user manual instead. Page 1 of every Aquilon datasheet carries a comparison
table covering the *entire* RS + C line, so one PDF gives you all of them.

## Layers on aux (Allan added this mid-build)

Global toggle on the show, plus a per-device `auxLayers` rule. It is a
**capability** question, not a preference, which is the whole point:
LivePremier does it `free` (documented — it borrows adjacent unused outputs),
Event Master and PixelHue charge `from-pool`, and an **ATEM aux is `none`** — a
clean routed bus, keys live on an M/E — so turning the toggle on eliminates
every ATEM outright. Default when a device doesn't say is `from-pool`.

Roland/Blackmagic were also Allan's mid-build addition. They are **vision
mixers, not screen-management systems**, so they carry `edgeBlending: false` and
are listed in a **separate section** — a wide blend is the wrong *shape* for
them, not merely too big, and the tool says it in those words.

## Website

Listed on stoatworks-labs.com as **web tool 09**, Video group, and
`/software/willmyshowfit`. **Third-party model numbers stay OFF the site as
usual** ([stoatworks website](https://github.com/stoatworks-labs/stoatworks-website/blob/main/docs/NOTES.md) (`stoatworks-website`)) — the summary and detail copy describe
the machines without naming any, even though the tool itself names them
throughout. Inserted **after otter-edid-editor** in `webtools.json` rather than
appended, because file order is page order.

⚠️ **`web-tools.astro`'s `detail` map needs the exact key set** or the build dies
with `Cannot read properties of undefined (reading 'map')`:
`headline`, `lede`, `cta`, `note[]`, `featuresTitle`, `features[{tag,name,body}]`,
`checks[[title, body]]`. Guessing at `points` cost a build.

## Legacy Analog Way lines — ADDED 2026-08-21 (Allan asked for them)

Twelve more devices in `src/data/analogway-legacy.ts`, taking the database to
**37**. Both lines discontinued, both still all over the rental market.

**Midra pre-4K** (QuickVu 3G, QuickMatriX, Pulse², SmartMatriX², Saphyr,
Eikos²), each operating mode a separate config as with Midra 4K. Two platform
facts decide most verdicts and neither is a plug count:

- ☠️ **165 MHz single-link, everywhere.** Every plug is quoted "2048x1152@60Hz"
  and the Pulse² sheet gives the underlying "FpxMax = 165MHz". 1080p60 and
  1920x1200 fit; 2560x1600 and anything 4K do not, in any mode.
- ☠️ **NO edge blending at all** — soft edge arrived with Midra 4K. This forced
  splitting `edgeBlending` from a new **`VideoRules.category`**: "cannot blend"
  and "is a vision mixer" had been the SAME FLAG, and a Saphyr is the first
  device that is one without being the other. `deviceClass()` prefers
  `category`, falls back to `edgeBlending`. The blocker no longer calls such a
  device a vision mixer.

**A Midra input is a select-one multi-plug**: DVI-D on inputs 1-4, HDMI on 3-6,
SDI on the rest, so inputs 3 and 4 carry two digital sockets and take one
signal. The vendor's own "10 / 12 digital input plugs" subtotal is exactly what
is modelled. **The four Universal Analog plugs are NOT modelled** (no analog
video `ConnectorKind`), so plug counts sit below the vendor headline — the same
applies to LiveCore's eight or twelve.

**LiveCore** (NeXtage 08/16 - 4K, Ascender 16/32/48 - 4K, SmartMatriX Ultra).
Held to **4K30 in and out** — the platform ceiling, however much the 4-lane DP
link could carry. ☠️ **An output's DVI connector alternates by number**: #1 and
#3 are Dual-Link to 2560x1600, #2 and #4 carry 4K30 through the DVI shell, so an
Ascender takes **two** 4K displays and not three. A plug count cannot see that.
42 plugs capped at 12 seamless inputs by an `input-plugs` pool — the ENCORE3
pattern, because Analog Way does not publish which plug belongs to which input.

Naming decoded and it reconciles: **ASC1602 / 3204 / 4806, NXT0802 / 1604** —
the second pair is layers per output (2/4/6, 2/4) and the first is
layers x outputs x 2, the two scalers a true-seamless layer needs. SVC Online
independently quotes "16 scalers" for the NeXtage 16.

**Vendor self-contradiction, recorded:** the NeXtage 16 - 4K sheet says "42
input plugs" in one panel and "28 total input plugs" in another. 28 is what its
own connector list adds up to; 42 is the Ascender figure copied across.

⚠️ **SmartMatriX Ultra is `unverified` throughout** — the ONLY device in the
database with no vendor document behind it. Its archived product page has had
the downloads removed; input figures come from a trade-press listing, the output
board is assumed to be the Ascender's, and no layer count is published anywhere.
A test pins the badge. Do not promote it because the numbers look plausible.

### Where these documents live, since analogway.com mostly 404s them

- **`legacy.theatrixx.com/media/video/analog-way/` is an OPEN DIRECTORY INDEX**
  of Analog Way datasheets — Aquilon, Ascender, NeXtage, Pulse2, Saphyr, QuickVu,
  Picturall. Path is `<MODEL-DIR>/downloads/<file>.pdf`; list the dir first, the
  filenames are not guessable.
- The S3 bucket from the Aquilon pattern **also serves Midra**:
  `s3.eu-west-3.amazonaws.com/aw.store01/Site+Internet/Series/Midra/Products/<Model>/Technical+Datasheet/<slug>-datasheet-en.pdf`
  (Eikos² is `Eikos%C2%B2`). Bucket **listing is AccessDenied**, keys work.
- `avsupply.com/wp-content/uploads/2024/05/<ref>.pdf` has QMX150 and SMX250.
- **The Midra family comparison table is printed on the Saphyr and QuickVu
  sheets** — operating modes / inputs / outputs / video output / live layers for
  all six models at once. One PDF gives you the line.
- **rentex.com PDFs are fetchable by WebFetch but curl gets an HTML block page.**
  WebFetch saves the binary to the session tool-results dir; `pdftotext -layout`
  it from there.

## UI rebuilt around the editor — 2026-08-21

**Four columns**: screens+outputs, auxes, multiviewer, sources — and the verdict
list moved to the **sticky narrow LEFT column**, editor on the right. A show is
edited by moving between those four lists, and the old single stack meant
scrolling past the screens to reach the sources every time. Two columns under
1500px, one under 760px, where `.col:first-child { order: 2 }` puts the editor
first. `.app` max-width went 1500 -> 1760px to pay for it.

**Blank show** button keeps the discarded show behind a "put it back" notice.

**Support footer added** (it had never had one): vendored `support-footer.js`,
`supportFooterVersion()` transformIndexHtml plugin stamping `data-version` from
`package.json`, `.sw-support` centred to 1760px, and — the one that fails in
PROD only — `https://intake.stoatworks-labs.com` added to the CSP `connect-src`
in `public/_headers`. willmyshowfit added to the backend's sync table, **23
hosted apps** now ([support footer](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_support_footer.md)).

**Cloudflare builds this one on push** — `wrangler.toml` says so in a comment,
unlike the fourteen that need a local `cf-run` deploy
([hosted app deploy triggers](https://github.com/stoatworks-labs/fleet-notes/blob/main/notes/reference_hosted_app_deploy_triggers.md)).

## Report options — 2026-08-22 (Allan asked; the full report was too long)

`src/lib/report/options.ts` + `src/ui/ReportControls.tsx`. Switchers picked by
brand or model (vendor boxes are **tri-state**, plus all / none / **only what
fits**), and five droppable sections: input list, output list, screen
breakdown, wiring topology, source documents. Example show **~30,000 chars ->
~5,600** trimmed to what fits with topology and links off.

**Two things are NOT switchable, same argument both times:**
- ⚠️ **A trimmed report PRINTS A BANNER saying it is trimmed** ("Showing 9 of 37
  switchers (Analog Way, Barco, PixelHue), and it leaves out the source
  documents"). A nine-row matrix reads as the whole field to whoever it was
  mailed to — the one person who cannot tell. `summarise()` returns **null** when
  nothing was trimmed so a full report never prints a reassuring "37 of 37".
- **The caveat section stays**, but drops "and cited above" when the links are off.

Citations are generated from whatever survived the filter, so a Barco-only
report carries no Analog Way links.

**The switcher picker is SHARED with the planning page** (`src/ui/DevicePicker.tsx`,
2026-08-22): one `ReportOptions.devices` array held in `App`, rendered above the
verdict list and again in the report panel. Splitting them would mean filtering
twice with nobody guessing they had to. `ReportSections` stays the report's own.

Two things the filter broke the moment it existed:
- The summary bar read **"9 / 9"** filtered to what fits — true, and reads as
  "everything fits". The hidden count went on the LABEL ("Devices that fit ·
  28 hidden") so the number pair stays clean.
- Deselecting everything left the column blank with no way to tell the tool from
  a bug. It now says so and points at the picker.

**Every report is signed**: "Generated by willmyshowfit.com, a free tool from
Stoatworks Labs — v0.4.0" plus the not-a-product-of-any-manufacturer line.
⚠️ **Deliberately NOT in `ReportSections`** — a report that leaves the building
has to say what build made it and whose trademarks it uses. Version comes from
`__APP_VERSION__`, which **does reach vitest** (vite `define` applies under the
shared config), so no fallback is needed.

**Options live in App state, NOT in the show and NOT in the XML** — they
describe one printout, so an exported file always reopens with the whole report.
Print, download and screen are one generator with one options object.

Phrasing trap: the omitted sections are a mix of singular and plural nouns ("the
input list", "the source documents"), so picking is/are by how many were turned
off is wrong either way. It says **"it leaves out X"** instead.

The model picker sorts by **family then model** — ranked order is right for the
verdict list and wrong for a lookup.

## Next

1. **Aquilon VPU mixer/slice verdicts** — `VideoRules.mixers` is populated from
   the live read in [livepremier vpu visualizer](https://github.com/stoatworks-labs/aquilon-vpu-map/blob/main/docs/NOTES.md) (`aquilon-vpu-map`) but not used in a
   verdict, because what drives slice count is still assumed to be canvas width.
2. **Audio profile** for sound desks — the reason the core is generic.
3. **Barco Tri-combo chassis** (E2 Tri-combo, S3 Tri-combo Gen 2) are now fully
   documented as a side effect of the card hunt — adding them is data entry.
4. **The SmartMatriX Ultra needs a real document.** Everything else in the
   database has one.
5. **An analog-video `ConnectorKind`** would let the Midra and LiveCore
   Universal Analog plugs be counted; today they simply are not there.
