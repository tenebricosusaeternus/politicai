/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          900: "#0a0f1e",
          800: "#0d1526",
          700: "#111d33",
          600: "#1a2a45",
          500: "#1e3a5f",
          400: "#2563eb",
          300: "#3b82f6",
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
