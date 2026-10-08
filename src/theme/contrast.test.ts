import { readFileSync } from "fs";
import { join } from "path";

import { contrastRatio, parseTokens, themeBlocks } from "./contrast";

/*
 * §31 asks for sufficient contrast, and nothing else in the suite can see a
 * colour. This reads the real tokens, so changing one and breaking a pair the
 * app renders fails here rather than on a stranger's phone.
 *
 * Thresholds follow WCAG 2.1 AA: 4.5:1 for body text, 3:1 for the boundary of
 * a control the user has to find. A shape inside a control is a graphic, not
 * text, so it takes the 3:1 line too.
 */

const css = readFileSync(join(__dirname, "..", "global.css"), "utf8");
const blocks = themeBlocks(css);
const themes = {
  light: parseTokens(blocks.light),
  dark: parseTokens(blocks.dark),
};

/** Pairs the components actually render, each named for where it appears. */
const TEXT_PAIRS: [string, string, string][] = [
  ["foreground", "background", "body and headline text"],
  ["foreground", "card", "text on a card"],
  ["muted-foreground", "background", "caption and subhead text"],
  ["muted-foreground", "card", "caption on a card"],
  ["primary", "background", "emphasis and links"],
  ["primary", "card", "emphasis on a card"],
  ["destructive", "background", "error copy"],
  ["destructive", "card", "error copy in a dialog"],
  ["primary-foreground", "primary", "label on a primary button"],
  ["secondary-foreground", "secondary", "label on a secondary button"],
  ["card-foreground", "card", "card body text"],
  ["accent-foreground", "accent", "label on an accent surface"],
];

/*
 * `input` rather than `border`: the input token draws the edge of a text field
 * and of the outline button, which is the only thing saying where to type or
 * tap, so WCAG 1.4.11 applies. `border` groups cards and HUD frames, which the
 * content inside already identifies — it is decorative and deliberately left
 * at the value the reference designs use.
 */
const CONTROL_PAIRS: [string, string, string][] = [
  ["input", "background", "text field edge on a screen"],
  ["input", "card", "text field edge in a dialog"],
  ["record-foreground", "record", "the glyph inside the record button"],
];

describe.each(["light", "dark"] as const)("%s theme", (name) => {
  const tokens = themes[name];

  it("defines every colour the pairs below reference", () => {
    const referenced = new Set(
      [...TEXT_PAIRS, ...CONTROL_PAIRS].flatMap(([a, b]) => [a, b]),
    );
    for (const token of referenced) {
      expect(tokens[token]).toBeDefined();
    }
  });

  it.each(TEXT_PAIRS)("reads %s on %s — %s", (fg, bg) => {
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CONTROL_PAIRS)("distinguishes %s from %s — %s", (fg, bg) => {
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe("contrastRatio", () => {
  it("puts black against white at 21:1", () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 1, g: 1, b: 1 };
    expect(contrastRatio(black, white)).toBeCloseTo(21, 1);
    // Order must not matter, or a passing pair could be written backwards.
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1);
  });

  it("puts a colour against itself at 1:1", () => {
    const grey = { r: 0.5, g: 0.5, b: 0.5 };
    expect(contrastRatio(grey, grey)).toBeCloseTo(1, 5);
  });
});
