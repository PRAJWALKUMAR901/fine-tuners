/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#f0f7f2',
          100: '#dcebe0',
          200: '#bcd8c4',
          300: '#92be9f',
          400: '#649d77',
          500: '#438059',
          600: '#2f6645',
          700: '#265238',
          800: '#1f4130',
          900: '#1a3628',
          950: '#0d1e17',
        },
        clay: {
          50: '#fbf6ef',
          100: '#f5e9d7',
          200: '#ead2b0',
          300: '#dcb583',
          400: '#ce9459',
          500: '#c17c3e',
          600: '#a96332',
          700: '#8a4d2b',
          800: '#713f28',
          900: '#5d3523',
        },
        ink: '#14211b',
        parchment: '#f7f6f1',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['"Segoe UI"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 33, 27, 0.04), 0 8px 24px rgba(20, 33, 27, 0.06)',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        pulseSoft: 'pulseSoft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
