// Strand: a one-string instrument. Dragging or tapping across the glowing
// bar bends pitch continuously; pressing a home-row key plucks one of the
// eight notes the bar quietly marks. Both paths share the same pitch line,
// so pointer and keyboard are two ways to play the same mechanic.
const strand = document.getElementById("strand");
const status = document.getElementById("status");

if (strand) {
  const NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
  const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];
  const MIN_FREQ = NOTES[0];
  const MAX_FREQ = NOTES[NOTES.length - 1];

  const glow = document.createElement("div");
  glow.id = "glow";
  strand.appendChild(glow);

  const dots = NOTES.map((_, i) => {
    const dot = document.createElement("div");
    dot.className = "note-dot";
    dot.style.left = `${((i + 0.5) / NOTES.length) * 100}%`;
    strand.appendChild(dot);
    return dot;
  });

  let audioCtx: AudioContext | null = null;
  const master = { gain: null as GainNode | null };

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.9;
      gain.connect(audioCtx.destination);
      master.gain = gain;
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  }

  function freqFromX(fraction: number) {
    const clamped = Math.min(1, Math.max(0, fraction));
    return MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, clamped);
  }

  function nearestDotIndex(freq: number) {
    let best = 0;
    let bestDist = Infinity;
    NOTES.forEach((n, i) => {
      const dist = Math.abs(Math.log(n / freq));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return { index: best, closeness: Math.max(0, 1 - bestDist / 0.15) };
  }

  function lightNearest(freq: number) {
    const { index, closeness } = nearestDotIndex(freq);
    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === index && closeness > 0.35);
    });
  }

  type Voice = { osc: OscillatorNode; gain: GainNode };
  const voices = new Map<string | number, Voice>();

  function startVoice(id: string | number, freq: number, volume: number) {
    const ctx = ensureAudio();
    if (!master.gain) return;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.03);
    osc.connect(gain).connect(master.gain);
    osc.start();
    voices.set(id, { osc, gain });
  }

  function updateVoice(id: string | number, freq: number, volume: number) {
    const voice = voices.get(id);
    if (!voice || !audioCtx) return;
    voice.osc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.01);
    voice.gain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.02);
  }

  function stopVoice(id: string | number) {
    const voice = voices.get(id);
    if (!voice || !audioCtx) return;
    const { osc, gain } = voice;
    gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.08);
    osc.stop(audioCtx.currentTime + 0.4);
    voices.delete(id);
  }

  function pointerToState(event: PointerEvent) {
    const rect = strand!.getBoundingClientRect();
    const xFraction = (event.clientX - rect.left) / rect.width;
    const yFraction = (event.clientY - rect.top) / rect.height;
    const freq = freqFromX(xFraction);
    const volume = 0.08 + (1 - Math.min(1, Math.max(0, yFraction))) * 0.22;
    return { freq, volume, xFraction: Math.min(1, Math.max(0, xFraction)) };
  }

  strand.addEventListener("pointerdown", (event) => {
    strand.setPointerCapture(event.pointerId);
    const { freq, volume, xFraction } = pointerToState(event);
    startVoice(event.pointerId, freq, volume);
    glow.style.left = `${xFraction * 100}%`;
    glow.style.transform = "translate(-50%, -50%) scale(1)";
    lightNearest(freq);
    if (status) status.textContent = "Playing";
  });

  strand.addEventListener("pointermove", (event) => {
    if (!voices.has(event.pointerId)) return;
    const { freq, volume, xFraction } = pointerToState(event);
    updateVoice(event.pointerId, freq, volume);
    glow.style.left = `${xFraction * 100}%`;
    lightNearest(freq);
  });

  function releasePointer(event: PointerEvent) {
    if (!voices.has(event.pointerId)) return;
    stopVoice(event.pointerId);
    glow.style.transform = "translate(-50%, -50%) scale(0)";
    dots.forEach((dot) => dot.classList.remove("active"));
    if (status) status.textContent = "";
  }

  strand.addEventListener("pointerup", releasePointer);
  strand.addEventListener("pointercancel", releasePointer);

  const heldKeys = new Set<string>();

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const index = KEYS.indexOf(key);
    if (index === -1 || heldKeys.has(key)) return;
    heldKeys.add(key);
    const freq = NOTES[index];
    startVoice(`key-${key}`, freq, 0.22);
    dots[index]?.classList.add("active");
    if (status) status.textContent = "Playing";
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (!heldKeys.has(key)) return;
    heldKeys.delete(key);
    stopVoice(`key-${key}`);
    const index = KEYS.indexOf(key);
    dots[index]?.classList.remove("active");
    if (status) status.textContent = "";
  });
}
