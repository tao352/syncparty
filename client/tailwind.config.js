/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cinema: {
          950: '#09090b', // Deep obsidian
          900: '#111115', // Stage background
          850: '#16161c', // Card / Panel background
          800: '#1e1e26', // Border / subtle highlight
          700: '#2b2b36', // Muted element
          600: '#52525b', // Subdued text
          400: '#a1a1aa', // Secondary text
          100: '#f4f4f5', // Crisp heading text
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        }
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'float-up': 'floatUp 2.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        floatUp: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(0.8)' },
          '50%': { opacity: '0.9', transform: 'translateY(-100px) scale(1.2)' },
          '100%': { opacity: '0', transform: 'translateY(-220px) scale(1.4)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        }
      }
    },
  },
  plugins: [],
}
