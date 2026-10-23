// Validates the Schema.org structured data the vertical landing pages
// emit, by transpiling the real data file and rebuilding the same
// @graph that VerticalLandingPage.tsx renders.
//
// Checks, in order of how badly each would hurt:
//   1. The whole document round-trips through JSON — this is what
//      dangerouslySetInnerHTML ships, so a serialization failure means
//      a broken script tag on a live page.
//   2. No literal "</script>" in any string, which would close the
//      JSON-LD tag early and spill markup into the page.
//   3. Service and BreadcrumbList have their required fields, and
//      breadcrumb positions are sequential.
//   4. FAQPage answers are non-empty, unique, and self-contained.
//      Google requires FAQPage markup to match visible page content;
//      "see above" in structured data is both a policy problem and
//      useless to an answer engine quoting a single Q&A.
//   5. No aggregateRating/ratingValue/reviewCount anywhere in static
//      markup. Ratings must come only from the live Google Places data
//      (GoogleReviews / GoogleRatingChip), never a literal that can
//      silently go stale.
//   6. The sitemap's VERTICAL_SLUGS and the landing data agree in both
//      directions. A slug in the sitemap with no landing entry renders
//      a redirect to "/", which would put a soft 404 in the sitemap and
//      make the prerenderer bake the homepage into that URL.
//
// Run: npm run validate:schema   (from client/)

import esbuild from 'esbuild';
import { writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = await esbuild.build({
  entryPoints: [new URL('../src/data/verticalLandings.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const tmp = join(tmpdir(), 'tsb-verticals-validate.mjs');
writeFileSync(tmp, out.outputFiles[0].text);
const { VERTICAL_LANDINGS } = await import(tmp);

const AREA = ['Fairburn','Fayetteville','Peachtree City','Tyrone','Newnan','Union City','College Park','Atlanta'];
let problems = [], totalFaqs = 0;

for (const v of VERTICAL_LANDINGS) {
  const url = `https://tshirtbrothers.com/shirts-for/${v.slug}`;
  const graph = [
    { '@type':'Service', '@id':`${url}#service`, name:`Custom ${v.name}`, serviceType:v.name,
      description:v.heroLine, url, provider:{'@id':'https://tshirtbrothers.com/#business'},
      areaServed: AREA.map(n=>({'@type':'City',name:n,containedInPlace:{'@type':'State',name:'Georgia'}})) },
    { '@type':'BreadcrumbList', '@id':`${url}#breadcrumbs`, itemListElement:[
      {'@type':'ListItem',position:1,name:'Home',item:'https://tshirtbrothers.com/'},
      {'@type':'ListItem',position:2,name:'Services',item:'https://tshirtbrothers.com/services'},
      {'@type':'ListItem',position:3,name:v.name,item:url}]},
    ...(v.faqs?.length ? [{'@type':'FAQPage','@id':`${url}#faq`,
      mainEntity: v.faqs.map(f=>({'@type':'Question',name:f.q,acceptedAnswer:{'@type':'Answer',text:f.a}}))}] : []),
  ];
  const doc = { '@context':'https://schema.org', '@graph': graph };

  // 1. must round-trip as JSON (this is what dangerouslySetInnerHTML ships)
  let reparsed;
  try { reparsed = JSON.parse(JSON.stringify(doc)); }
  catch (e) { problems.push(`${v.slug}: JSON serialization failed — ${e.message}`); continue; }

  // 2. a literal "</script>" in any string would break out of the tag
  const raw = JSON.stringify(doc);
  if (/<\/script/i.test(raw)) problems.push(`${v.slug}: contains </script> — would break the JSON-LD tag`);

  // 3. required fields
  const svc = reparsed['@graph'][0];
  for (const k of ['name','serviceType','description','url','provider','areaServed'])
    if (!svc[k]) problems.push(`${v.slug}: Service missing ${k}`);
  const bc = reparsed['@graph'][1];
  if (bc.itemListElement.length !== 3) problems.push(`${v.slug}: breadcrumb length`);
  bc.itemListElement.forEach((li,i)=>{ if(li.position!==i+1) problems.push(`${v.slug}: breadcrumb position`); });

  // 4. FAQPage policy: non-empty, unique, self-contained answers
  const faq = reparsed['@graph'].find(n=>n['@type']==='FAQPage');
  if (faq) {
    totalFaqs += faq.mainEntity.length;
    const seen = new Set();
    for (const q of faq.mainEntity) {
      if (!q.name?.trim()) problems.push(`${v.slug}: empty question`);
      const a = q.acceptedAnswer?.text || '';
      if (a.trim().length < 40) problems.push(`${v.slug}: answer too thin — "${q.name}"`);
      if (/\bsee above\b|\bas mentioned\b/i.test(a)) problems.push(`${v.slug}: answer not self-contained — "${q.name}"`);
      if (seen.has(q.name)) problems.push(`${v.slug}: duplicate question — "${q.name}"`);
      seen.add(q.name);
    }
  }

  // 5. no fabricated ratings anywhere in the markup
  if (/aggregateRating|reviewCount|ratingValue/.test(raw))
    problems.push(`${v.slug}: contains a rating in static markup`);

  const types = reparsed['@graph'].map(n=>n['@type']).join(' + ');
  console.log(`  ${v.slug.padEnd(18)} ${types}${faq?` (${faq.mainEntity.length} Q)`:''}`);
}

// cross-page: slugs unique, and sitemap list matches the data file
const slugs = VERTICAL_LANDINGS.map(v=>v.slug);
if (new Set(slugs).size !== slugs.length) problems.push('duplicate slugs in VERTICAL_LANDINGS');

const sitemapSrc = readFileSync(new URL('../../server/routes/sitemap.js', import.meta.url).pathname, 'utf8');
const listed = [...sitemapSrc.match(/const VERTICAL_SLUGS = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
for (const s of listed) if (!slugs.includes(s)) problems.push(`sitemap lists '${s}' but no landing exists -> soft 404`);
for (const s of slugs) if (!listed.includes(s)) problems.push(`landing '${s}' missing from sitemap VERTICAL_SLUGS`);

console.log(`\n${VERTICAL_LANDINGS.length} verticals, ${totalFaqs} FAQ entries, sitemap list ${listed.length} slugs`);
if (problems.length) { console.error('\nPROBLEMS:'); problems.forEach(p=>console.error('  - '+p)); process.exit(1); }
console.log('\nAll structured data valid: serializes, required fields present, no fabricated ratings, sitemap in sync.');
