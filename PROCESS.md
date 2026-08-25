# Process overview

## What I built

Harmonium: a hand-pumped, bellows-driven free-reed keyboard spanning all three
saptaks (mandra, madhya, taar — 37 keys total). A key only sounds while it's
held *and* the bellows has air in it, same as the real instrument — drag the
bellows or hold Space to pump air in, and it bleeds away on its own the moment
you stop. Started as a different idea (a one-string "Strand" instrument) and
was rebuilt from scratch once the harmonium concept felt like it gave more
room for expressive, physically-grounded interaction.

## The moments that mattered

1. **Strand wasn't going anywhere expressive, so I threw it out rather than
   patch it.** The one-string instrument satisfied the spec mechanically but
   didn't feel like it rewarded skill or gave two players different results.
   Rather than keep iterating on it, I replaced it outright with the harmonium
   concept, which has a much richer physical model (bellows pressure, reed
   pairs, tone-chamber resonance) to build expressiveness around.
   [`e871942`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-SharmaKunal14/commit/e871942)

2. **The Space-bar bellows control didn't match how a real pump works, and I
   caught it on the first pass.** My first implementation held pressure at max
   for as long as Space was down and let it decay only on release. I corrected
   this to fire repeated pump strokes on an interval while held
   ([`425f4ca`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-SharmaKunal14/commit/425f4ca)),
   but on trying it, that still wasn't the real gesture: a real pump fills once
   per stroke and leaks continuously afterwards, *even while your hand is still
   on it*. I rewrote it as a single ease-out swell per fresh keydown
   (`!event.repeat`), followed by the same continuous exponential decay a drag
   uses, with re-swelling gated strictly to a new press rather than a hold
   ([`6d8c8c4`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-SharmaKunal14/commit/6d8c8c4)).
   I verified this with a Playwright script driving a single 4.5s Space hold
   and reading the live `--pressure` CSS variable every frame: it rose to a
   peak (~0.54) around 150ms in, then declined monotonically to the end with
   no re-swell — confirming the hold genuinely behaves as one stroke, not a
   repeating pump.

3. **Tuning against a real reference instead of guessing frequencies.** Early
   notes were picked from a single sample rather than a tuning standard, which
   meant nothing was actually in tune with anything else. I retuned the whole
   note table to 12-TET against A4 = 440 Hz, with madhya Sa fixed at C4, and
   modelled the harmonium's actual timbre (paired detuned reeds beating against
   each other, run through a fixed formant peak at ~3x the fundamental for the
   tone-chamber resonance) rather than a bare oscillator.
   [`0ddf71d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-SharmaKunal14/commit/0ddf71d)
   →
   [`eeb645b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-SharmaKunal14/commit/eeb645b)

4. **Discoverability check turned up a real "stranger can't play it uninstructed"
   gap.** With no on-screen text allowed by spec, there was nothing inviting a
   first-time player to touch the bellows before trying a key (which makes no
   sound without air). I added a slow breathing glow on the bellows that
   retires permanently after the first real interaction, verified by loading
   the page cold in a fresh browser context and confirming the glow disappears
   on first touch.
   [`cdd929b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-SharmaKunal14/commit/cdd929b)

5. **Scaling from one octave to three needed a layout rule, not just more
   keys.** Naively sizing 37 white keys as a percentage of the container would
   have shrunk touch targets to unusable sizes on a phone. I switched to
   fixed-rem key widths and wrapped the keyboard in a horizontally-scrollable
   container instead, verified at a 390px mobile viewport by comparing
   `#keysWrap`'s visible width (351px) against `#keys`'s full scroll width
   (776px) and reviewing the rendered screenshot.
   [`2b80ec1`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-SharmaKunal14/commit/2b80ec1)

## Before you ship

`pnpm check:evidence` verifies citations resolve to real commits and that a
reflection entry is present.
