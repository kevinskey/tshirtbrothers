// TSB seasonal/campaign template library. Thirty theme+content configs on
// top of ONE rendering engine (newsletterRender.js). A template is data,
// not code: theme tokens + sample block content. Creating a newsletter
// copies both into the newsletter row, so later library edits never touch
// past campaigns.
import { DEFAULT_THEME } from './newsletterRender.js';

const LOGO = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png';
const RED = '#ea580c'; // TSB brand orange

export const TEMPLATE_CATEGORIES = [
  'Seasonal', 'School', 'Cultural', 'Holiday', 'Community', 'Sports', 'Sales', 'Business', 'Customer Retention', 'General',
];

/**
 * Build the full 8-block layout from a compact spec. Header and footer are
 * brand-standard; everything else takes overrides so each template only
 * declares what makes it different.
 */
function blocksFrom(o) {
  let n = 0;
  const id = () => `blk-${++n}`;
  return [
    { id: id(), type: 'header', enabled: true, data: {
      logo_url: LOGO,
      company: 'T-SHIRT BROTHERS',
      subtitle: 'Best Printing. Best Service!',
      right_message: o.headerNote || 'People.\nShirts.\nCommunities.\nStronger Together.',
    } },
    { id: id(), type: 'hero', enabled: true, data: {
      eyebrow: o.eyebrow || 'SAME PEOPLE. BIGGER IDEAS.',
      headline: o.headline,
      highlight: o.highlight || '',
      body: o.body || '',
      image_url: '', image_alt: '',
      cta_label: o.cta || 'GET A QUICK QUOTE',
      cta_url: o.ctaUrl || '/quote',
      tagline: o.tagline || 'CUSTOM GEAR FOR THE MOMENTS THAT MATTER.',
      side_note: o.heroNote || '',
    } },
    { id: id(), type: 'events', enabled: o.events !== false, data: {
      title: o.eventsTitle || "WHAT'S COMING UP?",
      items: o.events || [],
      cta_label: o.eventsCta || 'PLAN YOUR ORDER',
      cta_url: '/quote',
      cta_note: o.eventsNote || 'BIG EVENTS. BIGGER MEMORIES.',
    } },
    { id: id(), type: 'products', enabled: true, data: {
      title: 'FEATURED PRODUCTS',
      items: o.products || [],
    } },
    { id: id(), type: 'didyouknow', enabled: true, data: {
      title: 'DID YOU KNOW?',
      items: o.services || [
        { icon: '🧵', title: 'Embroidery', url: '/services#embroidery' },
        { icon: '📄', title: 'DTF Transfers', url: '/dtf' },
        { icon: '👕', title: 'Custom Jerseys', url: '/shop?search=jersey' },
        { icon: '✏️', title: 'Design Help', url: '/design' },
        { icon: '📦', title: 'Bulk Orders', url: '/quote' },
      ],
      right_message: o.knowNote || 'Your Vision.\nOur Brotherly Support.',
    } },
    { id: id(), type: 'special', enabled: true, data: {
      headline: o.specialHeadline || 'PAST CUSTOMER',
      highlight: o.specialHighlight || 'Special',
      description: o.specialBody || 'Free basic artwork setup on qualifying orders placed this month.',
      image_url: '',
      cta_label: o.specialCta || 'CLAIM OFFER',
      cta_url: '/quote',
      note: o.specialNote || 'Thanks for being part of\nthe T-Shirt Brothers family!',
    } },
    { id: id(), type: 'closing', enabled: true, data: {
      headline: o.closingHeadline || 'WHAT ARE YOU PRINTING NEXT?',
      buttons: [
        { label: o.closing1 || 'QUICK QUOTE', url: '/quote' },
        { label: 'DESIGN STUDIO', url: '/design' },
      ],
      values: [
        { icon: '🏆', title: 'QUALITY APPAREL' },
        { icon: '🤝', title: 'REAL PEOPLE' },
        { icon: '❤️', title: 'STRONGER COMMUNITIES' },
      ],
    } },
    { id: id(), type: 'footer', enabled: true, data: {
      logo_url: LOGO,
      company: 'T-Shirt Brothers',
      tagline: 'Custom Apparel for a Brighter Tomorrow.',
      email: 'kevin@tshirtbrothers.com',
      phone: '(470) 622-1392',
      website: 'https://tshirtbrothers.com',
      address: '6010 Renaissance Pkwy, Fairburn, GA 30213',
      facebook: '', instagram: '', tiktok: '', youtube: '',
    } },
  ];
}

