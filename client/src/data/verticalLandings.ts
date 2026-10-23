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

  // ─── Optional depth (added 2026-10-23, AEO/SEO pass) ──────────────
  // The eight original verticals render exactly as before when these
  // are omitted. Pages that answer a real customer question in detail
  // fill them in; the route component renders each section only when
  // present, so there are no empty headings.

  /**
   * Overrides the "What we print for <shortLabel> groups" heading.
   * Needed because some verticals are a SERVICE MODE rather than an
   * audience — "What we print for rush groups" is nonsense.
   */
  introHeading?: string;

  /** How ordering actually works, start to finish. 3-6 steps. */
  process?: { step: string; detail: string }[];

  /** Customization choices that genuinely apply to this vertical. */
  options?: string[];

  /**
   * Questions in the customer's own words, with answers that must stay
   * consistent with /faq — those numbers are the published ones. These
   * also become FAQPage structured data on the route, so every answer
   * has to be true and self-contained (no "see above").
   */
  faqs?: { q: string; a: string }[];

  /** Extra paragraph on production method, when it's the whole point. */
  methodDetail?: string;
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

  // ─────────────────────────────────────────────────────────────────────
  // Added 2026-10-23. These four fill the gaps the AEO audit found: real
  // customer questions with no page to answer them. Every figure below
  // is taken from /faq (the published numbers), the live DTF pricing
  // config, or the embroidery quote page — nothing is invented. Turn-
  // around language is deliberately hedged where the system hedges it:
  // same-day is "call ahead to confirm", not a guarantee.
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'rush-orders',
    name: 'Rush & Last-Minute Printing',
    shortLabel: 'Rush',
    heroLine: 'Need shirts in days, not weeks? Tell us your deadline and we will tell you straight whether we can hit it.',
    introHeading: 'How rush printing actually works here',
    intro:
      "Most rush jobs fail for a boring reason: the shop says yes without checking the schedule, then misses the date. We would rather give you a real answer in an hour. Tell us the quantity, the deadline, and whether you need the shirts in hand or just the transfers, and we will tell you what is genuinely possible. Standard turnaround is 2–7 business days from an approved mockup. Rush work under 48 hours adds 20–30% to the base price because it means reordering the production schedule around you. The fastest path is almost always DTF, and if you are local to Fairburn, picking up instead of shipping buys you a full day back.",
    methodDetail:
      "DTF transfer sheets are the one thing we can genuinely turn around same day, because they skip screens, drying and garment handling entirely. The configured tiers are Standard (ready in 2 business days), Rush (next business day, ordered by 11:00 AM) and Hot Rush (same day, ordered by 10:00 AM) — all Monday to Friday, priced per foot of 22-inch sheet. If you already have blanks, that is often the whole answer: order transfers on Hot Rush, press them yourself that afternoon. Printed-and-pressed garments take longer because the shirts themselves have to be sourced, printed, cured and folded, so for those we quote the date explicitly rather than promising a tier.",
    examples: [
      'Event is this weekend and the shirts never got ordered',
      'Funeral and memorial shirts on short notice',
      'Reorder after a group outgrew its first batch',
      'Conference or trade show you just got confirmed for',
      'Same-day DTF transfer sheets for your own heat press',
      'Replacement shirts after a vendor fell through',
    ],
    options: [
      'DTF transfers only — fastest option, press them yourself',
      'Local pickup in Fairburn instead of shipping (saves a day)',
      'Partial delivery: the shirts you need now, the rest to follow',
      'Reprint from a design already on file (skips mockup round-trip)',
      'Walk in with your own blanks for us to print on',
    ],
    process: [
      { step: 'Tell us the deadline first', detail: 'Lead with the date, not the design. It determines every other decision — method, garment and whether we quote at all.' },
      { step: 'We confirm feasibility, not just price', detail: 'We check the actual production schedule and tell you yes, no, or "yes if you can collect instead of ship".' },
      { step: 'Approve the mockup fast', detail: 'Turnaround is counted from mockup approval, not from when you first wrote in. On a rush job this is usually the step that costs the most time.' },
      { step: 'Print and hand off', detail: 'Pickup at the Fairburn shop is free and same-day once the job is off the press; we can also ship, though shipping transit is outside our control.' },
    ],
    faqs: [
      {
        q: 'Who offers rush custom t-shirt printing in south Atlanta?',
        a: 'We do rush and last-minute custom printing from our shop at 6010 Renaissance Parkway in Fairburn, GA, serving Fairburn, Fayetteville, Peachtree City, Tyrone, Newnan, Union City, College Park and the wider south Atlanta metro. Call (470) 622-1392 with your deadline and quantity and we will tell you what is actually achievable rather than quoting blind.',
      },
      {
        q: 'Can you print custom shirts the same day?',
        a: 'Sometimes, and only for small runs. Same-day is realistic for DTF transfer sheets ordered before 10:00 AM on a weekday, and occasionally for small DTF garment runs collected locally in Fairburn. Call ahead so we can confirm against the day\'s schedule before you count on it — we would rather say no than miss your date.',
      },
      {
        q: 'How much extra does a rush order cost?',
        a: 'Rush jobs that need to turn in under 48 hours add roughly 20–30% to the base price, because they mean rescheduling other work. DTF transfer sheets are priced by tier instead: Rush is next business day ordered by 11:00 AM, Hot Rush is same day ordered by 10:00 AM, both quoted per foot. There is no charge for asking whether a date is possible.',
      },
      {
        q: 'What is the fastest way to get custom shirts?',
        a: 'Order DTF transfers rather than finished garments, use artwork that is already print-ready, approve the mockup the same day you receive it, and pick up in Fairburn instead of shipping. Those four choices together are usually the difference between a week and a day.',
      },
      {
        q: 'How fast is standard turnaround if I am not in a rush?',
        a: 'Standard is 2–7 business days from approved mockup, depending on quantity, method and how many print locations the design has. Larger screen-printed orders sit at the longer end of that range; small DTF runs are usually at the shorter end.',
      },
    ],
    recommendedMethod: 'DTF — no screens to burn, so it is the only genuinely same-day method',
    recommendedGarment: 'Whatever we have on hand, or bring your own blanks',
    pricingHint: 'Rush under 48h adds 20–30%',
    cta: { label: 'Tell Us Your Deadline', to: '/quote' },
  },
  {
    slug: 'hbcu-homecoming',
    name: 'HBCU & Homecoming Apparel',
    shortLabel: 'HBCU',
    heroLine: 'Homecoming, yard, probate and alumni-weekend apparel printed in the Atlanta University Center\'s backyard.',
    introHeading: 'Homecoming and HBCU apparel, printed locally',
    intro:
      "Atlanta homecoming season is its own economy, and we are twenty-five minutes from the Atlanta University Center. We print for student organizations, alumni chapters, bands, line groups, departments and families who all want the same thing: apparel that looks like it was designed on purpose and arrives before the weekend it was made for. Homecoming work is unusually deadline-driven and unusually design-heavy, which is a combination a lot of shops handle badly.",
    methodDetail:
      "Most homecoming art is full-color, gradient-heavy or photo-based, which makes DTF the default — there are no per-color setup charges, so a six-color design costs the same to set up as a one-color design. Screen printing becomes the cheaper choice once you are past roughly 50 shirts with a simple one- or two-color design, which is common for band and volunteer shirts. For alumni polos, jackets and bags we embroider instead, priced by stitch count.",
    examples: [
      'Homecoming weekend shirts and hoodies',
      'Alumni chapter and reunion-year apparel',
      'Student organization and department tees',
      'Band, dance line and spirit squad apparel',
      'Probate, line and crossing apparel',
      'Tailgate, yard-fest and step-show merch',
    ],
    options: [
      'Full-color DTF for gradient and photo-heavy artwork',
      'Screen printing once a simple design passes ~50 shirts',
      'Embroidered polos, quarter-zips and jackets for alumni',
      'Youth through 5XL in one order so families can match',
      'Tone-on-tone and metallic finishes for yard apparel',
      'A group web store so each person orders and pays their own size',
    ],
    process: [
      { step: 'Send the design or the idea', detail: 'Finished art, a rough sketch, or just a concept and your colors. If the file needs vectorizing there is usually a $20–$50 one-time art fee, quoted before any work starts.' },
      { step: 'Lock sizes early', detail: 'Size spread is what delays group orders, not printing. For larger groups we can open a web store so everyone submits their own size and pays individually.' },
      { step: 'Approve a mockup', detail: 'Nothing goes on a press without your written approval. Turnaround is counted from that approval.' },
      { step: 'Collect or ship', detail: 'Free pickup at the Fairburn shop, or we ship anywhere in the continental US — free over $150.' },
    ],
    faqs: [
      {
        q: 'Where can I get homecoming shirts printed in Atlanta?',
        a: 'We print homecoming and HBCU apparel from our shop in Fairburn, GA, about twenty-five minutes from the Atlanta University Center, and ship nationwide for alumni chapters outside Georgia. We handle student organizations, alumni groups, bands and families, with no minimum order.',
      },
      {
        q: 'Can you print Greek letters and organization marks?',
        a: 'We print the artwork you are authorised to use. Many organization marks and university logos are licensed trademarks, so for those we need you to supply the approved artwork or confirm you have permission from the organization or licensing office. We will tell you if something looks like it needs clearance rather than printing it and leaving you exposed.',
      },
      {
        q: 'How early should we order homecoming apparel?',
        a: 'Three to four weeks before the weekend is comfortable, because it leaves room for a design revision and a size change. Homecoming season is the busiest stretch of our year, so the earlier the date is on our schedule the more flexibility you keep. If you are already inside that window, ask anyway — see our rush printing page for what is still possible.',
      },
      {
        q: 'Can everyone in our group order and pay separately?',
        a: 'Yes. We can set up a group web store for your organization where each person picks their own size and pays for their own shirt, which removes the job of collecting money and tracking sizes from whoever got volunteered for it.',
      },
      {
        q: 'Do you print youth and extended sizes for family groups?',
        a: 'Yes — youth sizes through 5XL can go on the same order, which matters for alumni families bringing kids to homecoming. Extended sizes sometimes carry a small upcharge from the garment supplier, which we show on the quote rather than burying it.',
      },
    ],
    recommendedMethod: 'DTF for full-color art; screen printing past ~50 simple shirts',
    recommendedGarment: 'Comfort Colors or Bella+Canvas; embroidered polos for alumni',
    pricingHint: 'From $14/shirt at 24+',
    cta: { label: 'Quote Our Homecoming Order', to: '/quote' },
  },
  {
    slug: 'embroidered-polos',
    name: 'Embroidered Polos & Business Uniforms',
    shortLabel: 'Uniforms',
    heroLine: 'Stitched logos on polos, caps, jackets and workwear — priced by stitch count, not by colour.',
    introHeading: 'Embroidery for staff uniforms and branded apparel',
    intro:
      "Embroidery is what you want when the apparel has to look professional for a year rather than a weekend. Thread does not crack, fade or peel the way a print eventually will, which is why uniforms, caps and outerwear are almost always stitched rather than printed. We run multi-needle embroidery on polos, button-downs, caps, beanies, quarter-zips, jackets, aprons and bags for businesses across the south Atlanta metro — and because embroidery is priced by stitch count rather than by number of colours, a detailed multi-colour logo costs no more to stitch than a simple one of the same size.",
    methodDetail:
      "Embroidery needs a stitch file, not an image file. If you already have a DST, PES or EMB file we use it and there is no digitizing charge. If you do not, we digitize your logo for $25 per design — a one-time cost, after which that file is on record for every future reorder. From there the quote is driven by stitch count, which follows the physical size of the design: a left-chest logo is far cheaper to stitch than a full back. For very large or very detailed artwork we will tell you when a design needs simplifying to stitch cleanly at the size you want, because some fine detail simply does not survive in thread.",
    examples: [
      'Embroidered staff polos and button-downs',
      'Caps, beanies and visors with a stitched logo',
      'Quarter-zips, fleece and softshell jackets',
      'Contractor and trade workwear',
      'Salon, restaurant and hospitality aprons',
      'Branded bags, totes and duffels',
    ],
    options: [
      'Left chest, right chest, sleeve, cap front or full back placement',
      'Employee names stitched alongside the company logo',
      'Matching printed tees and embroidered polos on one order',
      'Thread colour matched as closely as the thread range allows',
      'Bring your own garments for us to embroider',
      'A business web store so staff can reorder their own sizes',
    ],
    process: [
      { step: 'Send your logo', detail: 'Any format to start. We will tell you whether it is already stitch-ready or needs digitizing at $25 per design.' },
      { step: 'Pick garments and placement', detail: 'Polo, cap, jacket or your own stock, and where the logo sits. Placement changes the stitch count and therefore the price.' },
      { step: 'Get a stitch-count quote', detail: 'Priced from the digitized file\'s actual stitch count, so the number you get is the number you pay.' },
      { step: 'Approve a sewn-out proof', detail: 'For a first run we can stitch a proof before committing the full order — worth doing when the logo has fine detail.' },
      { step: 'Reorder any time', detail: 'Your stitch file stays on record, so repeat orders skip both digitizing and setup.' },
    ],
    faqs: [
      {
        q: 'Where can I order embroidered polos for my business?',
        a: 'We embroider business polos at our shop at 6010 Renaissance Parkway, Fairburn, GA, serving the south Atlanta metro and shipping nationwide. Upload your logo on our embroidery quote page and we will come back with a stitch-count price on the garments you want. There is no minimum order.',
      },
      {
        q: 'How much does embroidery cost?',
        a: 'Embroidery is quoted from stitch count plus the garment, so the price follows how large and dense the design is rather than how many colours it has. If your logo has never been embroidered before there is a one-time $25 digitizing charge per design to convert it into a stitch file; if you already have a DST, PES or EMB file there is no digitizing charge at all.',
      },
      {
        q: 'What is digitizing and do I need it?',
        a: 'Digitizing converts your logo into a stitch file that tells the machine where to put every needle penetration. An embroidery machine cannot read a PNG or an AI file. It costs $25 per design, happens once, and the resulting file is kept on record so every reorder of that logo skips the charge.',
      },
      {
        q: 'Can you embroider garments I already own?',
        a: 'Yes. You can bring in or ship your own polos, caps or jackets and we will embroider them. We will flag anything that is risky to hoop — very stretchy knits, waterproof shells and fully lined jackets are the usual culprits — before we put a needle in apparel you have already paid for.',
      },
      {
        q: 'Should I choose embroidery or printing for staff uniforms?',
        a: 'Embroider anything staff wear repeatedly: polos, caps, jackets and workwear. Thread outlasts the garment and reads as more finished. Print when the design is large, full-colour or photographic, or when the apparel is for a one-off event — a stitched full-back design gets expensive fast because stitch count scales with area.',
      },
      {
        q: 'Can you add employee names as well as the logo?',
        a: 'Yes — names are commonly stitched opposite the logo or on a sleeve. Because each name is its own small stitch file, name personalisation is quoted per garment rather than per order.',
      },
    ],
    recommendedMethod: 'Multi-needle embroidery, priced by stitch count',
    recommendedGarment: 'Piqué polos and structured caps; quarter-zips for outerwear',
    pricingHint: '$25 one-time digitizing, then by stitch count',
    cta: { label: 'Get an Embroidery Quote', to: '/embroidery' },
  },
  {
    slug: 'small-orders',
    name: 'Small-Quantity & Single-Shirt Orders',
    shortLabel: 'Small orders',
    heroLine: 'One shirt or five. No minimum, no setup fee, no being told to come back with a bigger order.',
    introHeading: 'Why we take orders most shops turn away',
    intro:
      "A lot of print shops set a 12 or 24 piece minimum, which is why a single memorial shirt, one birthday tee or five shirts for a small team is so hard to get printed. We do not have a minimum. We will print one shirt. What is honest to say up front is that small orders cost more per shirt than big ones — the artwork prep, the mockup and the machine setup take the same time for one shirt as for a hundred, so that cost is spread over fewer pieces. That is arithmetic, not a policy, and it is why a single shirt lands around $25–$32 while the same shirt at 100+ pieces is in the $8–$12 range.",
    methodDetail:
      "Small orders are almost always DTF, because DTF has no per-colour setup. Screen printing needs a separate screen burned for every colour in the design, and at low quantities those setup costs dominate the price — a two-colour screen-printed design makes no economic sense at five shirts. DTF prints your full-colour artwork onto transfer film and heat-presses it, so a five-shirt order with a photographic design is completely routine. Screen printing only becomes the cheaper choice somewhere around 50 shirts with a simple design, and we will tell you when you have crossed that line.",
    examples: [
      'A single custom shirt as a gift',
      'Memorial and celebration-of-life shirts for immediate family',
      'Five to ten shirts for a small team or crew',
      'One-off prototype before committing to a bulk run',
      'Replacement for a shirt that was lost or outgrown',
      'Samples to show a committee before they vote on the order',
    ],
    options: [
      'Full-colour artwork at any quantity, with no per-colour charge',
      'Front and back printing on a single shirt',
      'Mixed sizes and mixed garment colours across a handful of shirts',
      'Design it yourself in the free Design Studio',
      'Bring your own garment for us to print on',
      'Free local pickup in Fairburn, so there is no shipping cost on a $30 order',
    ],
    process: [
      { step: 'Design it or send it', detail: 'Build it yourself in the free Design Studio, or send any artwork you already have. A 300 dpi PNG with a transparent background is ideal.' },
      { step: 'See the price before you commit', detail: 'The instant quote calculator prices small quantities directly — no waiting on an email to find out whether you can afford it.' },
      { step: 'Approve the mockup', detail: 'You see exactly what will be printed, at the size and placement it will print, before we press anything.' },
      { step: 'Pick it up or have it shipped', detail: 'Pickup at the Fairburn shop is free. Shipping runs $7–$15 depending on weight, which on a one-shirt order is worth weighing against the drive.' },
    ],
    faqs: [
      {
        q: 'Do you have a minimum order for custom shirts?',
        a: 'No. We will print a single custom shirt, and we will print a thousand. Smaller orders cost more per shirt because artwork prep, mockup and setup take the same time regardless of quantity, but there is no quantity below which we stop taking the job.',
      },
      {
        q: 'How much does it cost to print one custom t-shirt?',
        a: 'A single shirt with a print in one location runs roughly $25–$32 depending on which garment you choose. There is no separate setup fee on top of that, and no per-colour charge, because small orders are printed with DTF rather than screens.',
      },
      {
        q: 'How much does it cost to print 25 custom t-shirts?',
        a: 'At 24 shirts and up you are in the $14–$18 per shirt range depending on garment, print method and how many locations the design prints in, so 25 shirts lands roughly in the $350–$450 bracket. Bulk pricing starts at 24, so 25 shirts is just past the first real price break. Use the instant quote calculator for a live figure on your specific garment and design.',
      },
      {
        q: 'Can I get just five shirts printed?',
        a: 'Yes, and it is one of the most common orders we take. Five shirts is printed with DTF, which means your artwork can be full colour or photographic at no extra cost, and mixed sizes across those five shirts are no problem.',
      },
      {
        q: 'Why do small orders cost more per shirt?',
        a: 'Because the fixed work does not shrink with the order. Preparing the artwork, building the mockup and setting up the press take about the same time for one shirt as for two hundred, so on a small order that time is divided across fewer shirts. It is the same reason a single printed photo costs more per copy than a hundred.',
      },
      {
        q: 'Can I bring my own shirt for you to print on?',
        a: 'Usually yes, and people often do for a jacket or a shirt with sentimental value. We will tell you honestly if the fabric is a poor candidate for heat pressing before we risk a garment you cannot replace — some performance fabrics and waterproof coatings do not survive the press.',
      },
    ],
    recommendedMethod: 'DTF — no screens, so no setup cost to spread over few shirts',
    recommendedGarment: 'Bella+Canvas or Gildan Heavy Cotton',
    pricingHint: 'Single shirts around $25–$32',
    cta: { label: 'Price My Small Order', to: '/quote' },
  },
];

export function findVerticalLanding(slug: string | undefined): VerticalLanding | null {
  if (!slug) return null;
  return VERTICAL_LANDINGS.find((v) => v.slug === slug) || null;
}
