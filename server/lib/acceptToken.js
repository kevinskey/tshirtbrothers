// Accept tokens are bare hex (crypto.randomBytes().toString('hex')), but the
// links that carry them travel through corporate mail scanners and chat apps
// that tack punctuation onto URLs — quote #221's customer arrived with
// `token=<hex>?` and every attempt 403'd. Strip anything that can't be part
// of a token before comparing, so a mangled-but-genuine link still works.
export function tokenMatches(stored, supplied) {
  if (!stored || !supplied) return false;
  const clean = String(supplied).replace(/[^0-9a-f]+$/i, '');
  return clean === stored;
}