const shop = (cat) => `/shop?category=${encodeURIComponent(cat)}`;
const P = {
  tees: { name: 'Premium T-Shirts', description: 'Great for events and organizations', cta_label: 'Shop tees', cta_url: shop('T-Shirts') },
  hoodies: { name: 'Hoodies & Sweatshirts', description: 'Heavyweight comfort, printed or embroidered', cta_label: 'Shop hoodies', cta_url: shop('Fleece') },
  caps: { name: 'Embroidered Caps', description: 'Perfect for brands, teams, and staff', cta_label: 'Shop caps', cta_url: shop('Headwear') },
  polos: { name: 'Embroidered Polos', description: 'Sharp staff and ministry apparel', cta_label: 'Shop polos', cta_url: shop('Polos') },
  longsleeve: { name: 'Long-Sleeve Shirts', description: 'Cool-weather ready, full print area', cta_label: 'Shop long sleeves', cta_url: shop('T-Shirts') },
  jackets: { name: 'Jackets & Outerwear', description: 'Embroidered warmth for the whole crew', cta_label: 'Shop outerwear', cta_url: shop('Outerwear') },
  performance: { name: 'Performance Shirts', description: 'Light, breathable, event-day ready', cta_label: 'Shop performance', cta_url: shop('T-Shirts') },
};

