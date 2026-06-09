/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          900: "rgb(var(--brand-900) / <alpha-value>)",
          800: "rgb(var(--brand-800) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          400: "rgb(var(--brand-400) / <alpha-value>)",
          300: "rgb(var(--brand-300) / <alpha-value>)",
        },
        crisis: {
          low: "#22c55e",
          medium: "#f59e0b",
          high: "#f97316",
          critical: "#ef4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
