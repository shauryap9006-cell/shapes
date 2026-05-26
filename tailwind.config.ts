import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0a0a0f",
        cyanGlow: "#48f5ff",
        violetGlow: "#8c6dff"
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "Inter", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
