# Crit 4 reflection

## What was the breakthrough that moved the work forward?

The turning point was the Space-bar pump correction. The agent's first attempt
held pressure at max for as long as Space was down, which technically produced
sound but didn't feel like a harmonium — it felt like a switch. I asked for the
"gradual natural release" of a real pump, and it came back with pressure
repeating on a timer while held. Still wrong: a real hand pumps once per
stroke, and the air keeps leaking out even while your hand is still resting on
the bellows. Only on the second correction, once I described the actual
physical gesture precisely — one swell per fresh press, continuous decay
regardless of hold state — did it land. That's the moment the instrument
stopped feeling like a plausible simulation of a harmonium and started feeling
like one you could actually pump. Everything after that (the three-saptak
expansion, the tuning) built on an interaction that already felt right.

## What did this work change about who I want to be as a software developer?

It sharpened how I judge "done." An agent can produce something that passes
every mechanical check and still be wrong in a way no test suite catches —
the pump behaviour was functionally complete both times before it was actually
right. What moved it forward wasn't accepting the first plausible result, it
was trusting my own ear and hands enough to say "no, that's not the gesture"
twice, and being specific about *why* it was wrong rather than just asking for
another attempt. I want to keep working that way: using my own judgement as
the real spec, and treating an AI's first pass as a draft to correct against
that judgement, not as the answer.
