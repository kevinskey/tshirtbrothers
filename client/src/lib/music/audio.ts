// Tiny Web Audio wrapper for playing a single pitch. Kept separate from
// the React tree so the AudioContext is a lazily-created singleton — the
// browser only lets us create/resume one after a user gesture, which the
// first button click satisfies.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/**
 * Play a pitch with a soft, organ-ish timbre and a gentle attack/decay
 * envelope so it doesn't click. `freq` in Hz, `duration` in seconds.
 */
export function playFrequency(freq: number, duration = 0.85): void {
  const ac = getCtx();
  if (!ac) return;

  const now = ac.currentTime;
  const master = ac.createGain();
  master.connect(ac.destination);

  // Fundamental + a quiet octave partial for a fuller tone.
  const partials: { mult: number; type: OscillatorType; level: number }[] = [
    { mult: 1, type: 'triangle', level: 0.6 },
    { mult: 2, type: 'sine', level: 0.18 },
  ];

  for (const p of partials) {
    const osc = ac.createOscillator();
    osc.type = p.type;
    osc.frequency.value = freq * p.mult;
    const g = ac.createGain();
    g.gain.value = p.level;
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.35, now + 0.02);
  master.gain.setValueAtTime(0.35, now + duration * 0.6);
  master.gain.exponentialRampToValueAtTime(0.001, now + duration);
}

/** Short feedback blip — rising for correct, falling for wrong. */
export function playFeedback(correct: boolean): void {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(correct ? 660 : 330, now);
  osc.frequency.exponentialRampToValueAtTime(correct ? 990 : 220, now + 0.16);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(g).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}
