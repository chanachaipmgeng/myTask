/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        navy: '#071426',
        paper: '#071426',
        card: '#102844',
        line: '#1e4566',
        cyan: '#3ec6e0',
        ink: '#e8f4fb',
        muted: '#9bb4c9',
        good: '#7ee7f7',
        bad: '#ff8b7a',
        copper: '#f0b429',
      },
    },
  },
};
