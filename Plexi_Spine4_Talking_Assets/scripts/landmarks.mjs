/**
 * Hand-measured landmarks for Plexi_original_full_reference.png (300 x 860).
 * Everything is in ORIGINAL pixel units (origin top-left, y down). The scripts multiply by SCALE.
 * "L" = screen-left (the character's right), "R" = screen-right. This convention is used for every
 * file, slot and bone name in the rig.
 *
 * If you swap in a higher-resolution render of the same pose, rescale these numbers (or re-measure)
 * and rerun `npm run prepare`.
 */
export const SOURCE = "Plexi_original_full_reference.png";
export const SCALE = 4;
/** Crop of the original used as the working canvas (head, neck, shoulders, full logo). */
export const CROP = { x: 0, y: 0, w: 300, h: 352 };

export const EYES = {
  L: { center: [147.5, 118.5], search: [14, 10.5], irisR: 6.8, pupilR: 3.2, box: [133, 108, 163, 131] },
  R: { center: [193.0, 121.0], search: [14, 10.5], irisR: 6.8, pupilR: 3.2, box: [178, 110, 209, 133] },
};

/** Brow search boxes [x0, y0, x1, y1] and the x limit where hair starts at brow height. */
export const BROWS = {
  L: { box: [129, 87, 170, 107], hairSide: "left", hairLimitX: 131 },
  R: { box: [177, 87, 213, 109], hairSide: "right", hairLimitX: 211 },
};

export const NOSE_BOX = [158, 134, 186, 149];

export const MOUTH = {
  center: [168.5, 155.0],
  /** Footprint shared by every mouth attachment (so swaps never change scale or float). */
  box: [140, 145, 198, 169],
  cornerL: [144, 150.5],
  cornerR: [193, 151],
  restWidth: 49,
};

/** Jaw / chin contour: head pixels are on or above this curve, neck pixels below. */
export const JAW = [
  [116, 146], [122, 153], [128, 158], [132, 162], [140, 170], [150, 175.5], [160, 177.5], [168, 178],
  [180, 176.5], [190, 174], [200, 171], [208, 166], [214, 160], [218, 155], [224, 149], [230, 143],
];

/** Neck polygon (clockwise). The top edge is hidden behind the head and gets reconstructed. */
export const NECK_POLY = [
  [134, 154], [216, 154], [214, 166], [208, 176], [195, 182], [192, 192], [188, 203], [181, 213],
  [172, 221], [165, 226], [158, 220], [152, 210], [150, 196], [149, 184], [146, 176], [138, 168], [134, 160],
];

/** Drawstring boxes [x0, y0, x1, y1]. */
export const DRAWSTRINGS = { L: [140, 217, 151, 263], R: [175, 217, 187, 263] };

/** Everything below this y (outside the head/neck) is hoodie. */
export const TORSO_TOP_Y = 170;
/** Hair is only searched above this y. */
export const HAIR_MAX_Y = 162;

/** Approximate pivots (original px) used by the skeleton builder. */
export const PIVOTS = {
  body: [150, 300],
  neck: [172, 214],
  head: [172, 176],
  hairFront: [175, 60],
  mouth: MOUTH.center,
  drawstringL: [145.5, 218],
  drawstringR: [177.5, 218],
};

export const PALETTE_SAMPLES = {
  skinCheek: [125, 135, 135, 145],
  skinForehead: [160, 88, 175, 95],
  neck: [160, 195, 175, 205],
  hoodieWhite: [100, 260, 110, 270],
};
