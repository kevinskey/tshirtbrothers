// Keep templated titles and descriptions inside what Google shows.
//
// SEO audit 2026-11-20: 30 titles ran past 60 characters and ~25
// descriptions past 160, all from two template habits — a fixed
// "· TShirt Brothers" suffix (~18 chars) and a location line appended to copy
// that was already at the limit, so the price survived and "Fairburn" was cut.
// These helpers add the optional parts only when they fit.

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;
const BRAND = ' | TShirt Brothers';

/** Appends the brand only when the full title still fits. */
export function fitTitle(core: string): string {
  return core.length + BRAND.length <= TITLE_MAX ? core + BRAND : core;
}

/** Appends `extra` only when the full description still fits. */
export function fitDescription(core: string, extra = ''): string {
  return extra && core.length + extra.length <= DESCRIPTION_MAX ? core + extra : core;
}
