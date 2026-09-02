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
        base: "var(--bg-base)",
        card: {
          DEFAULT: "var(--card-bg)",
          border: "var(--card-border)",
        },
        main: "var(--text-main)",
        muted: "var(--text-muted)",
        sweet: {
          strawberry: "var(--sweet-strawberry)",
          matcha: "var(--sweet-matcha)",
          custard: "var(--sweet-custard)",
          sky: "var(--sweet-sky)",
          taro: "var(--sweet-taro)",
          peach: "var(--sweet-peach)",
        },
      },
      boxShadow: {
        hard: "var(--shadow-hard)",
        "hard-sm": "3px 3px 0px var(--card-border)",
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
