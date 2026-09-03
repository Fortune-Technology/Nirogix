import sharp from 'sharp';
import { logger } from '../../config/logger';

/**
 * Optimize an uploaded image before it is stored (ADR-007).
 *
 * What it does, and why:
 * - **Caps dimensions** — a document photo never needs more than ~2500px on its longest edge,
 *   and an 8 MP phone camera produces far more; the excess is pure storage and bandwidth cost.
 * - **Strips metadata** — EXIF (including **GPS** on a patient's phone photo) is removed. A
 *   privacy win, not only a size one: a lab-report photo must not carry where it was taken.
 * - **Re-encodes to WebP at near-lossless quality** (q90), stepping quality/size down only as
 *   far as needed to fit the target. WebP q90 is visually indistinguishable from the source at a
 *   fraction of the bytes, preserves transparency (logos, letterheads), and every current browser
 *   renders it.
 *
 * Only **raster** images are touched. SVG (vector — rasterizing would ruin a logo), GIF
 * (animation would be flattened), PDFs and anything non-image pass through unchanged. If the
 * bytes turn out not to be a decodable image, or the original is already smaller than what we
 * would produce, the original is kept — optimization never makes a file worse or blocks an upload.
 */

// Raster formats we re-encode. Deliberately excludes image/svg+xml and image/gif.
const OPTIMIZABLE = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/avif',
  'image/heic',
  'image/heif',
]);

/** Stored images are kept at or under this size, quality-preserving. ~1 MB. */
const TARGET_BYTES = 1_000_000;
/** Longest-edge cap; a phone photo of a document needs no more than this. */
const MAX_DIMENSION = 2500;

export interface OptimizedImage {
  buffer: Buffer;
  contentType: string;
  /** Filename with a `.webp` extension when re-encoded, else unchanged. */
  filename: string;
  optimized: boolean;
}

function withWebpExt(name: string): string {
  return `${name.replace(/\.[^./\\]+$/, '')}.webp`;
}

export async function optimizeImage(
  buffer: Buffer,
  contentType: string,
  filename: string,
): Promise<OptimizedImage> {
  if (!OPTIMIZABLE.has(contentType.toLowerCase())) {
    return { buffer, contentType, filename, optimized: false };
  }

  try {
    // `.rotate()` with no argument applies the EXIF orientation, then metadata is dropped on
    // encode (sharp does not carry it forward unless asked). `failOn: 'none'` tolerates a
    // slightly-malformed but still-decodable image rather than throwing.
    const pipeline = sharp(buffer, { failOn: 'none' }).rotate();

    // Quality/dimension ladder — q90 first (visually lossless); descend only if a very large
    // image still exceeds the target after the dimension cap.
    const attempts: Array<{ quality: number; dim: number }> = [
      { quality: 90, dim: MAX_DIMENSION },
      { quality: 82, dim: MAX_DIMENSION },
      { quality: 80, dim: 2000 },
      { quality: 78, dim: 1600 },
      { quality: 72, dim: 1280 },
    ];

    let best: Buffer | null = null;
    for (const { quality, dim } of attempts) {
      best = await pipeline
        .clone()
        .resize({ width: dim, height: dim, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer();
      if (best.length <= TARGET_BYTES) break;
    }

    // Keep the smaller of {optimized, original}: a tiny already-optimized icon can be larger as
    // WebP than it was, and there is no point storing the worse one.
    if (best && best.length < buffer.length) {
      return {
        buffer: best,
        contentType: 'image/webp',
        filename: withWebpExt(filename),
        optimized: true,
      };
    }
    return { buffer, contentType, filename, optimized: false };
  } catch (err) {
    // Not a decodable image (or sharp failed) — never block the upload; store the original bytes.
    logger.warn({ err, contentType }, 'image optimization skipped');
    return { buffer, contentType, filename, optimized: false };
  }
}
