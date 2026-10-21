// Shop by Occasion — curated collection definitions for the eight CGC
// occasion pages (approved reference design, October 2026).
//
// JDS supplies no occasion data, so each collection is an editorial
// mapping onto the live catalog expressed as search tokens the existing
// /api/cgc/products endpoint already understands: a whitespace-separated
// term may contain |-alternatives (ORed), and separate terms are ANDed.
// Every union token below was verified against the live catalog to cover
// its occasion's featuredSkus (scratch probe, 2026-10-21).

import type { LucideIcon } from 'lucide-react';
import {
  Award, Cake, Gem, GraduationCap, Home, Sun, TreePine, Volleyball,
} from 'lucide-react';

export interface OccasionTypeChip {
  label: string;
  token: string; // |-joined single-word alternatives (server ORs them)
}

export interface OccasionConfig {
  key: string; // legacy /shop?occasion= key
  slug: string; // /occasions/:slug
  label: string;
  icon: LucideIcon;
  eyebrow: string;
  headline: [string, string];
  intro: string;
  /** Union search token for the whole collection (max 12 alternatives). */
  token: string;
  chips: OccasionTypeChip[];
  /** Curated order for "Featured picks" + the hero imagery (first 2–3). */
  featuredSkus: string[];
  feature: { title: string; body: string };
}

// Material filter options, shared across occasions. Tokens follow the
// same |-alternation contract and are ANDed with the type/union token.
export const OCCASION_MATERIALS: OccasionTypeChip[] = [
  { label: 'Wood & bamboo', token: 'wood|bamboo|acacia|walnut|maple|alder|cherry' },
  { label: 'Metal & stainless', token: 'stainless|metal|brass|aluminum|camel' },
  { label: 'Ceramic', token: 'ceramic|stoneware' },
  { label: 'Glass', token: 'glass|jade' },
  { label: 'Crystal', token: 'crystal' },
  { label: 'Leatherette', token: 'leatherette|leather' },
  { label: 'Acrylic', token: 'acrylic' },
  { label: 'Marble & stone', token: 'marble|slate|stone' },
];

export const OCCASION_BUDGETS = [
  { key: 'all', label: 'Any budget', min: '', max: '' },
  { key: 'under-25', label: 'Under $25', min: '', max: '2499' },
  { key: '25-50', label: '$25–$50', min: '2500', max: '4999' },
  { key: '50-100', label: '$50–$100', min: '5000', max: '9999' },
  { key: 'over-100', label: '$100 & up', min: '10000', max: '' },
] as const;

export const OCCASION_SORTS = [
  { key: 'featured', label: 'Featured picks' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'name', label: 'Name: A to Z' },
] as const;

const TYPES = {
  tumblers: { label: 'Tumblers', token: 'tumbler' },
  mugs: { label: 'Mugs', token: 'mug|stein' },
  journals: { label: 'Journals & portfolios', token: 'journal|portfolio|padfolio|notebook' },
  frames: { label: 'Frames & keepsakes', token: 'frame|keepsake|cube|paperweight' },
  giftSets: { label: 'Gift sets', token: 'flask|boxed|hamper|set' },
  cuttingBoards: { label: 'Cutting boards', token: 'cutting|charcuterie' },
  coasters: { label: 'Coasters', token: 'coaster' },
  ornaments: { label: 'Ornaments', token: 'ornament' },
  awards: { label: 'Awards & plaques', token: 'award|plaque|trophy|medal' },
  bottles: { label: 'Water bottles', token: 'bottle' },
  teamAccessories: { label: 'Team accessories', token: 'keychain|lanyard|opener|bagtag' },
};

