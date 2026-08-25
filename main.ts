// Harmonium: a hand-pumped free-reed keyboard. A reed only sounds while air
// moves through it, so a key makes a tone only while it is held AND the
// bellows has air in it -- drag the bellows (any direction) to pump air in;
// it bleeds away on its own, same as the real instrument once you stop.
const instrument = document.getElementById("instrument");
const bellows = document.getElementById("bellows");
const keysEl = document.getElementById("keys");
const status = document.getElementById("status");

if (instrument && bellows && keysEl) {
  // Madhya saptak (middle octave). A harmonium is a fixed-pitch keyboard, so
  // unlike a voice it can't bend to the microtonal srutis of raga theory --
  // it's built and tuned to plain 12-TET against a reference pitch, same as
  // a piano. Sa is set here at concert pitch (C4, A4 = 440 Hz).
  const SA_HZ = 261.6256;
  const cents = (c: number) => SA_HZ * Math.pow(2, c / 1200);

  const WHITE = [
    { note: "Sa", key: "z", cents: 0 },
    { note: "Re", key: "x", cents: 200 },
    { note: "Ga", key: "c", cents: 400 },
    { note: "Ma", key: "v", cents: 500 },
    { note: "Pa", key: "b", cents: 700 },
    { note: "Dha", key: "n", cents: 900 },
    { note: "Ni", key: "m", cents: 1100 },
    { note: "Sa'", key: ",", cents: 1200 },
  ];
  const BLACK = [
    { note: "re", key: "s", cents: 100, afterWhite: 0 },
    { note: "ga", key: "d", cents: 300, afterWhite: 1 },
    { note: "ma'", key: "g", cents: 600, afterWhite: 3 },
    { note: "dha", key: "h", cents: 800, afterWhite: 4 },
    { note: "ni", key: "j", cents: 1000, afterWhite: 5 },
  ];

  const whiteWidth = 100 / WHITE.length;
  const blackWidth = whiteWidth * 0.62;

  const keyByInputKey = new Map<string, { el: HTMLElement; freq: number }>();

  WHITE.forEach((w, i) => {
    const el = document.createElement("div");
    el.className = "key white";
    el.style.left = `${i * whiteWidth}%`;
    el.style.width = `${whiteWidth}%`;
    keysEl.appendChild(el);
    keyByInputKey.set(w.key, { el, freq: cents(w.cents) });
  });
  BLACK.forEach((b) => {
    const el = document.createElement("div");
    el.className = "key black";
    el.style.left = `${(b.afterWhite + 1) * whiteWidth - blackWidth / 2}%`;
    el.style.width = `${blackWidth}%`;
    keysEl.appendChild(el);
    keyByInputKey.set(b.key, { el, freq: cents(b.cents) });
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
  let spacePumpTimer = 0;
  let extension = 0.5;
  const PUMP_GAIN = 0.012;
  const HALF_LIFE_MS = 1400;
  // Space simulates a hand pumping the bellows: each stroke shoves in a slug
  // of air that immediately starts leaking away via the same decay as a drag,
  // rather than holding Space acting like a tap you can just leave open.
  const SPACE_PUMP_INTERVAL_MS = 380;
  const SPACE_PUMP_STEP = 0.35;

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
    pressure *= Math.pow(0.5, dt / HALF_LIFE_MS);
    if (spaceHeld) {
      spacePumpTimer += dt;
      if (spacePumpTimer >= SPACE_PUMP_INTERVAL_MS) {
        spacePumpTimer -= SPACE_PUMP_INTERVAL_MS;
        pressure = Math.min(1, pressure + SPACE_PUMP_STEP);
      }
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
        spacePumpTimer = 0;
        pressure = Math.min(1, pressure + SPACE_PUMP_STEP);
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
