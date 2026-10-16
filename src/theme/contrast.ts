/*
 * WCAG contrast arithmetic, so §31's "maintain sufficient contrast" is a test
 * rather than a judgement made once and then drifted away from.
 *
 * Deliberately written without regular expressions. Tailwind scans every file
 * under `src/` as plain text, including tests, and reads a square-bracketed
 * expression containing a colon as arbitrary-property syntax — which compiles
 * to a real CSS rule with an empty property name and fails *every* bundle,
 * naming a line in generated CSS rather than the file responsible. Character
 * classes are exactly the shape that triggers it. See AGENTS.md.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Converts an `hsl(H S% L%)` triple to linear 0–1 RGB. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const lum = l / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lum - c / 2;

  const sector = Math.floor(h / 60) % 6;
  const rgb =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x];

  return { r: rgb[0] + m, g: rgb[1] + m, b: rgb[2] + m };
}

/** WCAG relative luminance. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, between 1 and 21. Order of arguments does not matter. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Pulls `--color-*: hsl(H S% L%)` declarations out of a block of CSS.
 *
 * Only the values written in that exact form are read; anything else is
 * skipped rather than guessed at, so an unparsed token shows up as a missing
 * key in a failing test instead of a silently wrong colour.
 */
export function parseTokens(css: string): Record<string, Rgb> {
  const tokens: Record<string, Rgb> = {};

  for (const rawLine of css.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("--color-")) continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;

    const name = line.slice("--color-".length, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!value.startsWith("hsl(")) continue;

    const close = value.indexOf(")");
    if (close < 0) continue;

    const parts = value
      .slice("hsl(".length, close)
      .split(" ")
      .filter(Boolean)
      .map((part) => Number(part.replace("%", "")));

    if (parts.length !== 3 || parts.some(Number.isNaN)) continue;
    tokens[name] = hslToRgb(parts[0], parts[1], parts[2]);
  }

  return tokens;
}

/**
 * Splits `global.css`'s two `@variant` blocks apart.
 *
 * The blocks inside `@layer theme` are the ones `Uniwind.setTheme()` switches
 * between, so they are what the app actually renders — the `@theme` block
 * above them exists to make Tailwind generate the utilities at all.
 */
export function themeBlocks(css: string): { light: string; dark: string } {
  const after = (marker: string) => {
    const start = css.indexOf(marker);
    if (start < 0) throw new Error(`global.css has no ${marker} block`);
    const end = css.indexOf("}", start);
    return css.slice(start, end);
  };

  return { light: after("@variant light"), dark: after("@variant dark") };
}
