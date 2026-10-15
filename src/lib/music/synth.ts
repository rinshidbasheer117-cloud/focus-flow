/** Browser WebAudio loop generator — the only real playback source in Phase 1. */
export interface SynthSpec { bpm: number; energy: "low" | "medium" | "high"; style: "house" | "techno" | "trance" | "ambient"; root: number; }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0;
let spec: SynthSpec | null = null;

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const getAnalyser = () => analyser;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) throw new Error("Web Audio is not supported in this browser.");
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.45;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 64;
  master.connect(analyser);
  analyser.connect(ctx.destination);
  return ctx;
}

function env(node: GainNode, t: number, peak: number, dur: number) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function kick(t: number) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  env(g, t, 0.9, 0.3);
  o.connect(g).connect(master!);
  o.start(t); o.stop(t + 0.32);
}
let noise: AudioBuffer | null = null;
function hat(t: number, vol: number) {
  const c = ctx!;
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate * 0.1, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise; f.type = "highpass"; f.frequency.value = 7000;
  env(g, t, vol, 0.05);
  s.connect(f).connect(g).connect(master!);
  s.start(t); s.stop(t + 0.06);
}
function tone(t: number, midi: number, dur: number, vol: number, type: OscillatorType, cutoff: number) {
  const c = ctx!, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
  o.type = type; o.frequency.value = hz(midi);
  f.type = "lowpass"; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.05, dur / 4));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(master!);
  o.start(t); o.stop(t + dur + 0.02);
}

function play(i: number, t: number) {
  const s = spec!, beat = 60 / s.bpm, prog = [0, 5, 3, 7][Math.floor(i / 16) % 4];
  const drums = s.style !== "ambient";
  if (drums && i % 4 === 0) kick(t);
  if (drums && i % 4 === 2) hat(t, s.energy === "high" ? 0.22 : 0.14);
  if (drums && s.energy === "high" && i % 2 === 1) hat(t, 0.05);
  if (drums && i % 4 === 2) tone(t, s.root + prog - 12, beat / 2, 0.25, "sawtooth", s.style === "techno" ? 500 : 900);
  if (s.style === "trance" && i % 2 === 0) tone(t, s.root + prog + 12 + [0, 7, 12, 7][(i / 2) % 4], beat / 3, 0.06, "square", 2500);
  if (i % 16 === 0) [0, 3, 7].forEach((n) => tone(t, s.root + prog + 12 + n, beat * 4, s.style === "ambient" ? 0.09 : 0.04, "triangle", 1800));
}

function schedule() {
  if (!ctx || !spec) return;
  const sixteenth = 60 / spec.bpm / 4;
  while (nextTime < ctx.currentTime + 0.12) {
    play(step, nextTime);
    nextTime += sixteenth;
    step = (step + 1) % 64;
  }
}

export async function startSynth(s: SynthSpec) {
  stopSynth();
  const c = ensure();
  await c.resume();
  spec = s; step = 0; nextTime = c.currentTime + 0.05;
  timer = setInterval(schedule, 25);
}
export function stopSynth() {
  if (timer) clearInterval(timer);
  timer = null; spec = null;
}
export function chime() {
  try {
    const c = ensure();
    void c.resume();
    const t = c.currentTime;
    [72, 76, 79].forEach((m, i) => tone(t + i * 0.12, m, 0.5, 0.12, "sine", 4000));
  } catch { /* audio unavailable */ }
}
