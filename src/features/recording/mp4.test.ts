import { containsMoov, type ByteReader } from "./mp4";

/** Builds an 8-byte box header, optionally followed by `padding` bytes of body. */
function box(size: number, type: string, padding = 0): number[] {
  return [
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    ...[...type].map((c) => c.charCodeAt(0)),
    ...new Array<number>(padding).fill(0),
  ];
}

function reader(bytes: number[]): ByteReader {
  const data = Uint8Array.from(bytes);
  return {
    size: data.length,
    read: (offset, length) => data.subarray(offset, offset + length),
  };
}

describe("containsMoov", () => {
  it("finds moov after a correctly sized mdat, which is a clean stop", () => {
    const file = [
      ...box(16, "ftyp", 8),
      ...box(24, "mdat", 16),
      ...box(16, "moov", 8),
    ];

    expect(containsMoov(reader(file))).toBe(true);
  });

  // The shape MPEG4Writer leaves behind when the process dies: the mdat size
  // was never patched, so it claims the rest of the file and moov never came.
  it("rejects an mdat whose size was never written", () => {
    const file = [...box(16, "ftyp", 8), ...box(0, "mdat", 64)];

    expect(containsMoov(reader(file))).toBe(false);
  });

  it("rejects an mdat claiming to run past the end of the file", () => {
    const file = [...box(16, "ftyp", 8), ...box(4096, "mdat", 32)];

    expect(containsMoov(reader(file))).toBe(false);
  });

  it("rejects a file that is only a header", () => {
    expect(containsMoov(reader(box(16, "ftyp", 8)))).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(containsMoov(reader([]))).toBe(false);
  });

  it("rejects a box smaller than its own header rather than looping", () => {
    const file = [...box(4, "ftyp"), ...box(16, "moov", 8)];

    expect(containsMoov(reader(file))).toBe(false);
  });

  it("walks past a 64-bit sized box", () => {
    const large = [
      ...box(1, "mdat"),
      // 64-bit size: header (8) + this field (8) + 8 bytes of body.
      0, 0, 0, 0, 0, 0, 0, 24,
      ...new Array<number>(8).fill(0),
      ...box(16, "moov", 8),
    ];

    expect(containsMoov(reader(large))).toBe(true);
  });

  it("does not mistake a size above 2^31 for a negative one", () => {
    // 0x80000010 would read as negative through a 32-bit shift, and a negative
    // size would fail the "smaller than its header" guard for the wrong reason.
    const file = [...box(0x80000010, "mdat", 8)];

    expect(containsMoov(reader(file))).toBe(false);
  });
});
