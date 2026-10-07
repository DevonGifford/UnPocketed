import { File } from "expo-file-system";

/*
 * Just enough MP4 to answer one question: is this file playable?
 *
 * `MPEG4Writer` writes the `moov` box — the sample index — only when recording
 * stops cleanly. A recording killed mid-capture is left as `ftyp` plus an
 * `mdat` whose size was never patched, so the audio is all there and no player
 * will open it. That is the difference between an Interrupted Recording and a
 * complete one (CONTEXT.md), and it cannot be told from the filename, the
 * extension or the size.
 *
 * Only top-level boxes are walked, and only until `moov` is found, so this
 * reads a few dozen bytes of an hour-long file rather than all of it.
 */

/** The 8-byte box header: a 32-bit size then a 4-character type. */
const HEADER_BYTES = 8;

/** A `size` of 1 means the real 64-bit size follows the header. */
const SIZE_IS_64_BIT = 1;

/** A `size` of 0 means "to the end of the file" — nothing can follow it. */
const SIZE_TO_END_OF_FILE = 0;

/** Random access over a file's bytes, so the walk can be tested without one. */
export interface ByteReader {
  size: number;
  /** Returns up to `length` bytes at `offset`; fewer only at end of file. */
  read(offset: number, length: number): Uint8Array;
}

function readUint32(bytes: Uint8Array, at: number): number {
  return (
    // Multiplication rather than `<<`: a size above 2^31 would come back
    // negative through a 32-bit shift.
    bytes[at] * 0x1000000 +
    (bytes[at + 1] << 16) +
    (bytes[at + 2] << 8) +
    bytes[at + 3]
  );
}

function readBoxType(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

/**
 * Whether the file's top-level boxes include `moov`.
 *
 * @returns True only when the index is present, so the recording plays. False
 * for a truncated file, a box structure that does not add up, or anything that
 * is not MP4 — all of which mean "do not promise this will play".
 */
export function containsMoov(reader: ByteReader): boolean {
  let offset = 0;

  while (offset + HEADER_BYTES <= reader.size) {
    const header = reader.read(offset, HEADER_BYTES);
    if (header.length < HEADER_BYTES) return false;

    const declaredSize = readUint32(header, 0);
    if (readBoxType(header, 4) === "moov") return true;

    let boxSize = declaredSize;

    if (declaredSize === SIZE_IS_64_BIT) {
      const extended = reader.read(offset + HEADER_BYTES, 8);
      if (extended.length < 8) return false;
      // The high word is only meaningful for files past 4 GiB, which no
      // recording here reaches; reading it keeps the arithmetic honest.
      boxSize = readUint32(extended, 0) * 0x100000000 + readUint32(extended, 4);
    } else if (declaredSize === SIZE_TO_END_OF_FILE) {
      // The unpatched `mdat` of an interrupted recording looks like this, and
      // by definition nothing follows it.
      return false;
    }

    // A box smaller than its own header, or one claiming to run past the end of
    // the file, means the structure was never closed.
    if (boxSize < HEADER_BYTES || offset + boxSize > reader.size) return false;

    offset += boxSize;
  }

  return false;
}

/**
 * Whether stored audio is playable, by looking for its `moov` box.
 *
 * @returns False when the file cannot be opened or read, since an unreadable
 * file is not one to claim will play.
 */
export function isPlayableMp4(file: File): boolean {
  let handle;

  try {
    handle = file.open();
  } catch {
    return false;
  }

  try {
    const size = handle.size ?? 0;

    return containsMoov({
      size,
      read: (offset, length) => {
        handle.offset = offset;
        return handle.readBytes(length);
      },
    });
  } catch {
    return false;
  } finally {
    handle.close();
  }
}
