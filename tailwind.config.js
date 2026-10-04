/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Semantic tokens only — screens never name a raw colour (§30).
        canvas: "hsl(var(--canvas) / <alpha-value>)",
        surface: "hsl(var(--surface) / <alpha-value>)",
        line: "hsl(var(--line) / <alpha-value>)",
        ink: "hsl(var(--ink) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        record: "hsl(var(--record) / <alpha-value>)",
        destructive: "hsl(var(--destructive) / <alpha-value>)",
        onAccent: "hsl(var(--on-accent) / <alpha-value>)",
      },
      borderRadius: { sm: "8px", md: "12px", lg: "16px", full: "9999px" },
      fontFamily: { mono: ["monospace"] },
    },
  },
  plugins: [],
};
