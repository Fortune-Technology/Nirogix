// Colour maths for the few places a brand colour has to be used somewhere the design
// tokens cannot reach — today, the dark modules of a printed QR code (ADR-056).
//
// The rule these exist to enforce: **a brand colour is a preference, legibility is not.**
// A hospital may pick any accent it likes for its interface, because the token layer
// derives readable hover/subtle/ring values from it. A QR code has no such layer — it is
// read by a camera, often from a photocopy, at an angle, in bad corridor light — so a
// pale accent must be darkened rather than used as chosen or silently replaced by black.

export type Rgb = { r: number; g: number; b: number };

/** Accepts `#rgb` and `#rrggbb`, with or without the hash. Returns null if it is neither. */
export function parseHexColor(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function toHexColor({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG relative luminance (sRGB), 0 for black through 1 for white. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, 1 (identical) through 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The darkest-necessary version of a colour that still reads against `against`.
 *
 * Returns the colour unchanged when it already clears `minContrast`; otherwise blends it
 * toward black in small steps until it does. Blending preserves the hue, so a hospital's
 * light teal becomes a *darker teal* rather than black — recognisably still their colour,
 * which is the point of letting them choose it at all.
 *
 * `minContrast` defaults to **5:1** — above WCAG's 4.5:1 minimum for text, because the
 * reader here is a camera and the medium may be a photocopy, but not so high that it
 * overrides a colour already dark enough to work. Measured against real accents: a deep
 * teal (`#0f766e`, 5.5:1) and a violet (`#7c3aed`, 5.7:1) pass and print as chosen; a
 * mid teal (`#0d9488`, 3.7:1) is darkened a little; pale yellows and pinks (around 2:1)
 * are darkened a lot, which is the case this function exists for.
 */
export function ensureContrast(
  color: string,
  { against = '#ffffff', minContrast = 5 }: { against?: string; minContrast?: number } = {},
): string | null {
  const rgb = parseHexColor(color);
  const bg = parseHexColor(against);
  if (!rgb || !bg) return null;
  if (contrastRatio(rgb, bg) >= minContrast) return toHexColor(rgb);

  // 20 steps of 5% toward black; the last one *is* black, so this always terminates
  // with a legible result rather than giving up and returning the unreadable original.
  for (let step = 1; step <= 20; step++) {
    const factor = 1 - step * 0.05;
    const darker: Rgb = { r: rgb.r * factor, g: rgb.g * factor, b: rgb.b * factor };
    if (contrastRatio(darker, bg) >= minContrast) return toHexColor(darker);
  }
  return '#000000';
}
