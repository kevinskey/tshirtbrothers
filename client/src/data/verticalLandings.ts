// Use-case landing pages — /shirts-for/<slug>. Targets keywords people
// actually type into Google ("church shirts", "family reunion shirts",
// "team jerseys") rather than process keywords ("screen printing").
//
// Pattern matches cityLandings.ts: each entry produces its own URL,
// H1, meta, and a use-case-specific paragraph or two. Add a vertical
// by appending an entry — the route component handles the rest.

export type VerticalLanding = {
  slug: string;
  name: string;           // Display name: "Church Shirts"
  shortLabel: string;     // For chips / nav: "Church"
  heroLine: string;       // Hero subtitle (one sentence)
  intro: string;          // 2-3 sentence framing paragraph
  examples: string[];     // Bullets of typical use cases
  recommendedMethod: string;
  recommendedGarment: string;
  pricingHint: string;    // "From $11/shirt at 24+" style
  cta: { label: string; to: string };
};

export const VERTICAL_LANDINGS: VerticalLanding[] = [
  {
    slug: 'churches',
    name: 'Church Shirts',
    shortLabel: 'Church',
    heroLine: 'Custom apparel for ministries, choirs, youth groups, and church events.',
    intro:
      "Churches print more custom apparel than almost any other group we work with — and they want the same things every time: comfortable shirts that wash well, prints that hold up Sunday after Sunday, and a print shop that gets it back to them before their event. We've printed for sanctuary choirs, women's ministry retreats, men's day, youth lock-ins, Vacation Bible School, ushers, and praise teams across the Atlanta metro.",
    examples: [
      'Choir robes and choir t-shirts',
      'Youth ministry retreats & lock-ins',
      "Women's day / Men's day shirts",
      'Vacation Bible School (VBS)',
      'Usher and praise team apparel',
      'Church anniversary & homecoming',
    ],
    recommendedMethod: 'DTF for full-color art, screen printing for 1-2 color text at 50+',
    recommendedGarment: 'Gildan Heavy Cotton or Comfort Colors for events',
    pricingHint: 'From $11/shirt at 24+',
    cta: { label: 'Quote My Church Order', to: '/quote' },
  },
  {
    slug: 'family-reunions',
    name: 'Family Reunion Shirts',
    shortLabel: 'Family Reunion',
    heroLine: 'Reunion shirts the whole family will actually wear after the weekend.',
    intro:
      "Family reunions are our favorite jobs — the energy is great, the designs are personal, and we're making something that lives in family photos for decades. We print everything from classic group tees with all the cousins' names on the back to multi-color hoodie/youth/baby ladder sets for big extended families. Order early; the closer to the reunion, the harder rush turnaround gets.",
    examples: [
      'Classic family group tees',
      'Multi-generation sets (adult, youth, infant)',
      'Reunion logo with names on back',
      'Reunion committee / planning tees',
      'Memorial / "in loving memory" shirts',
      'Color-coded by family branch',
    ],
    recommendedMethod: 'DTF — handles full-color photos, family crests, and mixed sizes well',
    recommendedGarment: 'Gildan Softstyle or Comfort Colors',
    pricingHint: 'From $13/shirt at 24+',
    cta: { label: 'Quote My Reunion', to: '/quote' },
  },
  {
    slug: 'teams',
    name: 'Team Jerseys & Uniforms',
    shortLabel: 'Teams',
    heroLine: 'Numbered jerseys, practice tees, and warm-up gear for any team.',
    intro:
      "Sports teams need three things from a printer: numbers that don't peel, names that fit, and a turnaround that meets the season schedule. We print numbered jerseys (heat-transfer vinyl that survives the dryer), screen-printed practice shirts in bulk, and embroidered warm-up jackets for sidelines.",
    examples: [
      'Numbered jerseys (with names on back)',
      'Practice tees & training tops',
      'Warm-up jackets and hoodies',
      'Coach polos and staff apparel',
      'Booster club fundraiser shirts',
      'Tournament / championship tees',
    ],
    recommendedMethod: 'Screen printing for solid-color jerseys; HTV for numbers/names',
    recommendedGarment: "Augusta or Badger for performance; Gildan for practice",
    pricingHint: 'From $14/shirt at 24+ (numbered)',
    cta: { label: 'Quote My Team Order', to: '/quote' },
  },
  {
    slug: 'schools',
    name: 'School & Class Shirts',
    shortLabel: 'Schools',
    heroLine: 'Spirit wear, class shirts, field-trip tees, and PTO fundraisers.',
    intro:
      "We print for elementary spirit days, middle school PTO fundraisers, high school class shirts, senior shirts, and after-school programs across the south Atlanta metro. Tax-exempt orders welcome — send us your form along with the order and we'll handle it.",
    examples: [
      'Senior class shirts',
      'PTO/PTA fundraiser shirts',
      'Field trip & field day tees',
      'Spirit wear for sports & clubs',
      'Staff and teacher shirts',
      'Graduation & promotion shirts',
    ],
    recommendedMethod: 'Screen printing at 50+ for bulk; DTF below that',
    recommendedGarment: 'Gildan Heavy Cotton or Bella+Canvas for premium feel',
    pricingHint: 'From $9/shirt at 50+',
    cta: { label: 'Quote My School Order', to: '/quote' },
  },
  {
    slug: 'businesses',
    name: 'Corporate & Business Apparel',
    shortLabel: 'Business',
    heroLine: 'Branded polos, embroidered uniforms, staff tees, and event apparel.',
    intro:
      "Branded apparel makes your team look like a team. We print and embroider for small businesses, real-estate offices, contractors, hospitality, retail, and event staffing. Logos digitized once, reused on every reorder — no re-art fee.",
    examples: [
      'Embroidered company polos',
      'Branded staff t-shirts',
      'Hi-vis and uniform shirts',
      'Trade show / event giveaways',
      'Holiday party shirts',
      'Onboarding "welcome to the team" sets',
    ],
    recommendedMethod: 'Embroidery for polos/jackets; DTF or screen for staff tees',
    recommendedGarment: 'Port Authority polos, Carhartt for trades, Gildan for casual',
    pricingHint: 'Polos with logo from $22 each',
    cta: { label: 'Quote My Business Order', to: '/quote' },
  },
  {
    slug: 'greek-life',
    name: 'Greek Life & Sorority Shirts',
    shortLabel: 'Greek Life',
    heroLine: 'Probate, line shirts, founders day, and chapter event apparel.',
    intro:
      "Greek life is core to the Atlanta metro — especially with HBCUs and Atlanta's deep sorority/fraternity presence. We print line shirts, probate tees, founders day apparel, chapter retreat shirts, and step show gear. Letters and colors matched exactly to org standards.",
    examples: [
      'Line shirts (with line numbers)',
      'Probate / crossing tees',
      'Founders day apparel',
      'Step show & yard show gear',
      'Chapter retreat shirts',
      'Convention & conference apparel',
    ],
    recommendedMethod: 'DTF for letters, photos, and full-color graphics',
    recommendedGarment: 'Bella+Canvas or Comfort Colors for premium feel',
    pricingHint: 'From $14/shirt at 24+',
    cta: { label: 'Quote My Greek Order', to: '/quote' },
  },
  {
    slug: 'fundraisers',
    name: 'Charity & Fundraiser Shirts',
    shortLabel: 'Fundraisers',
    heroLine: 'Awareness, memorial, and fundraising apparel for any cause.',
    intro:
      "Whether you're raising money for a medical bill, organizing a 5K, doing breast cancer awareness in October, or printing memorial shirts for a loved one — we treat these orders with care and quick turnaround. Tell us the deadline up front; we'll work backward from your event.",
    examples: [
      'Awareness month shirts (Oct pink, etc.)',
      'Memorial / "in loving memory" tees',
      "Walk-a-thons and 5K shirts",
      'GoFundMe campaign apparel',
      'Cancer benefit fundraisers',
      'Nonprofit event tees',
    ],
    recommendedMethod: 'DTF for full-color tributes and photos',
    recommendedGarment: 'Gildan Softstyle or Comfort Colors',
    pricingHint: 'From $12/shirt at 24+',
    cta: { label: 'Quote My Fundraiser', to: '/quote' },
  },
  {
    slug: 'birthdays',
    name: 'Birthday Party Shirts',
    shortLabel: 'Birthday',
    heroLine: 'Birthday squad shirts for kids, milestone birthdays, and themed parties.',
    intro:
      "Birthday-squad shirts have taken over Instagram for good reason — they make every party feel like an event. We print themed shirts for kids' birthdays, sweet 16s, 21st, 30th, milestone parties, surprise parties, and travel/cruise birthdays. Quick turnaround so you don't sweat the date.",
    examples: [
      "Kid's birthday squad shirts",
      'Sweet 16 / Quinceañera shirts',
      '21st, 30th, milestone birthdays',
      'Surprise party reveal shirts',
      'Birthday cruise / travel tees',
      'Adult themed birthday parties',
    ],
    recommendedMethod: 'DTF — full-color, low quantity, no setup fees',
    recommendedGarment: 'Bella+Canvas or Comfort Colors',
    pricingHint: 'From $15/shirt for small orders',
    cta: { label: 'Quote My Birthday Shirts', to: '/quote' },
  },
];

export function findVerticalLanding(slug: string | undefined): VerticalLanding | null {
  if (!slug) return null;
  return VERTICAL_LANDINGS.find((v) => v.slug === slug) || null;
}
