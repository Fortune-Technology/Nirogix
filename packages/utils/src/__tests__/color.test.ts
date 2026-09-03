import { describe, expect, test } from 'vitest';
import {
  contrastRatio,
  ensureContrast,
  parseHexColor,
  relativeLuminance,
  toHexColor,
} from '../color';

describe('parseHexColor', () => {
  test('accepts both shorthand and full form, with or without the hash', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor('0d9488')).toEqual({ r: 13, g: 148, b: 136 });
    expect(parseHexColor('  #0D9488  ')).toEqual({ r: 13, g: 148, b: 136 });
  });

  test('returns null rather than guessing at anything else', () => {
    for (const bad of ['', '#12345', 'teal', 'rgb(1,2,3)', '#gggggg']) {
      expect(parseHexColor(bad)).toBeNull();
    }
  });
});

describe('contrast', () => {
  test('black on white is the maximum, and a colour against itself is the minimum', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5);
    expect(contrastRatio({ r: 13, g: 148, b: 136 }, { r: 13, g: 148, b: 136 })).toBeCloseTo(1, 5);
  });

  test('luminance runs from 0 to 1', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });
});

describe('ensureContrast', () => {
  test('leaves a colour that already reads well alone', () => {
    // The platform's deep teal measures 5.5:1 on white, so it prints exactly as chosen.
    expect(ensureContrast('#0f766e')).toBe('#0f766e');
  });

  test('darkens a mid-tone that is only marginal', () => {
    // Teal-600 measures 3.7:1 — fine as an interface accent, thin for a printed code.
    const out = ensureContrast('#0d9488')!;
    expect(out).not.toBe('#0d9488');
    expect(contrastRatio(parseHexColor(out)!, { r: 255, g: 255, b: 255 })).toBeGreaterThanOrEqual(
      5,
    );
  });

  test('darkens a pale colour until it reads, instead of returning it unchanged', () => {
    const out = ensureContrast('#fde047')!; // a light yellow at 1.3:1 — unusable as printed
    const rgb = parseHexColor(out)!;
    expect(contrastRatio(rgb, { r: 255, g: 255, b: 255 })).toBeGreaterThanOrEqual(5);
  });

  test("keeps the hue while darkening, so it still reads as the hospital's colour", () => {
    // A light red stays red: the red channel remains the largest of the three.
    const rgb = parseHexColor(ensureContrast('#fca5a5')!)!;
    expect(rgb.r).toBeGreaterThan(rgb.g);
    expect(rgb.r).toBeGreaterThan(rgb.b);
  });

  test('always terminates with something legible, even for white', () => {
    const rgb = parseHexColor(ensureContrast('#ffffff')!)!;
    expect(contrastRatio(rgb, { r: 255, g: 255, b: 255 })).toBeGreaterThanOrEqual(5);
  });

  test('honours a custom threshold and background', () => {
    const strict = ensureContrast('#0f766e', { minContrast: 15 })!;
    expect(
      contrastRatio(parseHexColor(strict)!, { r: 255, g: 255, b: 255 }),
    ).toBeGreaterThanOrEqual(15);
  });

  test('returns null for a value it cannot parse, rather than inventing a colour', () => {
    expect(ensureContrast('not-a-colour')).toBeNull();
  });
});
