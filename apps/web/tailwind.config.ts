import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark-cocoa"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // "rgb(var(--x) / <alpha-value>)" — bukan "var(--x)" polos — supaya
        // modifier opacity Tailwind (bg-sweet-strawberry/20, text-main/70,
        // dst.) benar-benar dikompilasi jadi CSS valid. Tailwind mengganti
        // <alpha-value> dengan 1 kalau tidak ada modifier, jadi kelas tanpa
        // opacity (bg-base, text-main) tidak berubah perilakunya. Token CSS
        // di globals.css HARUS berformat triplet RGB ("250 246 240"), bukan
        // hex, agar rgb(var(--x) / n) valid.
        base: "rgb(var(--bg-base) / <alpha-value>)",
        card: {
          DEFAULT: "var(--card-bg)",
          border: "rgb(var(--card-border) / <alpha-value>)",
        },
        main: "rgb(var(--text-main) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        muted: "rgb(var(--text-muted) / <alpha-value>)",
        sweet: {
          strawberry: "rgb(var(--sweet-strawberry) / <alpha-value>)",
          matcha: "rgb(var(--sweet-matcha) / <alpha-value>)",
          custard: "rgb(var(--sweet-custard) / <alpha-value>)",
          sky: "rgb(var(--sweet-sky) / <alpha-value>)",
          taro: "rgb(var(--sweet-taro) / <alpha-value>)",
          peach: "rgb(var(--sweet-peach) / <alpha-value>)",
        },
      },
      boxShadow: {
        hard: "var(--shadow-hard)",
        "hard-sm": "3px 3px 0px rgb(var(--card-border))",
        "strawberry-glow": "0px 15px 35px var(--sweet-strawberry-glow)",
        "card-specular": "0 1px 0 0 rgba(255, 255, 255, 0.98) inset",
      },
      borderRadius: {
        squircle: "32px",
        "squircle-sm": "22px",
        pill: "999px",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-plus-jakarta)", "sans-serif"],
        mono: ["var(--font-space-mono)", "monospace"],
      },
      transitionTimingFunction: {
        mochi: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        drawer: "cubic-bezier(0.32, 1, 0.23, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
