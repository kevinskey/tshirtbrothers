// Photo-slot geometry for the card designer. Normalized [x, y, w, h]
// on the template artwork; measured against the shipped art in
// public/cgc/cards. Templates absent here (3-D mockup shots) fall
// back to the inquiry-only flow.

export type SlotShape = 'rect' | 'ellipse';
export type CardSlotSpec = { shape: SlotShape; slots: Array<[number, number, number, number]> };

export const CARD_SLOTS: Record<string, CardSlotSpec> = {
  'joy-crimson-trio': { shape: 'rect', slots: [[0.075, 0.09, 0.2555, 0.52], [0.3725, 0.09, 0.2555, 0.52], [0.67, 0.09, 0.2555, 0.52]] },
  'noel-navy-gold': { shape: 'rect', slots: [[0.078, 0.058, 0.4, 0.565], [0.522, 0.058, 0.4, 0.565]] },
  'classic-green-frame': { shape: 'rect', slots: [[0.108, 0.078, 0.784, 0.555]] },
  'gilded-wreath': { shape: 'ellipse', slots: [[0.17, 0.13, 0.66, 0.455]] },
  'snowline-trio': { shape: 'rect', slots: [[0.062, 0.272, 0.28, 0.315], [0.36, 0.272, 0.28, 0.315], [0.658, 0.272, 0.28, 0.315]] },
  'fa-la-la-pink': { shape: 'ellipse', slots: [[0.145, 0.075, 0.71, 0.625]] },
  'cream-quad': { shape: 'rect', slots: [[0.078, 0.048, 0.41, 0.29], [0.512, 0.048, 0.41, 0.29], [0.078, 0.372, 0.41, 0.29], [0.512, 0.372, 0.41, 0.29]] },
  'merry-bright-pop': { shape: 'rect', slots: [[0.08, 0.065, 0.84, 0.55]] },
  'peace-on-earth': { shape: 'rect', slots: [[0.115, 0.075, 0.77, 0.58]] },
  'holly-jolly-green': { shape: 'rect', slots: [[0.035, 0.135, 0.45, 0.415], [0.515, 0.135, 0.45, 0.415]] },
  'hello-2027': { shape: 'rect', slots: [[0.02, 0.02, 0.565, 0.355], [0.6, 0.02, 0.38, 0.355], [0.02, 0.39, 0.3, 0.33], [0.335, 0.39, 0.295, 0.33], [0.645, 0.39, 0.335, 0.33]] },
  'happy-holidays-six': { shape: 'rect', slots: [[0.05, 0.038, 0.44, 0.262], [0.51, 0.038, 0.44, 0.262], [0.05, 0.315, 0.44, 0.262], [0.51, 0.315, 0.44, 0.262], [0.05, 0.592, 0.44, 0.262], [0.51, 0.592, 0.44, 0.262]] },
  'o-holy-night': { shape: 'rect', slots: [[0.075, 0.05, 0.85, 0.605]] },
  'cheers-new-year': { shape: 'rect', slots: [[0.045, 0.035, 0.91, 0.59]] },
  'merry-bright-six': { shape: 'rect', slots: [[0.015, 0.033, 0.31, 0.325], [0.345, 0.033, 0.31, 0.325], [0.675, 0.033, 0.31, 0.325], [0.015, 0.375, 0.31, 0.325], [0.345, 0.375, 0.31, 0.325], [0.675, 0.375, 0.31, 0.325]] },
  'joy-joy-joy': { shape: 'rect', slots: [[0.165, 0.048, 0.67, 0.272], [0.165, 0.325, 0.67, 0.272], [0.165, 0.602, 0.67, 0.272]] },
  'warm-winter-wishes': { shape: 'rect', slots: [[0.045, 0.06, 0.43, 0.54], [0.505, 0.06, 0.45, 0.54]] },
  'golden-generations': { shape: 'rect', slots: [[0.045, 0.03, 0.91, 0.685]] },
  'greetings-family': { shape: 'rect', slots: [[0.05, 0.13, 0.43, 0.52], [0.52, 0.13, 0.43, 0.52]] },
  'candy-corner': { shape: 'rect', slots: [[0.08, 0.095, 0.84, 0.64]] },
  'navy-triptych': { shape: 'rect', slots: [[0.033, 0.04, 0.296, 0.695], [0.352, 0.04, 0.296, 0.695], [0.671, 0.04, 0.296, 0.695]] },
  'ivory-script': { shape: 'rect', slots: [[0.155, 0.115, 0.69, 0.515]] },
  'let-it-snow': { shape: 'rect', slots: [[0.055, 0.075, 0.435, 0.575], [0.52, 0.075, 0.435, 0.575]] },
  'onward-upward': { shape: 'rect', slots: [[0.09, 0.06, 0.82, 0.65]] },
};
