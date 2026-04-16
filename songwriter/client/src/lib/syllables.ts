// Lightweight syllable estimator — English only, no dependencies.
// Not perfect (no language is), but good enough for songwriters eyeballing meter.

const exceptions: Record<string, number> = {
  every: 2, different: 3, interesting: 3, family: 3, business: 2, literally: 3,
  chocolate: 2, comfortable: 3, vegetable: 3, camera: 3, favorite: 3,
};

function countOne(word: string): number {
  if (!word) return 0;
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return 0;
  if (exceptions[w]) return exceptions[w];

  // Strip trailing silent e (but not 'le' at end like "table" → 2)
  let s = w;
  if (s.endsWith('e') && !s.endsWith('le') && s.length > 2) s = s.slice(0, -1);

  // Count vowel groups
  const groups = s.match(/[aeiouy]+/g) || [];
  let count = groups.length;

  // Adjustments
  if (s.endsWith('le') && s.length > 2 && !'aeiouy'.includes(s[s.length - 3])) count += 1;
  if (count === 0) count = 1;
  return count;
}

export function countSyllables(line: string): number {
  if (!line) return 0;
  return line.split(/\s+/).filter(Boolean).reduce((sum, w) => sum + countOne(w), 0);
}
