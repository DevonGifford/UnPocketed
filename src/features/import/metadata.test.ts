import { importedAtFrom, importTitleFrom } from "./metadata";

/*
 * The title and date an imported Recording gets. Both come from a document
 * provider, which is to say from outside the app and not to be trusted: §36's
 * matrix tests long and Unicode filenames, and a provider reporting a bogus
 * modification time would park a recording at one end of the library forever.
 */

describe("importTitleFrom", () => {
  it("uses the file's name without its extension", () => {
    expect(importTitleFrom("Standup 2026-09-14.m4a")).toBe("Standup 2026-09-14");
  });

  it("keeps a name that carries no extension", () => {
    expect(importTitleFrom("voice memo")).toBe("voice memo");
  });

  it("keeps Unicode intact", () => {
    // §36's matrix tests Unicode filenames.
    expect(importTitleFrom("会議メモ.mp3")).toBe("会議メモ");
  });

  it("does not shorten a long name, because rename exists", () => {
    const long = "a".repeat(200);
    expect(importTitleFrom(`${long}.wav`)).toBe(long);
  });

  it("collapses whitespace and trims", () => {
    expect(importTitleFrom("  team   sync .wav")).toBe("team sync");
  });

  it("returns null when there is no usable name, so the caller uses a timestamp", () => {
    expect(importTitleFrom(".mp3")).toBeNull();
    expect(importTitleFrom("   ")).toBeNull();
    expect(importTitleFrom(undefined)).toBeNull();
  });
});

describe("importedAtFrom", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");

  it("uses the file's own modification time, so an old archive keeps its order", () => {
    const made = Date.UTC(2024, 4, 18, 9, 30);
    expect(importedAtFrom(made, now)?.toISOString()).toBe(
      new Date(made).toISOString(),
    );
  });

  it("refuses a zero, so a recording cannot be stranded in 1970", () => {
    expect(importedAtFrom(0, now)).toBeNull();
  });

  it("refuses an implausibly old timestamp", () => {
    expect(importedAtFrom(Date.UTC(1972, 0, 1), now)).toBeNull();
  });

  it("refuses a future timestamp, which would pin it to the top of the library", () => {
    expect(importedAtFrom(now.getTime() + 86_400_000, now)).toBeNull();
  });

  it("accepts the present moment", () => {
    expect(importedAtFrom(now.getTime(), now)?.getTime()).toBe(now.getTime());
  });

  it("returns null when the picker reported nothing usable", () => {
    expect(importedAtFrom(undefined, now)).toBeNull();
    expect(importedAtFrom(null, now)).toBeNull();
    expect(importedAtFrom(Number.NaN, now)).toBeNull();
  });
});
