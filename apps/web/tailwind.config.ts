import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'background': '#073B4C',
        'surface-container-lowest': '#010B12',
        'surface-container-low': '#031F2C',
        'surface-container': '#063343',
        'surface-container-high': '#083D50',
        'surface-container-highest': '#0A4A60',
        'surface-variant': '#0A4A60',
        'on-surface': '#F5FAFC',
        'on-surface-variant': '#9CB8C2',
        'on-background': '#F5FAFC',
        'primary': '#118AB2',
        'primary-container': '#06D6A0',
        'on-primary': '#F5FAFC',
        'on-primary-container': '#031F2C',
        'tertiary': '#FFD166',
        'tertiary-container': '#118AB2',
        'on-tertiary': '#031F2C',
        'outline-variant': '#185A70',
        'outline': '#6B95A1',
        'secondary': '#9CB8C2',
        'secondary-container': '#083D50',
        'error': '#EF476F',
        'surface': '#073B4C',
        'surface-dim': '#010B12',
        'surface-bright': '#0A4A60',
        'inverse-surface': '#F5FAFC',
        'inverse-on-surface': '#031F2C',
        'inverse-primary': '#118AB2',
        'primary-fixed': '#28A9C9',
        'primary-fixed-dim': '#118AB2',
        'surface-tint': '#118AB2',
        'on-primary-fixed': '#F5FAFC',
        'on-primary-fixed-variant': '#9CB8C2',
      },
      fontFamily: {
        headline: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        label: ['Space Grotesk', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '0.75rem',
      },
    },
  },
  plugins: [],
}

export default config
