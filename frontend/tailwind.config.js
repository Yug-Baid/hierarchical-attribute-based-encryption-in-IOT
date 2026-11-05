/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: '#fcfbf9',
        canvas: '#f4f1eb',
        surface: '#ffffff',
        subtle: '#f8f7f4',
        carbon: '#0a0a0a',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'nav-active': '0 4px 14px rgba(0, 0, 0, 0.18)',
      }
    },
  },
  plugins: [],
}

