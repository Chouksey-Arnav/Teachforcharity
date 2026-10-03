/**
 * Checks an uploaded photo of a signed consent form and removes its metadata.
 *
 * The browser already re-draws the photo onto a canvas (which drops EXIF),
 * but the server can't trust that, so it strips again: EXIF/XMP (APP1, where
 * phones put GPS location), every other APPn block except the JFIF header
 * (APP0) and Adobe colour block (APP14), and comments. The image data itself
 * is copied unchanged.
 */

export const MAX_FORM_BYTES = 3 * 1024 * 1024;
/** Shorter than this on the long side and a page of text isn't readable. */
export const MIN_FORM_LONG_SIDE = 600;

export class FormImageError extends Error {}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const KEEP_APP = new Set([0xe0, 0xee]);

export interface CleanJpeg {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export function cleanJpeg(input: Uint8Array): CleanJpeg {
  if (input.length > MAX_FORM_BYTES) throw new FormImageError("That photo is too large (3 MB max).");
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8 || input[2] !== 0xff) {
    throw new FormImageError("Please upload a photo (JPG, PNG or WebP).");
  }
  const out: Uint8Array[] = [input.subarray(0, 2)];
  let width = 0;
  let height = 0;
  let i = 2;
  while (i < input.length) {
    if (input[i] !== 0xff) throw new FormImageError("That photo looks damaged. Please take it again.");
    // Fill bytes (0xFF padding) are allowed between segments.
    while (i < input.length && input[i] === 0xff) i++;
    if (i >= input.length) break;
    const marker = input[i];
    const segStart = i - 1;
    i++;
    if (marker === 0xd9) {
      out.push(input.subarray(segStart, i));
      break;
    }
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(input.subarray(segStart, i));
      continue;
    }
    if (i + 2 > input.length) throw new FormImageError("That photo looks damaged. Please take it again.");
    const len = (input[i] << 8) | input[i + 1];
    if (len < 2 || i + len > input.length) throw new FormImageError("That photo looks damaged. Please take it again.");
    const segEnd = i + len;
    if (SOF_MARKERS.has(marker)) {
      if (len < 7) throw new FormImageError("That photo looks damaged. Please take it again.");
      height = (input[i + 3] << 8) | input[i + 4];
      width = (input[i + 5] << 8) | input[i + 6];
    }
    const isMetadata = (marker >= 0xe0 && marker <= 0xef && !KEEP_APP.has(marker)) || marker === 0xfe;
    if (!isMetadata) out.push(input.subarray(segStart, segEnd));
    i = segEnd;
    if (marker === 0xda) {
      // Start of scan: the compressed image follows, through to the end of the file.
      out.push(input.subarray(i));
      break;
    }
  }
  if (!width || !height) throw new FormImageError("That photo looks damaged. Please take it again.");
  if (Math.max(width, height) < MIN_FORM_LONG_SIDE) {
    throw new FormImageError("That photo is too small to read. Please take it closer, with the whole page in view.");
  }
  const total = out.reduce((n, p) => n + p.length, 0);
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const p of out) {
    bytes.set(p, o);
    o += p.length;
  }
  return { bytes, width, height };
}
