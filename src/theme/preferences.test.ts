import { DEFAULT_SCHEME, parseScheme } from "./preferences";

describe("parseScheme", () => {
  it("reads either stored scheme", () => {
    expect(parseScheme({ scheme: "light" })).toBe("light");
    expect(parseScheme({ scheme: "dark" })).toBe("dark");
  });

  it("treats anything else as never chosen", () => {
    // A half-written file, a hand-edit, or a shape from a future version.
    // Null resolves to DEFAULT_SCHEME rather than throwing on launch.
    expect(parseScheme({ scheme: "system" })).toBeNull();
    expect(parseScheme({ scheme: 1 })).toBeNull();
    expect(parseScheme({})).toBeNull();
    expect(parseScheme(null)).toBeNull();
    expect(parseScheme("dark")).toBeNull();
  });

  it("defaults to dark rather than to the device's scheme", () => {
    // Not a taste call. Uniwind.setTheme writes through to
    // Appearance.setColorScheme, which Android persists, so seeding from
    // useColorScheme() reads this app's own last value back after the first
    // launch and pins the scheme permanently.
    expect(DEFAULT_SCHEME).toBe("dark");
  });
});
