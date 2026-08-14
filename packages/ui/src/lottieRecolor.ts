// Recolour a Lottie animation to the brand hue at runtime. Rather than flattening the
// whole animation to one colour (which would erase the illustration), this shifts only the
// "brand-adjacent" family — saturated colours whose hue falls in a band around the source
// accent (the blues in doctor.json / ambulance.json) — onto the brand's hue, preserving each
// colour's lightness so shading survives. Skin tones, whites, blacks, greys, and the red
// cross are left untouched. Fully data-driven, so it re-runs when the brand colour changes.

type Rgb = [number, number, number]; // each 0..1

function parseColor(input: string): Rgb | null {
  const s = input.trim();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    if (full.length < 6) return null;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r / 255, g / 255, b / 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m && m[1]) {
    const parts = m[1].split(",").map((x) => parseFloat(x));
    const [r, g, b] = parts;
    if (r !== undefined && g !== undefined && b !== undefined && ![r, g, b].some(Number.isNaN)) {
      return [r / 255, g / 255, b / 255];
    }
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  return [hue2rgb(p, q, hk + 1 / 3), hue2rgb(p, q, hk), hue2rgb(p, q, hk - 1 / 3)];
}

export interface RecolorOptions {
  /** Source hue band (degrees) to remap onto the brand. Default catches blues. */
  band?: [number, number];
  /** Skip near-neutral colours below this saturation. */
  satFloor?: number;
  /**
   * Reference lightness of the source accent family. The main accent lands on the brand's
   * lightness; lighter/darker shades keep their offset from this reference, preserving shading.
   */
  refLightness?: number;
}

// A brand at/under this saturation is treated as neutral (black / white / grey) — the accent
// becomes grayscale at the brand's lightness rather than picking up the hue-0 (red) artefact.
const ACHROMATIC_SAT = 0.12;

// Colours lighter than this are treated as pale backgrounds (e.g. the tint circle behind the
// hero doctor): they keep their lightness and get only a gentle tint, so they stay a soft
// wash of the brand instead of being pulled down to a solid, saturated fill.
const PALE_LIGHTNESS = 0.75;

/**
 * Returns a recoloured copy of `data` with the brand colour applied to the brand-adjacent
 * family. It matches the brand's HUE, SATURATION and LIGHTNESS (so the accent actually reads
 * as the selected colour), while preserving each shade's offset for depth. Neutral brands
 * (black/white/grey) desaturate to grayscale instead of shifting to red. `brand` accepts hex
 * or rgb()/rgba(); returns `data` unchanged if it can't be parsed.
 */
export function recolorLottie<T>(data: T, brand: string, options: RecolorOptions = {}): T {
  const brandRgb = parseColor(brand);
  if (!brandRgb) return data;
  const [bh, bs, bl] = rgbToHsl(brandRgb[0], brandRgb[1], brandRgb[2]);
  const achromatic = bs < ACHROMATIC_SAT;
  const band = options.band ?? [185, 255];
  const satFloor = options.satFloor ?? 0.18;
  const ref = options.refLightness ?? 0.55;
  const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

  const [bandLo, bandHi] = band;
  const remap = (c: number[]): number[] => {
    if (!Array.isArray(c) || c.length < 3) return c;
    const r = c[0];
    const g = c[1];
    const b = c[2];
    if (r === undefined || g === undefined || b === undefined) return c;
    const a = c.length > 3 ? c[3] ?? 1 : 1;
    if ([r, g, b].some((n) => n < 0 || n > 1)) return c;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < satFloor || h < bandLo || h > bandHi) return c;
    // Always take the brand hue. Pale backgrounds keep their lightness and get only a gentle
    // tint (they stay a soft wash); the solid accent takes the brand's saturation and lands on
    // the brand's lightness (keeping this shade's offset from the reference).
    let ns: number;
    let nl: number;
    if (l >= PALE_LIGHTNESS) {
      nl = l;
      ns = achromatic ? 0 : clamp01(s * 0.5 + bs * 0.3);
    } else {
      nl = clamp01(bl + (l - ref));
      ns = achromatic ? 0 : clamp01(s * 0.25 + bs * 0.75);
    }
    const [nr, ng, nb] = hslToRgb(bh, ns, nl);
    return [nr, ng, nb, a];
  };

  const clone: T =
    typeof structuredClone === "function"
      ? structuredClone(data)
      : (JSON.parse(JSON.stringify(data)) as T);

  const isColorArr = (a: unknown): a is number[] =>
    Array.isArray(a) && (a.length === 3 || a.length === 4) && a.every((n) => typeof n === "number" && n >= 0 && n <= 1);

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      // solid fill / stroke colour: { c: { a, k } }
      const cprop = obj.c as { k?: unknown } | undefined;
      if (cprop && cprop.k !== undefined) {
        if (isColorArr(cprop.k)) {
          cprop.k = remap(cprop.k);
        } else if (Array.isArray(cprop.k)) {
          // keyframed colour: array of { s: number[], e?: number[] }
          for (const kf of cprop.k as Record<string, unknown>[]) {
            if (kf && typeof kf === "object") {
              if (isColorArr(kf.s)) kf.s = remap(kf.s as number[]);
              if (isColorArr(kf.e)) kf.e = remap(kf.e as number[]);
            }
          }
        }
      }
      for (const v of Object.values(obj)) walk(v);
    }
  };

  walk(clone);
  return clone;
}
