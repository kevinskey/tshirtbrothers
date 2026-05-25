// City-specific copy for the /custom-shirts/<city> landing pages.
//
// Each entry produces its own URL, its own H1, its own meta description,
// and a paragraph or two of city-specific framing so Google doesn't see
// these as duplicate pages. Add a city by appending an entry — the route
// component renders the rest.
//
// Naming notes:
//  - `slug` is the URL piece. Keep it lowercase, hyphenated, kebab-case.
//  - `nearbyLandmarks` is freeform — schools, neighborhoods, anything a
//    local would recognize. Helps with E-E-A-T and avoids the page
//    reading like Mad Libs templated junk.
//  - `driveMinutes` is approximate one-way from the Fairburn shop. Used
//    in the "delivery / pickup" callout.

export type CityLanding = {
  slug: string;
  name: string;
  region: 'metro' | 'south-metro' | 'fayette' | 'coweta';
  driveMinutes: number;
  population: string;
  nearbyLandmarks: string[];
  intro: string;
  whyHere: string;
};

export const CITY_LANDINGS: CityLanding[] = [
  {
    slug: 'atlanta',
    name: 'Atlanta',
    region: 'metro',
    driveMinutes: 25,
    population: '500,000+',
    nearbyLandmarks: ['Downtown', 'Midtown', 'Buckhead', 'East Atlanta', 'Decatur', 'Grant Park'],
    intro:
      'Atlanta runs on community — churches, schools, sports teams, small businesses, family reunions, festivals. We print custom apparel for all of them, from one-off prints to thousand-shirt drops, with pickup and shipping options that work for any neighborhood.',
    whyHere:
      'Pickup in Fairburn is about 25 minutes from downtown Atlanta — closer than most folks realize. For larger Atlanta orders we offer local delivery; for one-offs, USPS/UPS gets you a finished shirt in 2-3 days.',
  },
  {
    slug: 'fairburn',
    name: 'Fairburn',
    region: 'south-metro',
    driveMinutes: 0,
    population: '15,000+',
    nearbyLandmarks: ['Renaissance Parkway', 'Old Town Fairburn', 'Creekside High', 'South Fulton Parkway'],
    intro:
      'TShirt Brothers is your hometown custom apparel shop, right here in Fairburn. We print for Creekside teams, Old Town businesses, churches up and down Senoia Road, and family reunions across the city.',
    whyHere:
      'Free local pickup at our shop on Renaissance Parkway. Stop in, drop off a USB with your art, or just talk it out at the counter — same-day pickup is a real option for small DTF runs.',
  },
  {
    slug: 'tyrone',
    name: 'Tyrone',
    region: 'fayette',
    driveMinutes: 10,
    population: '7,000+',
    nearbyLandmarks: ['Sandy Creek High', 'Shamrock Park', 'Tyrone Tavern', 'Senoia Road'],
    intro:
      'Custom t-shirts and apparel for Tyrone schools, sports teams, churches, and small businesses. We print Sandy Creek booster shirts, ministry tees, and team uniforms for groups all across the Tyrone area.',
    whyHere:
      'About 10 minutes from our Fairburn shop. Local pickup is free; we also drop off larger orders directly to Tyrone schools and event organizers on request.',
  },
  {
    slug: 'peachtree-city',
    name: 'Peachtree City',
    region: 'fayette',
    driveMinutes: 20,
    population: '38,000+',
    nearbyLandmarks: ['McIntosh High', 'Starr\'s Mill', 'Drake Field', 'Lake Peachtree', 'The Avenue'],
    intro:
      'Custom apparel for Peachtree City — McIntosh and Starr\'s Mill teams, neighborhood golf cart clubs, church groups, swim leagues, and PTOs. Quality printing without the inflated PTC prices most local shops charge.',
    whyHere:
      'About 20 minutes from PTC on Highway 74. Pickup in Fairburn is free; for bigger team orders we can coordinate a drop at your school or community center.',
  },
  {
    slug: 'fayetteville',
    name: 'Fayetteville',
    region: 'fayette',
    driveMinutes: 15,
    population: '19,000+',
    nearbyLandmarks: ['Fayette County High', 'Sandy Creek', 'Pinewood Forest', 'Trilith', 'Fayetteville Square'],
    intro:
      'Custom t-shirts, hoodies, and uniforms for Fayetteville — Fayette County and Sandy Creek schools, businesses around the square, churches, and the Pinewood Studios / Trilith production community.',
    whyHere:
      'A 15-minute drive from our Fairburn shop. Free pickup, fast turnaround, no minimums. We also work with the production community on custom crew shirts and wrap-party tees.',
  },
  {
    slug: 'newnan',
    name: 'Newnan',
    region: 'coweta',
    driveMinutes: 25,
    population: '45,000+',
    nearbyLandmarks: ['Downtown Newnan', 'Coweta County Schools', 'East Coweta High', 'Newnan High', 'NCG Cinemas'],
    intro:
      'Screen printing, DTF, and embroidery for Newnan — East Coweta and Newnan High teams, downtown shops, churches across Coweta County, and small businesses building their brand.',
    whyHere:
      'About 25 minutes up I-85. Local pickup is free in Fairburn, and we ship anywhere in the country for groups that can\'t make the drive.',
  },
  {
    slug: 'college-park',
    name: 'College Park',
    region: 'south-metro',
    driveMinutes: 15,
    population: '14,000+',
    nearbyLandmarks: ['Main Street', 'Camp Creek', 'Hartsfield-Jackson area', 'Woodward Academy'],
    intro:
      'Custom apparel for College Park — Woodward families, Main Street businesses, churches, sports leagues, and the broader Camp Creek / South Fulton community.',
    whyHere:
      'Quick 15-minute drive from College Park to our Fairburn shop. Free pickup, no minimums, same-day rush possible on small jobs.',
  },
  {
    slug: 'union-city',
    name: 'Union City',
    region: 'south-metro',
    driveMinutes: 10,
    population: '23,000+',
    nearbyLandmarks: ['Shannon Mall area', 'Creekside Parkway', 'Langston Hughes High', 'South Fulton'],
    intro:
      'Custom shirts, hoodies, and uniforms for Union City — Langston Hughes teams, local churches, small businesses, and the South Fulton community we share a neighborhood with.',
    whyHere:
      'Our closest city after Fairburn — about 10 minutes door to door. Free pickup, and we keep popular blank inventory on hand for fast turnaround.',
  },
];

export function findCityLanding(slug: string | undefined): CityLanding | null {
  if (!slug) return null;
  return CITY_LANDINGS.find((c) => c.slug === slug) || null;
}
