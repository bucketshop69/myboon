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
        'background': '#14140d',
        'surface-container-lowest': '#0f0e08',
        'surface-container-low': '#1d1c15',
        'surface-container': '#212019',
        'surface-container-high': '#2b2a23',
        'surface-container-highest': '#36352d',
        'surface-variant': '#36352d',
        'on-surface': '#e7e2d7',
        'on-surface-variant': '#cdc6b5',
        'on-background': '#e7e2d7',
        'primary': '#e4d389',
        'primary-container': '#c7b770',
        'on-primary': '#393000',
        'on-primary-container': '#53480b',
        'tertiary': '#9de1c0',
        'tertiary-container': '#82c5a5',
        'on-tertiary': '#003826',
        'outline-variant': '#4a473a',
        'outline': '#969081',
        'secondary': '#cbc7aa',
        'secondary-container': '#494831',
        'error': '#ffb4ab',
        'surface': '#14140d',
        'surface-dim': '#14140d',
        'surface-bright': '#3b3931',
        'inverse-surface': '#e7e2d7',
        'inverse-on-surface': '#323129',
        'inverse-primary': '#6b5e21',
        'primary-fixed': '#f4e397',
        'primary-fixed-dim': '#d7c77e',
        'surface-tint': '#d7c77e',
        'on-primary-fixed': '#211b00',
        'on-primary-fixed-variant': '#524609',
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
