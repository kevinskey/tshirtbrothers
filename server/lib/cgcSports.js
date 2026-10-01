// Custom Gift Club sport/activity classifier. Like cgcCategories.js, this is
// derived from product names because jds_products carries no attributes — but
// unlike category it is OPTIONAL and MULTI-VALUED: most of the catalog has no
// sport at all (plain crystal, plaques, blank medals), and a few items legitimately
// serve two ("Baseball/Softball Glove Resin"), so the column is text[] and an
// unmatched product gets an empty array rather than a catch-all bucket.
//
// Measured against the live catalog on 2026-10-01: 224 of 1,055 Awards & Trophies
// SKUs carry a recognizable sport. The filter is therefore shown only when the
// current result set actually contains sports.

export const CGC_SPORTS = [
  'Baseball',
  'Basketball',
  'Bowling',
  'Cheer & Dance',
  'Football',
  'Golf',
  'Hockey',
  'Lacrosse',
  'Martial Arts',
  'Music & Band',
  'Pickleball',
  'Racing',
  'Soccer',
  'Softball',
  'Swimming',
  'Tennis',
  'Track & Field',
  'Volleyball',
  'Wrestling',
  'Academic',
  'Military & Service',
];

// Ordered only for readability — every rule is evaluated, since a product may
// carry more than one sport. Terms are word-boundary matched.
const RULES = [
  ['Baseball', ['baseball', 'home run', 'batter']],
  ['Basketball', ['basketball', 'hoops']],
  ['Bowling', ['bowling', 'bowler', 'strike pin']],
  ['Cheer & Dance', ['cheer', 'cheerleading', 'cheerleader', 'dance', 'dancer', 'pom pom', 'ballet']],
  ['Football', ['football', 'touchdown', 'gridiron']],
  ['Golf', ['golf', 'golfer', 'golfing']],
  ['Hockey', ['hockey', 'puck']],
  ['Lacrosse', ['lacrosse']],
  ['Martial Arts', ['martial arts', 'karate', 'taekwondo', 'tae kwon do', 'judo', 'jiu jitsu']],
  ['Music & Band', ['music', 'musical', 'band', 'guitar', 'treble clef', 'marching']],
  ['Pickleball', ['pickleball']],
  // "race"/"racing" only — "racer back" is apparel and "bracelet" must not hit.
  ['Racing', ['racing', 'race', 'motocross', 'checkered flag', 'piston', 'car show']],
  ['Soccer', ['soccer', 'futbol']],
  ['Softball', ['softball']],
  ['Swimming', ['swimming', 'swimmer', 'swim', 'diving']],
  ['Tennis', ['tennis']],
  ['Track & Field', ['track', 'cross country', 'runner', 'running', 'hurdles', 'field events']],
  ['Volleyball', ['volleyball']],
  ['Wrestling', ['wrestling', 'wrestler']],
  ['Academic', ['academic', 'scholar', 'scholastic', 'spelling bee', 'honor roll', 'graduate',
    'graduation', 'debate', 'chess', 'science fair', 'math']],
  ['Military & Service', ['military', 'veteran', 'armed forces', 'firefighter', 'police',
    'first responder', 'eagle and flag']],
];

const MATCHERS = RULES.map(([sport, terms]) => ({
  sport,
  res: terms.map((t) => new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`, 'i')),
}));

// A "Female Bicycle Kick Soccer" figure is soccer, not cycling; a "Soccer Mom"
// tumbler is still soccer. Anything genuinely ambiguous simply gets no sport —
// an empty list is a better answer than a wrong one, because a shopper who
// filters to Soccer should never be shown a plain crystal cube.
export function sportsForCgcProduct(name) {
  const text = String(name || '');
  const found = [];
  for (const { sport, res } of MATCHERS) {
    if (res.some((re) => re.test(text)) && !found.includes(sport)) found.push(sport);
  }
  return found;
}
