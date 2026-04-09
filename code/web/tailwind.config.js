/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00d4ff',
        secondary: '#00ff9d',
        dark: '#050d1a',
        surface: '#0a1628',
        surface2: '#0f1e38',
      },
    },
  },
  plugins: [],
}
