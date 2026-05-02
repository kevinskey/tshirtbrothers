/** XML escaping for <attribute="..."> values. Used by SVG export helpers. */
export function escapeXmlAttr(s: string): string {
  return s.replace(/[<>&"]/g, (c) =>
    c === '<' ? '&lt;'
    : c === '>' ? '&gt;'
    : c === '&' ? '&amp;'
    : '&quot;');
}
