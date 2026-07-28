/**
 * WCAG 2.x relative luminance and contrast, for asserting the design tokens.
 *
 * This exists so "is this colour legal?" is a test failure rather than a
 * design review someone skipped. The formulas are from WCAG 2.1 §1.4.3.
 */

/** Parse #rgb or #rrggbb into 0-255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1:1 to 21:1. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Approximate how a colour appears under the three common forms of
 * colour-vision deficiency, so we can check that two recipient colours don't
 * collapse into each other. Brettel/Viénot-style linear approximation — good
 * enough to catch a collision, not a substitute for testing with real users.
 */
export type Deficiency = 'protanopia' | 'deuteranopia' | 'tritanopia';

const MATRICES: Record<Deficiency, number[][]> = {
  protanopia: [
    [0.567, 0.433, 0.0],
    [0.558, 0.442, 0.0],
    [0.0, 0.242, 0.758],
  ],
  deuteranopia: [
    [0.625, 0.375, 0.0],
    [0.7, 0.3, 0.0],
    [0.0, 0.3, 0.7],
  ],
  tritanopia: [
    [0.95, 0.05, 0.0],
    [0.0, 0.433, 0.567],
    [0.0, 0.475, 0.525],
  ],
};

export function simulate(hex: string, kind: Deficiency): [number, number, number] {
  const [r, g, b] = parseHex(hex);
  const m = MATRICES[kind]!;
  return m.map((row) =>
    Math.max(0, Math.min(255, Math.round(row[0]! * r + row[1]! * g + row[2]! * b))),
  ) as [number, number, number];
}

/** Straight-line distance in RGB space — a crude but serviceable "are these two the same colour?" */
export function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