export const OCCASIONS: OccasionConfig[] = [
  {
    key: 'birthday',
    slug: 'birthday',
    label: 'Birthday',
    icon: Cake,
    eyebrow: 'BIRTHDAY GIFTS',
    headline: ['Their day.', 'Their kind of gift.'],
    intro: 'Their favorite things, made personal. Give a birthday gift that’s all about them.',
    token: 'tumbler|mug|journal|portfolio|frame|keepsake|flask|coaster|bottle|cube|cutting',
    chips: [TYPES.tumblers, TYPES.mugs, TYPES.journals, TYPES.frames, TYPES.giftSets],
    featuredSkus: ['LTM7212', 'GFT785', 'PTF135', 'LMG23', 'GFT3066', 'FSK302', 'LTM862', 'SM11CC', 'SWB913', 'CRY048S'],
    feature: {
      title: 'A name. A memory. A little magic.',
      body: 'Start with something they will love, then make it meaningful with a name, a date, or words only you would choose.',
    },
  },
  {
    key: 'wedding',
    slug: 'wedding-anniversary',
    label: 'Wedding & Anniversary',
    icon: Gem,
    eyebrow: 'WEDDING & ANNIVERSARY GIFTS',
    headline: ['Celebrate love.', 'Make it personal.'],
    intro: 'For the big day and every year after. Give their love story a personal touch.',
    token: 'cutting|charcuterie|tumbler|frame|keepsake|coaster|ornament|flask|cube|toasting',
    chips: [TYPES.cuttingBoards, TYPES.tumblers, TYPES.frames, TYPES.coasters, TYPES.ornaments],
    featuredSkus: ['GFT3066', 'LTM862', 'PTF135', 'K9305', 'GFT2323', 'CE6506', 'CST16', 'FSK302', 'CRY048S', 'LTM7214'],
    feature: {
      title: 'Their story, beautifully remembered.',
      body: 'A shared name, a meaningful date, or a few heartfelt words can turn an everyday favorite into a reminder of their life together.',
    },
  },
  {
    key: 'graduation',
    slug: 'graduation',
    label: 'Graduation',
    icon: GraduationCap,
    eyebrow: 'GRADUATION GIFTS',
    headline: ['Big dreams.', 'A personal touch.'],
    intro: 'Celebrate how far they’ve come with a personal gift for everything that comes next.',
    token: 'journal|portfolio|padfolio|tumbler|frame|keepsake|plaque|award|bottle|cube|mug',
    chips: [TYPES.journals, TYPES.tumblers, TYPES.frames, TYPES.awards, TYPES.bottles],
    featuredSkus: ['GFT186', 'LTM7211', 'PTF135', 'GFT785', 'SWB913', 'CRY048S', 'BAM11013', 'GFT352A', 'LMG23', 'LTM7212'],
    feature: {
      title: 'For everything that comes next.',
      body: 'Mark their achievement with their name, graduation year, or a few encouraging words to carry into the next chapter.',
    },
  },
  {
    key: 'retirement',
    slug: 'retirement',
    label: 'Retirement',
    icon: Sun,
    eyebrow: 'RETIREMENT GIFTS',
    headline: ['A lasting legacy.', 'A new adventure.'],
    intro: 'Honor their lasting impact and celebrate the adventures ahead with a gift full of meaning.',
    token: 'award|plaque|frame|keepsake|tumbler|journal|portfolio|flask|clock|cube|crystal|cutting',
    chips: [TYPES.awards, TYPES.frames, TYPES.tumblers, TYPES.journals, TYPES.giftSets],
    featuredSkus: ['CRY059M', 'GFT186', 'BAM11013', 'LTM7212', 'CE6506', 'GFT785', 'FSK302', 'PTF135', 'GFT2323', 'LTM862'],
    feature: {
      title: 'Say more than “thank you.”',
      body: 'Honor the people, the work, and the difference they made with a message that celebrates both their legacy and what comes next.',
    },
  },
  {
    key: 'recognition',
    slug: 'awards-recognition',
    label: 'Awards & Recognition',
    icon: Award,
    eyebrow: 'AWARDS & RECOGNITION',
    headline: ['Well earned.', 'Worth celebrating.'],
    intro: 'Put their name on a moment that matters. Celebrate the people who make a difference.',
    token: 'award|plaque|trophy|medal|journal|portfolio|frame|tumbler|mug|cube|crystal|resin',
    chips: [TYPES.awards, TYPES.journals, TYPES.frames, TYPES.tumblers, TYPES.mugs],
    featuredSkus: ['CRY059M', 'BAM11013', 'GFT352A', 'CRY048S', 'CE6506', 'GFT186', 'LTM7214', 'SBR151', 'GFT785', 'PTF135'],
    feature: {
      title: 'Make the moment mean something.',
      body: 'Celebrate a milestone, recognize exceptional service, or thank someone whose contribution deserves to be remembered.',
    },
  },
  {
    key: 'holiday',
    slug: 'holiday',
    label: 'Holiday',
    icon: TreePine,
    eyebrow: 'HOLIDAY GIFTS',
    headline: ['More personal.', 'More holiday joy.'],
    intro: 'Names, memories, and a little holiday magic. Find something personal for everyone on your list.',
    token: 'ornament|tumbler|mug|cutting|charcuterie|flask|frame|stocking|santa|keepsake|journal',
    chips: [TYPES.ornaments, TYPES.tumblers, TYPES.mugs, TYPES.cuttingBoards, TYPES.giftSets],
    featuredSkus: ['GFT1113', 'LTM7212', 'GFT2323', 'SAC103', 'LMG24', 'FSK302', 'K9305', 'GFT3066', 'SBL005', 'GFT785'],
    feature: {
      title: 'A tradition with their name on it.',
      body: 'From a keepsake for the tree to something for the table, choose a thoughtful detail they can make part of their season.',
    },
  },
  {
    key: 'housewarming',
    slug: 'housewarming',
    label: 'Housewarming',
    icon: Home,
    eyebrow: 'HOUSEWARMING GIFTS',
    headline: ['A new address.', 'A personal touch.'],
    intro: 'A new home, a new chapter. Give something thoughtful for their everyday moments.',
    token: 'cutting|charcuterie|coaster|mug|frame|keepsake|tumbler|ornament|serving|kitchen',
    chips: [TYPES.cuttingBoards, TYPES.coasters, TYPES.mugs, TYPES.frames, TYPES.tumblers],
    featuredSkus: ['GFT3066', 'CST16', 'PTF135', 'LMG24', 'GFT2323', 'LTM862', 'CE6506', 'SM11CC', 'K9305', 'LTM7214'],
    feature: {
      title: 'Little details. A feeling of home.',
      body: 'Celebrate their first place, their next place, or their forever place with something that feels like it belongs to them.',
    },
  },
  {
    key: 'sports',
    slug: 'sports-fan-gifts',
    label: 'Sports & Fan Gifts',
    icon: Volleyball,
    eyebrow: 'SPORTS & FAN GIFTS',
    headline: ['Team spirit.', 'Made personal.'],
    intro: 'For the players, coaches, and fans. Turn a great season into a lasting memory.',
    token: 'tumbler|mug|bottle|keychain|lanyard|opener|plaque|trophy|award|medal|crystal|basketball',
    chips: [TYPES.teamAccessories, TYPES.bottles, TYPES.awards, TYPES.tumblers, TYPES.mugs],
    featuredSkus: ['SBR151', 'SWB913', 'BKR8', 'LTM7212', 'GFT770', 'BAM11013', 'LTM7211', 'SM11CC', 'LMG23', 'CRY059M'],
    feature: {
      title: 'Remember the season. Celebrate the team.',
      body: 'A name, a number, or a message of appreciation turns a team gift into a memory for the people who made it happen.',
    },
  },
];

export const occasionBySlug = (slug: string) => OCCASIONS.find((o) => o.slug === slug);
export const occasionByKey = (key: string) => OCCASIONS.find((o) => o.key === key);
