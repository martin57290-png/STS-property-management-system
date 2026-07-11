import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdbff',
          300: '#8ec4ff',
          400: '#59a3ff',
          500: '#337fff',
          600: '#1b5ef5',
          700: '#1449e1',
          800: '#173cb6',
          900: '#19388f',
          950: '#142357',
        },
        priority: {
          emergency: '#dc2626',
          urgent: '#ea580c',
          routine: '#ca8a04',
          low: '#16a34a',
        },
      },
    },
  },
  plugins: [],
};
export default config;
