// Harmonium: a hand-pumped free-reed keyboard. A reed only sounds while air
// moves through it, so a key makes a tone only while it is held AND the
// bellows has air in it -- drag the bellows (any direction) to pump air in;
// it bleeds away on its own, same as the real instrument once you stop.
const instrument = document.getElementById("instrument");
const bellows = document.getElementById("bellows");
const keysEl = document.getElementById("keys");
const status = document.getElementById("status");

if (instrument && bellows && keysEl) {
  // Three saptaks laid out as one continuous strip, same as a real harmonium
  // spans mandra (low) through madhya (middle) to taar (high): each octave
  // contributes 12 new notes and no pitch repeats across the boundary. A
  // harmonium is a fixed-pitch keyboard, so unlike a voice it can't bend to
  // the microtonal srutis of raga theory -- it's built and tuned to plain
  // 12-TET against a reference pitch, same as a piano. Sa is set here at
  // concert pitch (madhya Sa = C4, A4 = 440 Hz).
  const SA_HZ = 261.6256;
  const cents = (c: number) => SA_HZ * Math.pow(2, c / 1200);

  type NoteKind = "white" | "black";
  const OCTAVE_TEMPLATE: { note: string; kind: NoteKind; cents: number }[] = [
    { note: "Sa", kind: "white", cents: 0 },
    { note: "re", kind: "black", cents: 100 },
    { note: "Re", kind: "white", cents: 200 },
    { note: "ga", kind: "black", cents: 300 },
    { note: "Ga", kind: "white", cents: 400 },
    { note: "Ma", kind: "white", cents: 500 },
    { note: "ma'", kind: "black", cents: 600 },
    { note: "Pa", kind: "white", cents: 700 },
    { note: "dha", kind: "black", cents: 800 },
    { note: "Dha", kind: "white", cents: 900 },
    { note: "ni", kind: "black", cents: 1000 },
    { note: "Ni", kind: "white", cents: 1100 },
  ];

  // mandra, madhya, taar -- one octave each, keys chosen so madhya keeps the
  // exact bindings already tested (z x c v b n m / s d g h j).
  const SAPTAK_OFFSETS = [-1200, 0, 1200];
  const SAPTAK_KEYS = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "q", "w"],
    ["z", "s", "x", "d", "c", "v", "g", "b", "h", "n", "j", "m"],
    ["e", "r", "t", "y", "u", "i", "o", "p", "a", "f", "k", "l"],
  ];

  const NOTES: { note: string; kind: NoteKind; cents: number; key: string }[] = [];
  SAPTAK_OFFSETS.forEach((offset, s) => {
    OCTAVE_TEMPLATE.forEach((n, i) => {
      NOTES.push({ note: n.note, kind: n.kind, cents: offset + n.cents, key: SAPTAK_KEYS[s][i] });
    });
  });
  NOTES.push({ note: "Sa", kind: "white", cents: 2400, key: "," }); // closing top note

  const WHITE_KEY_REM = 2.2;
  const BLACK_KEY_REM = WHITE_KEY_REM * 0.62;
  const whiteCount = NOTES.filter((n) => n.kind === "white").length;
  keysEl.style.width = `${whiteCount * WHITE_KEY_REM}rem`;

  const keyByInputKey = new Map<string, { el: HTMLElement; freq: number }>();

  let whiteIndex = 0;
  NOTES.forEach((n) => {
    const el = document.createElement("div");
    const freq = cents(n.cents);
    if (n.kind === "white") {
      el.className = "key white";
      el.style.left = `${whiteIndex * WHITE_KEY_REM}rem`;
      el.style.width = `${WHITE_KEY_REM}rem`;
      keysEl.appendChild(el);
      keyByInputKey.set(n.key, { el, freq });
      whiteIndex += 1;
    } else {
      el.className = "key black";
      el.style.left = `${whiteIndex * WHITE_KEY_REM - BLACK_KEY_REM / 2}rem`;
      el.style.width = `${BLACK_KEY_REM}rem`;
      keysEl.appendChild(el);
      keyByInputKey.set(n.key, { el, freq });
    }
  });

  // --- Audio: each note is two reed banks (a hair detuned, like a real
  // harmonium's paired reeds) beating gently against each other, run through
  // a lowpass that brightens with bellows pressure -- more air, more upper
  // harmonics, same as blowing a reed harder. A single master gain tracks
  // pressure so all notes fade together when air runs out. ---
  let audioCtx: AudioContext | null = null;
  let masterGain: GainNode | null = null;

  function ensureAudio() {
    if (!audioCtx || !masterGain) {
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return { ctx: audioCtx, master: masterGain };
  }

  const DETUNE_CENTS = 7;

  // The idle glow on the bellows invites a first touch; any real
  // interaction -- pumping or trying a key -- retires it for good.
  const endIdle = () => bellows.classList.remove("idle");

  type Voice = { oscs: OscillatorNode[]; body: BiquadFilterNode; gain: GainNode };
  const voices = new Map<string, Voice>();

  function pressKey(inputKey: string) {
    endIdle();
    const target = keyByInputKey.get(inputKey);
    if (!target || voices.has(inputKey)) return;
    const { ctx, master } = ensureAudio();
    const now = ctx.currentTime;

    // The reed itself just chops air into sawtooth-rich pulses; the
    // instrument's actual timbre comes from the wooden tone chamber the reed
    // sits in, which resonates around ~3x the fundamental (the nasal,
    // "incisive" bite harmoniums are known for). Model that as a fixed
    // formant peak, then a pressure-driven lowpass on top for how much air
    // reaches the upper harmonics at all.
    const formant = ctx.createBiquadFilter();
    formant.type = "peaking";
    formant.frequency.value = target.freq * 3;
    formant.Q.value = 2.5;
    formant.gain.value = 9;

    const body = ctx.createBiquadFilter();
    body.type = "lowpass";
    body.Q.value = 0.7;
    body.frequency.value = target.freq * (2 + pressure * 4);
    formant.connect(body);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.3, now + 0.015);
    body.connect(gain).connect(master);

    // A reed doesn't lock onto pitch instantly -- it catches as air starts
    // moving through it, so each oscillator scoops up from slightly flat.
    const oscs = [-DETUNE_CENTS / 2, DETUNE_CENTS / 2].map((cents) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const ratio = Math.pow(2, cents / 1200);
      osc.frequency.setValueAtTime(target.freq * ratio * 0.94, now);
      osc.frequency.exponentialRampToValueAtTime(target.freq * ratio, now + 0.05);
      osc.connect(formant);
      osc.start();
      return osc;
    });

    voices.set(inputKey, { oscs, body, gain });
    target.el.classList.add("active");
  }

  function releaseKey(inputKey: string) {
    const voice = voices.get(inputKey);
    const target = keyByInputKey.get(inputKey);
    if (!voice || !audioCtx) return;
    voice.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.015);
    voice.oscs.forEach((osc) => osc.stop(audioCtx!.currentTime + 0.08));
    voices.delete(inputKey);
    target?.el.classList.remove("active");
  }

  // --- Bellows: drag (any direction) or hold Space pumps pressure in; it
  // decays on its own the moment you stop. The pleats always show the
  // current pressure -- fuller when there's more air -- except while you're
  // actively dragging, where they follow your hand instead. The glow behind
  // them (see styles.css --pressure) tracks the same value. ---
  let pressure = 0;
  let dragY: number | null = null;
  let spaceHeld = false;
  let extension = 0.5;
  const PUMP_GAIN = 0.012;
  const HALF_LIFE_MS = 1400;

  // Space simulates one pump stroke per press: pressure eases up to a target
  // over a short natural swell, then leaks away via the same decay a drag
  // uses -- even if Space is still held down. Only a fresh press (not the
  // hold) starts another swell, same as a hand has to lift and push again.
  const PUMP_STEP = 0.55;
  const PUMP_RAMP_MS = 260;
  let pumpRampActive = false;
  let pumpRampStart = 0;
  let pumpRampFrom = 0;
  let pumpRampTo = 0;
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const setPleats = (ext: number) => {
    const pleats = bellows.querySelectorAll<HTMLElement>(".pleat");
    pleats.forEach((pleat, i) => {
      const spread = 0.3 + ext * 0.7;
      pleat.style.transform = `scaleY(${spread})`;
      void i;
    });
  };
  setPleats(extension);

  bellows.addEventListener("pointerdown", (event) => {
    endIdle();
    bellows.setPointerCapture(event.pointerId);
    dragY = event.clientY;
  });

  bellows.addEventListener("pointermove", (event) => {
    if (dragY === null) return;
    const delta = event.clientY - dragY;
    dragY = event.clientY;
    pressure = Math.min(1, pressure + Math.abs(delta) * PUMP_GAIN);
    extension = Math.min(1, Math.max(0, extension + delta * 0.01));
    setPleats(extension);
    if (status) status.textContent = "Pumping";
  });

  function stopDrag() {
    dragY = null;
    if (status && !spaceHeld) status.textContent = "";
  }
  bellows.addEventListener("pointerup", stopDrag);
  bellows.addEventListener("pointercancel", stopDrag);

  let lastFrame = performance.now();
  const tick = (now: number) => {
    const dt = now - lastFrame;
    lastFrame = now;
    if (pumpRampActive) {
      const t = Math.min(1, (now - pumpRampStart) / PUMP_RAMP_MS);
      pressure = pumpRampFrom + (pumpRampTo - pumpRampFrom) * easeOutCubic(t);
      if (t >= 1) pumpRampActive = false;
    } else {
      pressure *= Math.pow(0.5, dt / HALF_LIFE_MS);
    }
    bellows.style.setProperty("--pressure", pressure.toFixed(3));
    if (dragY === null) {
      extension = pressure;
      setPleats(extension);
    }
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(pressure, audioCtx.currentTime, 0.02);
      voices.forEach((voice, inputKey) => {
        const freq = keyByInputKey.get(inputKey)?.freq ?? 0;
        voice.body.frequency.setTargetAtTime(freq * (2 + pressure * 4), audioCtx!.currentTime, 0.05);
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // --- Keyboard + pointer/touch input for the keys, Space for the bellows ---
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) {
        endIdle();
        spaceHeld = true;
        pumpRampFrom = pressure;
        pumpRampTo = Math.min(1, pressure + PUMP_STEP);
        pumpRampStart = performance.now();
        pumpRampActive = true;
        if (status) status.textContent = "Pumping";
      }
      return;
    }
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (keyByInputKey.has(key)) pressKey(key);
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      spaceHeld = false;
      if (status && dragY === null) status.textContent = "";
      return;
    }
    const key = event.key.toLowerCase();
    if (keyByInputKey.has(key)) releaseKey(key);
  });

  keysEl.querySelectorAll<HTMLElement>(".key").forEach((el) => {
    const entry = [...keyByInputKey.entries()].find(([, v]) => v.el === el);
    if (!entry) return;
    const [inputKey] = entry;
    el.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      pressKey(inputKey);
    });
    el.addEventListener("pointerup", () => releaseKey(inputKey));
    el.addEventListener("pointercancel", () => releaseKey(inputKey));
  });
}
