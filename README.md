> Built with AI assistance ([Claude Code](https://claude.com/claude-code)).

# Will my show fit?

**Live at [willmyshowfit.com](https://willmyshowfit.com)** — nothing to install.

Describe a show — screens, layers, sources, destinations — and find out which
video switchers will actually take it. Not "does the input count add up", but
whether there is a physical plug of the right type and capability for every
signal, whether the layer budget covers the layers, and whether the canvas fits
the chassis. Then it proposes a wiring topology for each switcher that fits.

Nothing is uploaded. There is no backend to upload it to.

## What it checks

**Plugs, as a matching rather than a count.** Twelve inputs and twelve sources
is not an answer: four SDI cameras and two SDI plugs is a "no", and a count will
never see it. Every signal is matched to a specific connector, respecting
capability — a 4K60 source does not go into an HDMI 1.4a plug, 4:4:4 does not go
down SDI, and a DisplayPort link budget is checked as well as its pixel clock.

**The plugs that are not what they look like.** A Midra 4K output is an HDMI
socket *and* a 12G-SDI socket carrying the same picture: that is one output, not
two. Its inputs 1 and 2 are HDMI *or* 3G-SDI, pick one. Counting the sockets on
the back panel overstates that chassis by a third.

**Layer capacity in each vendor's own arithmetic.** Analog Way charges a 4K
mixing layer twice what it charges a DL/2K one. Barco's ladder is 4K : DL : 2K =
1 : 2 : 4. PixelHue budgets layers **per output card**, so an F8 advertising
sixteen 4K layers still cannot put three on a screen living on one card. These
are not modelled or derived — they are each vendor's published numbers, cited.

**Canvas and throughput.** Barco's live effects canvas in megapixels, with the
PGM-only trade-off offered when the show only fits that way. Analog Way's
program throughput figure.

**Dual- and quad-cable signals.** A 4K60 feed on two cables is two half-rate
signals, which is exactly why it fits plugs that 4K60 does not.

**Passive adapters**, where one genuinely works — HDMI↔DVI-D is the same TMDS
signalling — and it says so in the patch list rather than pretending the plug
matched.

## Layers on aux

A global toggle. Off, every aux is a plain scaled feed. On, auxes can carry
their own layers, and the devices diverge sharply:

| | |
|---|---|
| **Analog Way LivePremier** | Free. Documented outright: layers on aux use adjacent unused outputs, not the main layer budget. |
| **Barco Event Master, PixelHue** | Charged at the same rate as an on-screen layer. |
| **Blackmagic ATEM** | Impossible. An aux is a clean routed bus; keys live on an M/E. |

That last row is the point of the toggle: it turns a "which is cheapest" list
into a "which can do this at all" list.

## Screen-management systems vs vision mixers

The database holds both, in two separate sections, because they answer different
questions. A presentation switcher builds an arbitrary canvas across several
outputs and edge-blends the joins. A vision mixer does not: every output is one
raster, and layers are keyers over a program bus. A 7680×2160 blend is not "too
big" for an ATEM the way it is too big for a Midra — it is the wrong shape, and
the tool says so in those words.

They are here because a great many shows people reach for a presentation
switcher to solve are one screen, one raster and two keys.

## Devices

**Analog Way** — Midra 4K (QuickVu, QuickMatrix, Pulse, Eikos, each mode checked
separately), Alta 4K (Zenith 100/200), LivePremier (Aquilon RS alpha, RS1–RS6).
**Barco** — S3 standalone, E2 Gen 1, E2 Gen 2, ENCORE3.
**PixelHue** — F4, F8.
**Roland** — V-160HD, VR-400UHD, V-600UHD.
**Blackmagic Design** — ATEM 1/2/4 M/E Constellation 4K.

Card-based chassis are profiled against their stock loadout **and**, where the
chassis misses, searched for a card loadout that would take the show — see
below.

## Custom card loadouts

When a modular chassis does not fit as it ships, "does not fit" is only half an
answer. The question anyone specifying a build actually has is whether a
different set of cards would take it, so the tool searches for one and shows the
smallest arrangement that does, with the wiring topology that follows from it.

Loadouts are enumerated in increasing card count, so the first feasible one is
minimal by construction; among equals, fewer distinct card types wins (four
identical cards are easier to order and swap on site than four different ones),
then the tightest fit. The chosen loadout goes through exactly the same
evaluation as a stock profile — there is no second, looser notion of "fits".

The search is capability-aware rather than a plug count, in both directions:

- Five 1080p60 HDMI sources get one 8-plug HDMI 1.4 card, not two 4-plug
  HDMI 2.0 ones, because the cheaper card carries the format.
- One HDMI source gets a 4-connector HDMI card, not the 6-connector
  multi-format card that happens to have an HDMI plug on it.
- Six 2560x1600 outputs on an E2 Gen 1 get two Gen 2 HDMI 2.0 cards rather than
  three Gen 1 ones, because a Gen 1 card has only *two* connectors fast enough
  (see below) while a Gen 2 card has four.

Slot-position rules are not modelled. Some vendors require particular cards in
particular slots, and Barco's Tri-combo cards are capped at 2x 4K60 regardless
of having six connectors — so a proposal is a starting point to check against
the vendor's own slot diagram, not an order form.

### The four connectors on a card are not always equal

Barco's Gen 1 HDMI output card has four connectors, and the top two run to
297 MPix/s while the bottom two stop at 165. So an E2 Gen 1's eight HDMI outputs
are really four that carry 2560x1600 and four that do not — and a show wanting
six of them needs a different card, not just a spare slot.

The chassis spec sheets quote only the 297 figure. The per-connector split is
published on a different sheet entirely, for a different product. This tool had
the optimistic reading until a loadout test disagreed with it.

## Import, export and reports

**XML** in and out — our own format, attributes a person can read and hand-edit,
round-trip pinned by tests. A bad file imports as far as it can and lists what
it could not read, rather than throwing away forty good entries over one typo.

**Reports** as a printable page (browser "save as PDF") or a standalone HTML
file, carrying the input list, output list, screen breakdown, compatibility
matrix, per-device wiring topology, and every citation behind the verdict.

## The honest bit

**Every figure here is read from published vendor documentation and cited on the
device that uses it. None of it has been verified against hardware.** No show
has been built from a topology this tool proposed. Vendors revise spec sheets
without notice, several of the relevant numbers are published as ranges or with
conditions, and a few are internally inconsistent — Barco's E2 Gen 1 sheet
duplicates its Aux text into the Mixers row, and PixelHue's F8 sheet disagrees
with itself about output slot count. Both are recorded in the data rather than
smoothed over.

Figures that could not be sourced are marked `unverified` and say so in the UI;
a test fails the build if anything claims to be `documented` without a citation.
Treat a "fits" as a shortlist, not a purchase order.

## Development

```bash
npm install
npm run dev
```

```bash
npm test
```

```bash
npm run build && npm run serve:dist
```

`npm run preview` does not apply `public/_headers`, so use `serve:dist` to test
the CSP for real. See [AGENTS.md](AGENTS.md) for the architecture and for what
is verified versus assumed.

## Trademarks and affiliation

Not affiliated with, endorsed by, or a product of Analog Way, Barco, PixelHue,
Roland or Blackmagic Design. All product names, logos and brands are the
property of their respective owners and are used here only to identify the
equipment being described.

## Licence

MIT — see [LICENSE](LICENSE).