// Each entry: meta + theme override + content spec (fed to blocksFrom).
const DEFS = [
  { slug: 'tsb-standard', name: 'TSB Standard', category: 'General', months: [1,2,3,4,5,6,7,8,9,10,11,12],
    description: 'General-purpose monthly customer newsletter in the core TSB look.',
    theme: {},
    content: {
      headline: 'FALL ORDERS', highlight: 'Start Now',
      body: 'Get custom shirts, hoodies, hats, and more for homecoming, reunions, churches, schools, teams, and businesses.',
      heroNote: 'Fall Looks\nBetter Together.',
      events: [
        { icon: '📣', title: 'Homecoming', description: 'Alumni shirts, class-year shirts, tailgate gear' },
        { icon: '🎃', title: 'Halloween', description: 'Event shirts, themed apparel, staff tees' },
        { icon: '🇺🇸', title: 'Veterans Day', description: 'Military appreciation and family shirts' },
        { icon: '⛪', title: 'Church & School Events', description: 'Program shirts, polos, and hoodies' },
      ],
      products: [P.tees, P.caps, P.hoodies],
    } },

  // ── Seasonal ──
  { slug: 'fall-edition', name: 'Fall Edition', category: 'Seasonal', months: [9,10],
    description: 'Warm autumn look — hoodies, homecoming, school and church season.',
    theme: { primary: '#c2410c', heroBg: '#292524', specialBg: '#431407', background: '#faf5ef', script: '#c2410c' },
    content: {
      eyebrow: 'COOLER DAYS. WARMER GEAR.', headline: 'FALL ORDERS', highlight: 'Start Now',
      body: 'Hoodies, sweatshirts, jackets, and long sleeves for homecoming, school events, and church programs.',
      heroNote: 'Fall Looks\nBetter Together.',
      events: [
        { icon: '🍂', title: 'Homecoming', description: 'Alumni and class-year gear' },
        { icon: '🏫', title: 'School Events', description: 'Spirit wear and club shirts' },
        { icon: '⛪', title: 'Church Programs', description: 'Ministry polos and hoodies' },
        { icon: '🧥', title: 'Cool Weather', description: 'Layer up the whole crew' },
      ],
      products: [P.hoodies, P.longsleeve, P.caps],
      specialBody: 'Free basic artwork setup on fall orders placed this month.',
    } },
  { slug: 'winter-edition', name: 'Winter Edition', category: 'Seasonal', months: [12,1],
    description: 'Premium cold-weather apparel — outerwear, embroidery, team gear.',
    theme: { primary: '#991b1b', heroBg: '#1e293b', specialBg: '#0f172a', background: '#f1f5f9', script: '#991b1b' },
    content: {
      eyebrow: 'BUILT FOR THE COLD.', headline: 'GEAR UP', highlight: 'For Winter',
      body: 'Embroidered outerwear, hoodies, and beanies for teams, staff, and holiday events.',
      heroNote: 'Warm Gear.\nStronger Teams.',
      events: [
        { icon: '❄️', title: 'Winter Events', description: 'Holiday programs and parties' },
        { icon: '🧢', title: 'Staff Apparel', description: 'Embroidered polos and jackets' },
        { icon: '🎽', title: 'Team Gear', description: 'Warmups and fan hoodies' },
        { icon: '🎉', title: 'New-Year Branding', description: 'Refresh company apparel' },
      ],
      products: [P.jackets, P.hoodies, P.polos],
    } },
  { slug: 'spring-edition', name: 'Spring Edition', category: 'Seasonal', months: [3,4],
    description: 'Fresh, clean look for spring events, graduation, and team season.',
    theme: { primary: RED, heroBg: '#166534', specialBg: '#14532d', background: '#f6fdf8', script: '#16a34a' },
    content: {
      eyebrow: 'FRESH SEASON. FRESH IDEAS.', headline: 'SPRING EVENTS', highlight: 'Are Coming',
      body: 'School programs, graduation, church events, teams, and family reunions — get ahead of the season.',
      heroNote: 'Fresh Season.\nFresh Ideas.',
      events: [
        { icon: '🎓', title: 'Graduation', description: 'Class shirts and family tees' },
        { icon: '⚾', title: 'Spring Sports', description: 'Jerseys and fan gear' },
        { icon: '⛪', title: 'Church Events', description: 'Easter and spring programs' },
        { icon: '👨‍👩‍👧‍👦', title: 'Reunions', description: 'Family shirts for spring gatherings' },
      ],
      products: [P.tees, P.polos, P.performance],
    } },
  { slug: 'summer-edition', name: 'Summer Edition', category: 'Seasonal', months: [6,7],
    description: 'Bright event-season look — reunions, camps, festivals, outdoor events.',
    theme: { primary: RED, heroBg: '#0369a1', specialBg: '#075985', background: '#f0f9ff', script: '#f59e0b' },
    content: {
      eyebrow: 'SUN’S OUT. SHIRTS OUT.', headline: 'SUMMER LOOKS', highlight: 'Better Custom',
      body: 'Reunions, camps, festivals, youth programs, and outdoor events — lightweight custom gear for all of it.',
      heroNote: 'Sun. Shirts.\nGood Times.',
      events: [
        { icon: '🏕️', title: 'Camps', description: 'Youth program and counselor tees' },
        { icon: '🎪', title: 'Festivals', description: 'Event and vendor apparel' },
        { icon: '👨‍👩‍👧‍👦', title: 'Reunions', description: 'Family shirts that pop in photos' },
        { icon: '🏖️', title: 'Vacations', description: 'Matching trip shirts' },
      ],
      products: [P.performance, P.tees, P.caps],
    } },

  // ── School ──
  { slug: 'back-to-school', name: 'Back to School', category: 'School', months: [8],
    description: 'Spirit wear, clubs, faculty apparel, and team gear for the new year.',
    theme: { primary: RED, heroBg: '#1e3a8a', specialBg: '#1e293b', background: '#f8fafc' },
    content: {
      eyebrow: 'NEW YEAR. NEW GEAR.', headline: 'BACK TO SCHOOL.', highlight: 'Back in Style',
      body: 'Spirit wear, club shirts, faculty and staff apparel, and team gear — ready before the first bell.',
      cta: 'START YOUR SCHOOL ORDER',
      heroNote: 'School Spirit\nStarts Here.',
      events: [
        { icon: '🏫', title: 'School Spirit', description: 'Spirit wear for students and fans' },
        { icon: '🎭', title: 'Clubs', description: 'Band, drama, robotics, and more' },
        { icon: '🍎', title: 'Faculty & Staff', description: 'Polos and staff tees' },
        { icon: '🏈', title: 'Team Gear', description: 'Jerseys and sideline apparel' },
      ],
      eventsCta: 'GET SCHOOL PRICING',
      products: [P.tees, P.polos, P.hoodies],
    } },
  { slug: 'graduation', name: 'Graduation', category: 'School', months: [4,5],
    description: 'Class shirts, family celebration tees, and alumni apparel.',
    theme: { primary: RED, heroBg: '#111111', specialBg: '#1f2937', script: '#eab308' },
    content: {
      eyebrow: 'THEY EARNED IT.', headline: 'CELEBRATE THE', highlight: `Class of ${new Date().getFullYear()}`,
      body: 'Graduation shirts, proud-family tees, and alumni apparel for high school, college, and beyond.',
      cta: 'CREATE GRADUATION SHIRTS',
      heroNote: 'Caps Off\nTo The Grads.',
      events: [
        { icon: '🎓', title: 'Class Shirts', description: 'Senior year and class designs' },
        { icon: '👪', title: 'Family Tees', description: '"Proud Mom/Dad" shirts' },
        { icon: '🏛️', title: 'Alumni Apparel', description: 'Rep the alma mater' },
        { icon: '🎉', title: 'Grad Parties', description: 'Custom party gear' },
      ],
      eventsCta: 'START YOUR CLASS ORDER',
      products: [P.tees, P.hoodies, P.caps],
    } },
  { slug: 'homecoming', name: 'Homecoming', category: 'School', months: [9,10],
    description: 'Alumni, class years, reunions, and tailgates — a flagship TSB season.',
    theme: { primary: RED, heroBg: '#111827', specialBg: '#1f2937' },
    content: {
      eyebrow: 'THE YARD IS CALLING.', headline: 'HOMECOMING', highlight: 'Starts Here',
      body: 'Alumni apparel, class-year designs, reunion group shirts, and tailgate gear — printed locally in Fairburn.',
      cta: 'START YOUR HOMECOMING ORDER',
      heroNote: 'Back Home.\nBest Dressed.',
      events: [
        { icon: '🏟️', title: 'Tailgates', description: 'Crew shirts and coolers gear' },
        { icon: '🎊', title: 'Class Years', description: 'Class of ’05, ’15, ’25 designs' },
        { icon: '👥', title: 'Reunion Groups', description: 'Line jackets and group tees' },
        { icon: '🧢', title: 'Alumni Caps', description: 'Embroidered keepsakes' },
      ],
      products: [P.tees, P.hoodies, P.caps],
      specialBody: 'Pooled group pricing — the bigger the crew, the lower the per-shirt price.',
    } },
  { slug: 'sports-team', name: 'Sports & Team', category: 'Sports', months: [1,2,3,4,5,6,7,8,9,10,11,12],
    description: 'Evergreen team template — jerseys, fan gear, boosters, coaching staff.',
    theme: { primary: RED, heroBg: '#111827', specialBg: '#1f2937' },
    content: {
      eyebrow: 'ONE TEAM. ONE LOOK.', headline: 'YOUR TEAM.', highlight: 'Your Look',
      body: 'Jerseys, fan shirts, booster gear, and coaching staff apparel — built around your colors and your season.',
      cta: 'OUTFIT YOUR TEAM',
      heroNote: 'Play Hard.\nLook Sharp.',
      events: [
        { icon: '🏀', title: 'Jerseys', description: 'Numbers, names, full customization' },
        { icon: '📣', title: 'Fan Gear', description: 'Shirts the stands will wear' },
        { icon: '📋', title: 'Coaches', description: 'Polos and sideline jackets' },
        { icon: '🎟️', title: 'Boosters', description: 'Fundraising-ready apparel' },
      ],
      products: [P.performance, P.hoodies, P.caps],
    } },

  // ── Cultural ──
  { slug: 'black-history-month', name: 'Black History Month', category: 'Cultural', months: [1,2],
    description: 'Sophisticated black + gold editorial look for February programs.',
    theme: { primary: '#ca8a04', heroBg: '#000000', specialBg: '#1c1917', script: '#dc2626', background: '#faf7f2' },
    content: {
      eyebrow: 'HONOR THE PAST. WEAR THE LEGACY.', headline: 'CELEBRATE', highlight: 'Black History',
      body: 'Program shirts and event apparel for churches, schools, colleges, nonprofits, and community organizations.',
      cta: 'PLAN YOUR PROGRAM ORDER',
      heroNote: 'Legacy.\nWorn Proudly.',
      events: [
        { icon: '⛪', title: 'Church Programs', description: 'Commemorative service shirts' },
        { icon: '🏫', title: 'Schools & Colleges', description: 'Assembly and club apparel' },
        { icon: '🤝', title: 'Community Orgs', description: 'March and event gear' },
        { icon: '🏢', title: 'Corporate Programs', description: 'ERG and office events' },
      ],
      products: [P.tees, P.hoodies, P.caps],
      specialNote: 'Designs honored\nwith care.',
    } },
  { slug: 'womens-history-month', name: "Women's History Month", category: 'Cultural', months: [2,3],
    description: 'Elegant plum + gold look celebrating women who lead.',
    theme: { primary: '#86198f', heroBg: '#3b0764', specialBg: '#4a044e', script: '#ca8a04', background: '#faf7fa' },
    content: {
      eyebrow: 'HISTORY. LEADERSHIP. IMPACT.', headline: 'CELEBRATE WOMEN', highlight: 'Who Lead',
      body: 'Apparel for businesses, schools, churches, nonprofits, and organizations honoring the women who move us forward.',
      cta: 'START YOUR ORDER',
      heroNote: 'Her Story.\nOur History.',
      events: [
        { icon: '💼', title: 'Businesses', description: 'Team and event apparel' },
        { icon: '🏫', title: 'Schools', description: 'Program and assembly shirts' },
        { icon: '⛪', title: 'Churches', description: "Women's ministry gear" },
        { icon: '🤝', title: 'Nonprofits', description: 'Fundraiser and gala shirts' },
      ],
      products: [P.tees, P.polos, P.caps],
    } },
  { slug: 'juneteenth', name: 'Juneteenth', category: 'Cultural', months: [5,6],
    description: 'Bold, celebratory, historically respectful — festivals and family events.',
    theme: { primary: '#dc2626', heroBg: '#111111', specialBg: '#14532d', script: '#eab308', background: '#fefce8' },
    content: {
      eyebrow: 'JUNETEENTH • COMMUNITY • CULTURE • LEGACY', headline: 'CELEBRATE', highlight: 'Freedom',
      body: 'Festival shirts, family designs, and organization apparel for Juneteenth celebrations across the community.',
      cta: 'PLAN YOUR EVENT ORDER',
      heroNote: 'Freedom.\nFamily. Legacy.',
      events: [
        { icon: '🎪', title: 'Festivals', description: 'Event and vendor apparel' },
        { icon: '👨‍👩‍👧‍👦', title: 'Family Events', description: 'Cookout and reunion shirts' },
        { icon: '🤝', title: 'Community Programs', description: 'Organization and volunteer tees' },
        { icon: '🎶', title: 'Performances', description: 'Choir and step-team gear' },
      ],
      products: [P.tees, P.caps, P.hoodies],
    } },

  // ── Holidays ──
  { slug: 'thanksgiving', name: 'Thanksgiving', category: 'Holiday', months: [10,11],
    description: 'Family gatherings, church events, and volunteer programs.',
    theme: { primary: '#b45309', heroBg: '#7c2d12', specialBg: '#431407', background: '#fffbeb', script: '#b45309' },
    content: {
      eyebrow: 'GRATITUDE LOOKS GOOD ON EVERYONE.', headline: 'GATHER. GIVE THANKS.', highlight: 'Look Good',
      body: 'Family shirts, church event apparel, company gatherings, and volunteer program tees for the season of thanks.',
      heroNote: 'Together Is the\nBest Tradition.',
      events: [
        { icon: '🦃', title: 'Family Gatherings', description: 'Matching family shirts' },
        { icon: '⛪', title: 'Church Events', description: 'Harvest program apparel' },
        { icon: '🍽️', title: 'Volunteer Programs', description: 'Serving-day crew tees' },
        { icon: '🏢', title: 'Company Events', description: 'Team gratitude gear' },
      ],
      products: [P.longsleeve, P.hoodies, P.tees],
    } },
  { slug: 'christmas', name: 'Christmas', category: 'Holiday', months: [11,12],
    description: 'Church programs, choirs, staff gifts, and family holiday shirts.',
    theme: { primary: RED, heroBg: '#14532d', specialBg: '#052e16', script: '#eab308', background: '#f7fdf9' },
    content: {
      eyebrow: 'MERRY, BRIGHT, AND CUSTOM.', headline: 'MAKE THE SEASON', highlight: 'Custom',
      body: 'Church programs, choir apparel, embroidered staff gifts, and family holiday shirts — ordered early, delivered calm.',
      cta: 'START YOUR HOLIDAY ORDER',
      heroNote: 'Joy. Peace.\nGood Shirts.',
      events: [
        { icon: '🎄', title: 'Church Programs', description: 'Christmas production shirts' },
        { icon: '🎶', title: 'Choirs', description: 'Concert and cantata apparel' },
        { icon: '🎁', title: 'Staff Gifts', description: 'Embroidered quarter-zips and caps' },
        { icon: '👪', title: 'Family Shirts', description: 'Matching PJs-adjacent tees' },
      ],
      products: [P.hoodies, P.jackets, P.caps],
      specialBody: 'Order by Dec 10 for guaranteed Christmas delivery — free artwork setup included.',
    } },
  { slug: 'new-year', name: 'New Year', category: 'Holiday', months: [12,1],
    description: 'Brand refreshes, staff uniforms, and new-season team apparel.',
    theme: { primary: RED, heroBg: '#111111', specialBg: '#1f2937', script: '#eab308' },
    content: {
      eyebrow: 'FRESH START. FRESH GEAR.', headline: 'NEW YEAR.', highlight: 'New Look',
      body: 'Company branding, staff uniforms, organization relaunches, and new team apparel to start the year sharp.',
      cta: 'REFRESH YOUR APPAREL',
      heroNote: 'Same Mission.\nSharper Look.',
      events: [
        { icon: '🏢', title: 'Company Branding', description: 'Uniform and polo refreshes' },
        { icon: '📈', title: 'Relaunches', description: 'New-look organization gear' },
        { icon: '🎽', title: 'New Teams', description: 'Winter and spring season apparel' },
        { icon: '💝', title: 'Customer Thanks', description: 'Appreciation giveaways' },
      ],
      eventsCta: 'START THE YEAR CUSTOM',
      products: [P.polos, P.jackets, P.caps],
    } },
  { slug: 'halloween', name: 'Halloween', category: 'Holiday', months: [9,10],
    description: 'Parties, staff shirts, trunk-or-treats, and event apparel.',
    theme: { primary: '#ea580c', heroBg: '#000000', specialBg: '#431407', background: '#fff7ed', script: '#ea580c' },
    content: {
      eyebrow: 'SPOOKY SEASON IS PRINT SEASON.', headline: 'CUSTOM GEAR FOR', highlight: 'Spooky Season',
      body: 'Party shirts, business and staff tees, church trunk-or-treats, school events, and family costume shirts.',
      heroNote: 'Creep It\nCustom.',
      events: [
        { icon: '🎃', title: 'Parties', description: 'Group and couples shirts' },
        { icon: '🏢', title: 'Staff Shirts', description: 'Office spirit-day tees' },
        { icon: '⛪', title: 'Trunk-or-Treat', description: 'Church event crew gear' },
        { icon: '👻', title: 'Family Designs', description: 'Matching costume tees' },
      ],
      products: [P.tees, P.longsleeve, P.hoodies],
    } },
  { slug: 'valentines', name: "Valentine's Day", category: 'Holiday', months: [1,2],
    description: 'Couples, group events, churches, and playful team apparel.',
    theme: { primary: '#e11d48', heroBg: '#881337', specialBg: '#4c0519', background: '#fff1f2', script: '#e11d48' },
    content: {
      eyebrow: 'MADE WITH LOVE IN FAIRBURN.', headline: 'CUSTOM MADE FOR', highlight: 'Your People',
      body: 'Couples shirts, group event tees, church programs, and school apparel for the season of love.',
      heroNote: 'Love Looks\nGood On You.',
      events: [
        { icon: '💘', title: 'Couples', description: 'Matching his-and-hers tees' },
        { icon: '🎉', title: 'Events', description: 'Galentine’s and party shirts' },
        { icon: '⛪', title: 'Churches', description: 'Marriage-ministry events' },
        { icon: '🏫', title: 'Schools', description: 'Candygram crew shirts' },
      ],
      products: [P.tees, P.hoodies, P.caps],
    } },
  { slug: 'easter-spring-church', name: 'Easter / Spring Church', category: 'Holiday', months: [3,4],
    description: 'Faith-based spring template — ministries, choirs, volunteers, youth.',
    theme: { primary: RED, heroBg: '#5b21b6', specialBg: '#4c1d95', background: '#faf5ff', script: '#7c3aed' },
    content: {
      eyebrow: 'HE IS RISEN. WE ARE READY.', headline: 'CELEBRATE THE SEASON', highlight: 'Together',
      body: 'Church shirts, ministry polos, volunteer tees, choir apparel, and youth ministry gear for Easter and spring programs.',
      cta: 'START YOUR CHURCH ORDER',
      heroNote: 'One Body.\nOne Look.',
      events: [
        { icon: '✝️', title: 'Easter Services', description: 'Greeter and usher apparel' },
        { icon: '🎶', title: 'Choirs', description: 'Spring concert shirts' },
        { icon: '🙌', title: 'Volunteers', description: 'Serve-team tees' },
        { icon: '🧒', title: 'Youth Ministry', description: 'Camp and VBS gear' },
      ],
      products: [P.polos, P.tees, P.hoodies],
    } },
  { slug: 'mothers-day', name: "Mother's Day", category: 'Holiday', months: [4,5],
    description: 'Family shirts, church celebrations, and gifts for mom.',
    theme: { primary: '#db2777', heroBg: '#831843', specialBg: '#500724', background: '#fdf2f8', script: '#db2777' },
    content: {
      eyebrow: 'FOR THE ONE WHO DOES IT ALL.', headline: 'CELEBRATE MOM', highlight: 'In Style',
      body: 'Family shirts, church celebrations, reunion gear, and custom gifts that say it better than a card.',
      heroNote: 'Mama Knows\nBest.',
      events: [
        { icon: '💐', title: 'Family Shirts', description: '"Mom Squad" and crew tees' },
        { icon: '⛪', title: 'Church Programs', description: 'Mother’s Day service apparel' },
        { icon: '🎁', title: 'Gifts', description: 'Embroidered totes and caps' },
        { icon: '👨‍👩‍👧', title: 'Reunions', description: 'Matriarch-honoring designs' },
      ],
      products: [P.tees, P.caps, P.polos],
    } },
  { slug: 'fathers-day', name: "Father's Day", category: 'Holiday', months: [5,6],
    description: 'Family shirts, church events, and custom gear for great dads.',
    theme: { primary: RED, heroBg: '#1e3a8a', specialBg: '#1e293b', background: '#f8fafc' },
    content: {
      eyebrow: 'FOR THE ORIGINAL GOAT.', headline: 'CUSTOM GEAR FOR', highlight: 'Great Dads',
      body: 'Family shirts, church events, reunion gear, and gifts dads will actually wear.',
      heroNote: 'Dad Approved.\nKid Tested.',
      events: [
        { icon: '🧢', title: 'Dad Caps', description: 'Embroidered classics' },
        { icon: '👪', title: 'Family Shirts', description: '"Grill Sergeant" and crew tees' },
        { icon: '⛪', title: 'Church Events', description: 'Men’s ministry apparel' },
        { icon: '🎣', title: 'Trips', description: 'Fishing and golf crew gear' },
      ],
      products: [P.caps, P.polos, P.tees],
    } },

  // ── Patriotic (shared layout, variant copy) ──
  { slug: 'memorial-day', name: 'Memorial Day', category: 'Holiday', months: [4,5],
    description: 'Respectful remembrance apparel — tone before promotion.',
    theme: { primary: '#b91c1c', heroBg: '#1e3a8a', specialBg: '#1e293b', background: '#f8fafc', script: '#b91c1c' },
    content: {
      eyebrow: 'MEMORIAL DAY', headline: 'REMEMBER. HONOR.', highlight: 'Together',
      body: 'Respectful apparel for remembrance ceremonies, veterans organizations, churches, and community observances.',
      cta: 'PLAN A MEMORIAL ORDER',
      heroNote: 'Never\nForgotten.',
      events: [
        { icon: '🎗️', title: 'Ceremonies', description: 'Observance and honor-guard apparel' },
        { icon: '🇺🇸', title: 'Veterans Groups', description: 'Post and auxiliary shirts' },
        { icon: '⛪', title: 'Churches', description: 'Remembrance service gear' },
        { icon: '🕊️', title: 'Families', description: 'Memorial tribute shirts' },
      ],
      products: [P.tees, P.polos, P.caps],
      specialHeadline: 'COMMUNITY', specialHighlight: 'Support',
      specialBody: 'Discounted pricing for veterans organizations and remembrance events.',
    } },
  { slug: 'independence-day', name: 'Independence Day', category: 'Holiday', months: [6,7],
    description: 'July 4th — family gatherings, festivals, and community events.',
    theme: { primary: '#b91c1c', heroBg: '#1e3a8a', specialBg: '#1e293b', background: '#f8fafc', script: '#b91c1c' },
    content: {
      eyebrow: 'JULY 4TH', headline: 'CELEBRATE IN RED,', highlight: 'White & Custom',
      body: 'Family cookouts, business events, festivals, teams, and community celebrations — gear for the whole block.',
      heroNote: 'Land Of The Free.\nHome Of The Custom.',
      events: [
        { icon: '🎆', title: 'Festivals', description: 'Event staff and vendor tees' },
        { icon: '🍔', title: 'Cookouts', description: 'Family reunion + BBQ shirts' },
        { icon: '🏢', title: 'Businesses', description: 'Holiday promo apparel' },
        { icon: '⚾', title: 'Teams', description: 'Summer tournament gear' },
      ],
      products: [P.tees, P.performance, P.caps],
    } },
  { slug: 'labor-day', name: 'Labor Day', category: 'Holiday', months: [8,9],
    description: 'Salute the workforce — staff apparel and end-of-summer events.',
    theme: { primary: '#b91c1c', heroBg: '#1e3a8a', specialBg: '#1e293b', background: '#f8fafc', script: '#b91c1c' },
    content: {
      eyebrow: 'LABOR DAY', headline: 'GEAR FOR THE PEOPLE', highlight: 'Who Get It Done',
      body: 'Staff apparel, company event shirts, team gear, and end-of-summer promotions for the crews that keep it moving.',
      cta: 'OUTFIT YOUR CREW',
      heroNote: 'Hard Work.\nGood Looks.',
      events: [
        { icon: '👷', title: 'Staff Apparel', description: 'Workwear and hi-vis printing' },
        { icon: '🏢', title: 'Company Events', description: 'Picnic and outing shirts' },
        { icon: '🎽', title: 'Teams', description: 'Fall season kickoff gear' },
        { icon: '🏷️', title: 'Promos', description: 'End-of-summer specials' },
      ],
      products: [P.tees, P.polos, P.caps],
    } },
  { slug: 'veterans-day', name: 'Veterans Day', category: 'Holiday', months: [10,11],
    description: 'Honor those who served — respectful appreciation apparel.',
    theme: { primary: '#b91c1c', heroBg: '#1e3a8a', specialBg: '#1e293b', background: '#f8fafc', script: '#b91c1c' },
    content: {
      eyebrow: 'VETERANS DAY', headline: 'HONOR THOSE', highlight: 'Who Served',
      body: 'Appreciation apparel for veterans groups, churches, schools, families, and community organizations.',
      cta: 'PLAN AN APPRECIATION ORDER',
      heroNote: 'Service.\nHonored.',
      events: [
        { icon: '🎖️', title: 'Veterans Groups', description: 'Post and unit apparel' },
        { icon: '🏫', title: 'Schools', description: 'Assembly and tribute shirts' },
        { icon: '⛪', title: 'Churches', description: 'Appreciation service gear' },
        { icon: '👪', title: 'Families', description: 'Military family shirts' },
      ],
      products: [P.tees, P.hoodies, P.caps],
    } },

  // ── Community ──
  { slug: 'family-reunion', name: 'Family Reunion', category: 'Community', months: [4,5,6,7],
    description: 'The evergreen TSB reunion template — family name, year, and city.',
    theme: { primary: RED, heroBg: '#7f1d1d', specialBg: '#450a0a', background: '#fffbeb' },
    content: {
      eyebrow: 'ONE FAMILY. ONE LEGACY.', headline: 'FAMILY LOOKS', highlight: 'Better Together',
      body: 'Reunion shirts, polos, caps, kids sizes, and hoodies — swap in your family name, year, city, and slogan.',
      cta: 'START YOUR FAMILY ORDER',
      heroNote: 'Everybody\nMatching.',
      events: [
        { icon: '🧺', title: 'The Cookout', description: 'Crew tees for the big day' },
        { icon: '🧒', title: 'Kids Sizes', description: 'Youth and toddler matching' },
        { icon: '🧢', title: 'Elders’ Gear', description: 'Polos and caps for the OGs' },
        { icon: '📸', title: 'Photo Day', description: 'Color-coordinated by branch' },
      ],
      products: [P.tees, P.polos, P.caps],
      specialBody: 'Pooled family pricing — every branch counts toward the volume discount.',
    } },
  { slug: 'church-ministry', name: 'Church & Ministry', category: 'Community', months: [1,2,3,4,5,6,7,8,9,10,11,12],
    description: 'Evergreen church template — anniversaries, choirs, conferences, youth.',
    theme: { primary: RED, heroBg: '#4c1d95', specialBg: '#2e1065', background: '#faf5ff', script: '#7c3aed' },
    content: {
      eyebrow: 'SERVE IN STYLE.', headline: 'APPAREL FOR MINISTRY', highlight: 'That Moves',
      body: 'Church anniversaries, choirs, ministry teams, conferences, youth groups, retreats, and volunteer programs.',
      cta: 'START YOUR MINISTRY ORDER',
      heroNote: 'One Body.\nMany Shirts.',
      events: [
        { icon: '🎉', title: 'Anniversaries', description: 'Commemorative church shirts' },
        { icon: '🎶', title: 'Choirs', description: 'Concert and robe-alternative wear' },
        { icon: '🧒', title: 'Youth & VBS', description: 'Camp and retreat gear' },
        { icon: '🙌', title: 'Volunteers', description: 'Serve-team and usher apparel' },
      ],
      products: [P.polos, P.tees, P.hoodies],
    } },

  // ── Sales / Retention ──
  { slug: 'general-sale', name: 'General Sale', category: 'Sales', months: [1,2,3,4,5,6,7,8,9,10,11,12],
    description: 'Flash sales, bulk deals, free-setup promos — swap the offer and go.',
    theme: { primary: '#111111', heroBg: '#c2410c', specialBg: '#111111', script: '#fbbf24' },
    content: {
      eyebrow: 'LIMITED TIME', headline: 'THIS WEEK’S', highlight: 'TSB Special',
      body: 'Order more, save more — volume pricing pools across your whole order, and this week setup is on us.',
      cta: 'CLAIM THE DEAL',
      heroNote: 'Deals This\nGood Don’t Wait.',
      events: false,
      products: [P.tees, P.hoodies, P.caps],
      specialHeadline: 'THIS WEEK ONLY', specialHighlight: 'Save Big',
      specialBody: 'Free artwork setup + 10% off orders of 24 or more placed before Sunday.',
      specialCta: 'CLAIM OFFER',
    } },
  { slug: 'customer-appreciation', name: 'Customer Appreciation', category: 'Customer Retention', months: [1,2,3,4,5,6,7,8,9,10,11,12],
    description: 'Reward past customers — optimized for the past-customer segment.',
    theme: {},
    content: {
      eyebrow: 'THIS ONE’S FOR YOU.', headline: 'A SPECIAL THANK YOU', highlight: 'To Our Customers',
      body: 'You keep the presses running. Here’s a little something for your next order — because returning customers are family.',
      cta: 'USE MY REWARD',
      heroNote: 'You Da\nReal MVP.',
      events: false,
      products: [P.tees, P.polos, P.hoodies],
      specialHeadline: 'PREFERRED CUSTOMER', specialHighlight: 'Reward',
      specialBody: 'Free artwork setup plus a preferred-customer discount on your next order this month.',
      specialCta: 'CLAIM MY REWARD',
      specialNote: 'Thanks for rocking\nwith us. — Kevin',
    } },
  { slug: 'reactivation', name: 'Reactivation / We Miss You', category: 'Customer Retention', months: [1,2,3,4,5,6,7,8,9,10,11,12],
    description: 'Win back customers who haven’t ordered in a while.',
    theme: {},
    content: {
      eyebrow: 'LONG TIME NO PRINT.', headline: 'IT’S BEEN A WHILE —', highlight: 'What’s Next?',
      body: 'Your last order looked great. Whatever’s coming up — an event, a season, a team — we’ll make the next one even better.',
      cta: 'START A NEW ORDER',
      heroNote: 'We Saved\nYour Seat.',
      events: false,
      products: [P.tees, P.hoodies, P.caps],
      specialHeadline: 'WELCOME BACK', specialHighlight: 'Offer',
      specialBody: 'Come back this month and artwork setup is free — plus we still have your designs on file.',
      specialCta: 'PICK UP WHERE WE LEFT OFF',
      specialNote: 'The press\nmissed you.',
    } },
  { slug: 'business-brand-refresh', name: 'Business Brand Refresh', category: 'Business', months: [1,2,3,4,5,6,7,8,9,10,11,12],
    description: 'Uniforms, staff polos, embroidered hats, and branded workwear.',
    theme: { primary: '#ea580c', heroBg: '#1f2937', specialBg: '#111827', background: '#f8fafc', script: '#ea580c' },
    content: {
      eyebrow: 'LOOK AS GOOD AS YOUR WORK.', headline: 'PUT YOUR BRAND', highlight: 'To Work',
      body: 'Uniforms, staff polos, embroidered hats, branded tees, and workwear that makes the whole crew look official.',
      cta: 'OUTFIT YOUR TEAM',
      heroNote: 'Your Logo.\nEverywhere.',
      events: [
        { icon: '👔', title: 'Uniforms', description: 'Daily-wear staff apparel' },
        { icon: '🧢', title: 'Embroidered Hats', description: 'Logo caps and beanies' },
        { icon: '🦺', title: 'Workwear', description: 'Hi-vis and heavy-duty gear' },
        { icon: '🎁', title: 'Promo Apparel', description: 'Client and event giveaways' },
      ],
      eventsTitle: 'WAYS TO WEAR YOUR BRAND',
      products: [P.polos, P.caps, P.jackets],
    } },
];

export const NEWSLETTER_TEMPLATES = DEFS.map((d) => ({
  slug: d.slug,
  name: d.name,
  category: d.category,
  description: d.description,
  months: d.months,
  theme: { ...d.theme },
  blocks: () => blocksFrom(d.content),
}));

export function templateMeta(month = new Date().getMonth() + 1) {
  return NEWSLETTER_TEMPLATES.map((t) => ({
    slug: t.slug,
    name: t.name,
    category: t.category,
    description: t.description,
    theme: { ...DEFAULT_THEME, ...t.theme },
    recommended: t.months.length < 12 && t.months.includes(month),
  }));
}

export function templateBySlug(slug) {
  return NEWSLETTER_TEMPLATES.find((t) => t.slug === slug) || null;
}
