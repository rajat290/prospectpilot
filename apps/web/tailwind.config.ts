import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        steel: "#51616f",
        mint: "#20a67a",
        amber: "#c98216",
        paper: "#f7f8f5"
      }
    }
  },
  plugins: []
};

export default config;

