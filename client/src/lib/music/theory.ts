// Music-theory primitives for the sight-reading trainer.
//
// Everything here is pure + framework-free so it can be unit-reasoned
// about in isolation. The trainer only deals in natural (white-key)
// notes, which is the standard scope for a note-naming exercise, so we
// model pitch as a "diatonic value": a single integer that increases by
// one for every letter step (C, D, E, F, G, A, B) and wraps every
// octave. That makes vertical staff placement a trivial subtraction.

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export const LETTERS: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Semitone offset of each letter within its octave — used only to derive
// a frequency for audio playback (not for staff geometry).
const PITCH_CLASS: Record<Letter, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

const LETTER_INDEX: Record<Letter, number> = {
  C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6,
};

export interface Note {
  letter: Letter;
  /** Scientific-pitch octave. Middle C is C4. */
  octave: number;
}

/** Unique, monotonically increasing integer — 7 steps per octave. */
export function diatonic(n: Note): number {
  return n.octave * 7 + LETTER_INDEX[n.letter];
}

export function noteFromDiatonic(d: number): Note {
  const octave = Math.floor(d / 7);
  const idx = ((d % 7) + 7) % 7;
  return { letter: LETTERS[idx]!, octave };
}

/** MIDI note number (C4 = 60). */
export function midi(n: Note): number {
  return (n.octave + 1) * 12 + PITCH_CLASS[n.letter];
}

/** Equal-temperament frequency in Hz (A4 = 440). */
export function frequency(n: Note): number {
  return 440 * Math.pow(2, (midi(n) - 69) / 12);
}

export function noteId(n: Note): string {
  return `${n.letter}${n.octave}`;
}

export function parseNote(id: string): Note {
  const m = id.match(/^([A-G])(-?\d+)$/);
  if (!m) throw new Error(`bad note id: ${id}`);
  return { letter: m[1] as Letter, octave: parseInt(m[2]!, 10) };
}

// --- Clefs -----------------------------------------------------------

export type ClefName = 'treble' | 'bass' | 'alto';

export interface Clef {
  name: ClefName;
  label: string;
  /** Unicode Musical-Symbol glyph (rendered via the Noto Music font). */
  glyph: string;
  /** Diatonic value of the note sitting on the centre (3rd) staff line. */
  middleLineDiatonic: number;
  /**
   * Fine vertical nudge for the glyph, in staff-spaces, so the clef art
   * lines up with the staff. Tuned for Noto Music's metrics.
   */
  glyphOffset: number;
  /** Glyph height as a multiple of the staff height (4 spaces). */
  glyphScale: number;
}

export const CLEFS: Record<ClefName, Clef> = {
  treble: {
    name: 'treble', label: 'Treble', glyph: '\u{1D11E}',
    middleLineDiatonic: diatonic({ letter: 'B', octave: 4 }), // 34
    glyphOffset: 0.55, glyphScale: 1.9,
  },
  bass: {
    name: 'bass', label: 'Bass', glyph: '\u{1D122}',
    middleLineDiatonic: diatonic({ letter: 'D', octave: 3 }), // 22
    glyphOffset: -0.5, glyphScale: 1.05,
  },
  alto: {
    name: 'alto', label: 'Alto', glyph: '\u{1D121}',
    middleLineDiatonic: diatonic({ letter: 'C', octave: 4 }), // 28
    glyphOffset: 0, glyphScale: 1.0,
  },
};

export const CLEF_NAMES: ClefName[] = ['treble', 'bass', 'alto'];

/**
 * Vertical position of a note as "steps" from the middle staff line,
 * positive pointing up. Each step is half a staff-space (a line OR a
 * space). The five staff lines sit at steps -4, -2, 0, +2, +4.
 */
export function stepsFromMiddle(n: Note, clef: Clef): number {
  return diatonic(n) - clef.middleLineDiatonic;
}

/**
 * Even step positions where ledger lines must be drawn for a note that
 * sits outside the staff (|step| > 4). Returns an empty array for notes
 * on or within the staff.
 */
export function ledgerSteps(step: number): number[] {
  const out: number[] = [];
  if (step >= 6) for (let s = 6; s <= step; s += 2) out.push(s);
  if (step <= -6) for (let s = -6; s >= step; s -= 2) out.push(s);
  return out;
}

// --- Difficulty / note pools ----------------------------------------

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'easy', label: 'Easy', hint: 'Notes on the staff' },
  { id: 'medium', label: 'Medium', hint: 'One ledger line' },
  { id: 'hard', label: 'Hard', hint: 'Wide range + ledgers' },
];

// Inclusive [low, high] note range per clef + difficulty.
const RANGES: Record<ClefName, Record<Difficulty, [string, string]>> = {
  treble: { easy: ['E4', 'F5'], medium: ['C4', 'A5'], hard: ['A3', 'C6'] },
  bass:   { easy: ['G2', 'A3'], medium: ['E2', 'C4'], hard: ['C2', 'E4'] },
  alto:   { easy: ['F3', 'G4'], medium: ['D3', 'B4'], hard: ['A2', 'D5'] },
};

/** Every natural note (inclusive) for a clef + difficulty. */
export function notePool(clef: ClefName, difficulty: Difficulty): Note[] {
  const [lo, hi] = RANGES[clef][difficulty];
  const min = diatonic(parseNote(lo));
  const max = diatonic(parseNote(hi));
  const pool: Note[] = [];
  for (let d = min; d <= max; d++) pool.push(noteFromDiatonic(d));
  return pool;
}

/** Pick a random note, avoiding an immediate repeat of `avoid`. */
export function randomNote(pool: Note[], avoid?: Note): Note {
  if (pool.length <= 1) return pool[0]!;
  let pick: Note;
  do {
    pick = pool[Math.floor(Math.random() * pool.length)]!;
  } while (avoid && noteId(pick) === noteId(avoid));
  return pick;
}
