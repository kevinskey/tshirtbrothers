// Shared intake normalization: retain explicit locations and every mockup
// without deriving print locations from the number/order of uploaded files.
export function isValidNeedByDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const placements = ['front', 'back', 'left_sleeve', 'right_sleeve'];
const safeUrl = (url) => {
  try { return typeof url === 'string' && new URL(url).protocol === 'https:'; }
  catch { return false; }
};
export function normalizeArtworkPlacements(value) {
  return Array.isArray(value) ? value.filter(a => a && safeUrl(a.url) && placements.includes(a.placement))
    .map(({ url, placement }) => ({ url, placement })) : [];
}
export function normalizeMockups(value) {
  return Array.isArray(value) ? value.filter(m => m && safeUrl(m.url) && placements.includes(m.placement))
    .map(({ url, placement }) => ({ url, placement })) : [];
}
export function printAreasFor(inputs = {}, artwork) {
  const areas = new Set(normalizeArtworkPlacements(artwork).map(a => a.placement));
  for (const [location, selected] of Object.entries(inputs.locations || {})) {
    if (selected && [...placements, 'sleeve'].includes(location)) areas.add(location);
  }
  return [...areas];
}
