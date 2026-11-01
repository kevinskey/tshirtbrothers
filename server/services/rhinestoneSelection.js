import { computeRhinestoneQuote } from './rhinestonePricing.js';

const SIZES = {
  accent: { label: 'Name or monogram (~4in)', stones: 250 },
  standard: { label: 'Standard chest (~8in)', stones: 500 },
  full: { label: 'Full front (~11in)', stones: 900 },
  allover: { label: 'Big & bold (~14in)', stones: 1600 },
};
const GARMENTS = {
  transfer: { label: 'Transfer only', cost: 0 },
  tee: { label: 'Cotton tee', cost: 3.5 },
  tank: { label: 'Tank or crop', cost: 4.25 },
  perf: { label: 'Performance tee', cost: 5.5 },
  hoodie: { label: 'Hoodie', cost: 14 },
};

// Rebuild the public calculator selection from server-owned presets. Never
// accept a client-supplied garment cost, stone count or total at quote save.
export function priceRhinestoneSelection(selection, settings) {
  const size = SIZES[selection?.sizeKey];
  const garment = GARMENTS[selection?.garmentKey];
  if (!size || !garment) throw new Error('Choose a valid rhinestone design size and garment');
  const quantity = Number(selection.quantity);
  const numLocations = Number(selection.numLocations);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 250) throw new Error('Rhinestone quantity must be 1 to 250');
  if (![1, 2].includes(numLocations)) throw new Error('Choose one or two rhinestone placements');
  const inputs = {
    quantity, numLocations, stoneCount: size.stones,
    garmentCost: garment.cost, garmentName: garment.label,
    rush: selection.rush === true,
    designSize: size.label, methodName: 'Rhinestone', qualityTier: '',
    locations: { front: true, back: numLocations === 2 },
  };
  const priced = computeRhinestoneQuote(inputs, settings);
  return {
    inputs,
    calc: { ...priced, per_shirt: priced.effectivePerPiece,
      turnaround_days: 0,
      breakdown: { ...priced.breakdown, num_locations: numLocations, colors_per_location: 1 } },
  };
}
