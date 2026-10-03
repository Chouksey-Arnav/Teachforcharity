import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { cleanJpeg, FormImageError, MAX_FORM_BYTES } from "./jpeg";

const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
const sof = (w: number, h: number) => seg(0xc0, [8, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 1, 1, 0x11, 0]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function jpeg(parts: number[][], scan = [0x12, 0x34, 0xff, 0x00, 0x56]) {
  return new Uint8Array([0xff, 0xd8, ...parts.flat(), ...seg(0xda, [1, 1, 0, 0, 0x3f, 0]), ...scan, 0xff, 0xd9]);
}
const has = (hay: Uint8Array, needle: number[]) => Buffer.from(hay).includes(Buffer.from(needle));

describe("cleanJpeg", () => {
  const exif = seg(0xe1, [...ascii("Exif\0\0"), ...ascii("GPS 35.7796N 78.6382W")]);
  const xmp = seg(0xe1, ascii("http://ns.adobe.com/xap/1.0/ secret"));
  const comment = seg(0xfe, ascii("taken at 12 Oak St"));
  const jfif = seg(0xe0, [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const adobe = seg(0xee, [...ascii("Adobe"), 0, 100, 0, 0, 0, 0, 1]);
  const icc = seg(0xe2, ascii("ICC_PROFILE\0 phone model"));

  it("removes location, XMP, comments and other app blocks, and keeps the image", () => {
    const src = jpeg([jfif, exif, xmp, icc, comment, adobe, sof(1600, 2000)]);
    const { bytes, width, height } = cleanJpeg(src);
    expect([width, height]).toEqual([1600, 2000]);
    expect(has(bytes, ascii("GPS"))).toBe(false);
    expect(has(bytes, ascii("xap"))).toBe(false);
    expect(has(bytes, ascii("Oak St"))).toBe(false);
    expect(has(bytes, ascii("phone model"))).toBe(false);
    expect(has(bytes, ascii("JFIF"))).toBe(true);
    expect(has(bytes, ascii("Adobe"))).toBe(true);
    // scan data copied byte for byte, including stuffed 0xFF00 and the end marker
    expect(has(bytes, [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9])).toBe(true);
    expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it("leaves a clean file unchanged", () => {
    const src = jpeg([jfif, sof(800, 1100)]);
    expect([...cleanJpeg(src).bytes]).toEqual([...src]);
  });

  it("rejects things that aren't JPEGs", () => {
    expect(() => cleanJpeg(new Uint8Array(ascii("<html><script>alert(1)</script>")))).toThrow(FormImageError);
    expect(() => cleanJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toThrow(/photo/);
    expect(() => cleanJpeg(new Uint8Array([]))).toThrow(FormImageError);
  });

  it("rejects photos too small to read and files too large", () => {
    expect(() => cleanJpeg(jpeg([sof(400, 500)]))).toThrow(/too small/);
    const big = new Uint8Array(MAX_FORM_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(() => cleanJpeg(big)).toThrow(/too large/);
  });

  it("rejects truncated or lying segment lengths", () => {
    const src = jpeg([sof(800, 1100)]);
    expect(() => cleanJpeg(src.subarray(0, 8))).toThrow(FormImageError);
    const lying = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3]);
    expect(() => cleanJpeg(lying)).toThrow(FormImageError);
    expect(() => cleanJpeg(jpeg([]))).toThrow(/damaged/); // no frame header
  });

  it("never crashes on arbitrary bytes — it either cleans or refuses", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 400 }), (tail) => {
        const input = new Uint8Array([0xff, 0xd8, 0xff, ...tail]);
        try {
          const r = cleanJpeg(input);
          expect(r.bytes.length).toBeLessThanOrEqual(input.length);
        } catch (e) {
          expect(e).toBeInstanceOf(FormImageError);
        }
      }),
    );
  });
});
