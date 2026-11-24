/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  // Bind dark: utilities to the app theme toggle (body.e-dark-mode),
  // not the OS prefers-color-scheme — otherwise Light Mode stays dark.
  darkMode: ['selector', '.e-dark-mode'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2fd',
          100: '#dce4fb',
          200: '#bac8f6',
          300: '#8fa5ee',
          400: '#5f7ce3',
          500: '#2e4fc8',
          600: '#2443b0',
          700: '#1c3690',
          800: '#162b70',
          900: '#112154',
          950: '#0b1538',
          DEFAULT: '#2e4fc8',
        },
        navy: '#0b1120',
        paper: '#0b1120',
        surface: '#131f37',
        card: '#131f37',
        line: '#30435d',
        cyan: '#06b6d4',
        teal: '#0d9488',
        violet: '#7c3aed',
        coral: '#ea580c',
        royal: '#2e4fc8',
        accent: '#7465e8',
        ink: '#edf3ff',
        muted: '#a4b2c8',
        good: '#10b981',
        bad: '#f43f5e',
        copper: '#f59e0b',
      },
    },
  },
};
