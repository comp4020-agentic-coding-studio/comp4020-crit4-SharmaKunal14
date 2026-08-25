// Harmonium: a hand-pumped free-reed keyboard. A reed only sounds while air
// moves through it, so a key makes a tone only while it is held AND the
// bellows has air in it -- drag the bellows (any direction) to pump air in;
// it bleeds away on its own, same as the real instrument once you stop.
const instrument = document.getElementById("instrument");
const bellows = document.getElementById("bellows");
const keysEl = document.getElementById("keys");
const status = document.getElementById("status");

if (instrument && bellows && keysEl) {
  const C4 = 261.6256;
  const semitone = (n: number) => C4 * Math.pow(2, n / 12);

  const WHITE = [
    { note: "Sa", key: "z", semitone: 0 },
    { note: "Re", key: "x", semitone: 2 },
    { note: "Ga", key: "c", semitone: 4 },
    { note: "Ma", key: "v", semitone: 5 },
    { note: "Pa", key: "b", semitone: 7 },
    { note: "Dha", key: "n", semitone: 9 },
    { note: "Ni", key: "m", semitone: 11 },
    { note: "Sa'", key: ",", semitone: 12 },
  ];
  const BLACK = [
    { note: "re", key: "s", semitone: 1, afterWhite: 0 },
    { note: "ga", key: "d", semitone: 3, afterWhite: 1 },
    { note: "ma'", key: "g", semitone: 6, afterWhite: 3 },
    { note: "dha", key: "h", semitone: 8, afterWhite: 4 },
    { note: "ni", key: "j", semitone: 10, afterWhite: 5 },
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
    keyByInputKey.set(w.key, { el, freq: semitone(w.semitone) });
  });
  BLACK.forEach((b) => {
    const el = document.createElement("div");
    el.className = "key black";
    el.style.left = `${(b.afterWhite + 1) * whiteWidth - blackWidth / 2}%`;
    el.style.width = `${blackWidth}%`;
    keysEl.appendChild(el);
    keyByInputKey.set(b.key, { el, freq: semitone(b.semitone) });
  });

  // --- Audio: sawtooth reed through a resonant body filter, gated by a
  // single master gain that tracks bellows pressure ---
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

  type Voice = { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };
  const voices = new Map<string, Voice>();

  function pressKey(inputKey: string) {
    const target = keyByInputKey.get(inputKey);
    if (!target || voices.has(inputKey)) return;
    const { ctx, master } = ensureAudio();

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = target.freq;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = target.freq * 2.2;
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.012);

    osc.connect(filter).connect(gain).connect(master);
    osc.start();

    voices.set(inputKey, { osc, filter, gain });
    target.el.classList.add("active");
  }

  function releaseKey(inputKey: string) {
    const voice = voices.get(inputKey);
    const target = keyByInputKey.get(inputKey);
    if (!voice || !audioCtx) return;
    voice.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.015);
    voice.osc.stop(audioCtx.currentTime + 0.08);
    voices.delete(inputKey);
    target?.el.classList.remove("active");
  }

  // --- Bellows: drag (any direction) pumps pressure in; it decays on its
  // own. The pleats compress/expand with the raw drag; the glow behind them
  // (see styles.css --pressure) tracks the decaying pressure value. ---
  let pressure = 0;
  let dragY: number | null = null;
  let extension = 0.5;
  const PUMP_GAIN = 0.012;
  const HALF_LIFE_MS = 1400;

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
    if (status) status.textContent = "";
  }
  bellows.addEventListener("pointerup", stopDrag);
  bellows.addEventListener("pointercancel", stopDrag);

  let lastFrame = performance.now();
  const tick = (now: number) => {
    const dt = now - lastFrame;
    lastFrame = now;
    pressure *= Math.pow(0.5, dt / HALF_LIFE_MS);
    bellows.style.setProperty("--pressure", pressure.toFixed(3));
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(pressure, audioCtx.currentTime, 0.02);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // --- Keyboard + pointer/touch input for the keys ---
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (keyByInputKey.has(key)) pressKey(key);
  });
  window.addEventListener("keyup", (event) => {
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
