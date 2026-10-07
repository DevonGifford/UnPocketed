import { classifyImport } from "./formats";

/*
 * §35 names import a highest-priority test area. What is worth testing is the
 * decision about a picked file, not the chooser: the chooser is Android's, but
 * what Unpocketed does with an odd name or a vague MIME type is ours, and
 * getting it wrong means either refusing a valid recording or storing one under
 * a type that will not play.
 */

describe("classifyImport", () => {
  it("takes the format from the file's own extension", () => {
    expect(classifyImport({ name: "meeting.mp3", mimeType: "audio/mpeg" })).toEqual({
      extension: "mp3",
      mimeType: "audio/mpeg",
    });
  });

  it("prefers the extension over a vague declared type", () => {
    // SAF providers routinely report octet-stream for ordinary media.
    expect(
      classifyImport({ name: "interview.wav", mimeType: "application/octet-stream" }),
    ).toEqual({ extension: "wav", mimeType: "audio/wav" });
  });

  it("falls back to the declared type when the name has no extension", () => {
    expect(classifyImport({ name: "voice memo", mimeType: "audio/mp4" })).toEqual({
      extension: "m4a",
      mimeType: "audio/mp4",
    });
  });

  it("maps alternative spellings of the same container", () => {
    expect(classifyImport({ name: "clip", mimeType: "audio/x-m4a" })?.extension).toBe(
      "m4a",
    );
    expect(classifyImport({ name: "clip", mimeType: "audio/x-wav" })?.extension).toBe(
      "wav",
    );
  });

  it("ignores a codecs parameter on the declared type", () => {
    expect(
      classifyImport({ name: "stream", mimeType: 'audio/webm; codecs="opus"' }),
    ).toEqual({ extension: "webm", mimeType: "audio/webm" });
  });

  it("is case-insensitive about extensions", () => {
    expect(classifyImport({ name: "LECTURE.M4A" })?.extension).toBe("m4a");
  });

  it("accepts the formats §17 names", () => {
    for (const name of ["a.m4a", "a.mp3", "a.wav", "a.mp4", "a.webm"]) {
      expect(classifyImport({ name })).not.toBeNull();
    }
  });

  it("accepts the containers Unpocketed itself writes, so an export re-imports", () => {
    for (const name of ["a.m4a", "a.3gp", "a.aac"]) {
      expect(classifyImport({ name })).not.toBeNull();
    }
  });

  it("refuses a file that is not audio", () => {
    expect(classifyImport({ name: "notes.pdf", mimeType: "application/pdf" })).toBeNull();
    expect(classifyImport({ name: "photo.jpg", mimeType: "image/jpeg" })).toBeNull();
  });

  it("refuses a file it can identify neither way", () => {
    // The picker's type list is a hint a document provider may ignore, so this
    // really does arrive.
    expect(
      classifyImport({ name: "download", mimeType: "application/octet-stream" }),
    ).toBeNull();
    expect(classifyImport({})).toBeNull();
  });
});
