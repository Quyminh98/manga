import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0b1326',
        'surface-dim': '#0b1326',
        'surface-bright': '#31394d',
        'surface-container-lowest': '#060e20',
        'surface-container-low': '#131b2e',
        'surface-container': '#171f33',
        'surface-container-high': '#222a3d',
        'surface-container-highest': '#2d3449',
        'on-surface': '#dae2fd',
        'on-surface-variant': '#c2c6d6',
        'inverse-surface': '#dae2fd',
        'inverse-on-surface': '#283044',
        outline: '#8c909f',
        'outline-variant': '#424754',
        'surface-tint': '#adc6ff',
        primary: '#adc6ff',
        'on-primary': '#002e6a',
        'primary-container': '#4d8eff',
        'on-primary-container': '#00285d',
        'inverse-primary': '#005ac2',
        secondary: '#4edea3',
        'on-secondary': '#003824',
        'secondary-container': '#00a572',
        'on-secondary-container': '#00311f',
        tertiary: '#ffb786',
        'on-tertiary': '#502400',
        'tertiary-container': '#df7412',
        'on-tertiary-container': '#461f00',
        error: '#ffb4ab',
        'on-error': '#690005',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',
        'primary-fixed': '#d8e2ff',
        'primary-fixed-dim': '#adc6ff',
        'on-primary-fixed': '#001a42',
        'on-primary-fixed-variant': '#004395',
        'secondary-fixed': '#6ffbbe',
        'secondary-fixed-dim': '#4edea3',
        'on-secondary-fixed': '#002113',
        'on-secondary-fixed-variant': '#005236',
        'tertiary-fixed': '#ffdcc6',
        'tertiary-fixed-dim': '#ffb786',
        'on-tertiary-fixed': '#311400',
        'on-tertiary-fixed-variant': '#723600',
        background: '#0b1326',
        'on-background': '#dae2fd',
        'surface-variant': '#2d3449',
        'surface-charcoal': '#0F172A',
        'surface-slate': '#1E293B',
        'border-subtle': '#334155',
        'vilao-blue': '#3B82F6',
        'emerald-success': '#10B981',
        'text-primary': '#F8FAFC',
        'text-secondary': '#94A3B8'
      },
      fontFamily: {
        'headline-lg': ['Space Grotesk', 'sans-serif'],
        'headline-md': ['Space Grotesk', 'sans-serif'],
        'headline-sm': ['Space Grotesk', 'sans-serif'],
        'body-lg': ['Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif'],
        'body-sm': ['Inter', 'sans-serif'],
        'label-caps': ['JetBrains Mono', 'monospace'],
        'code-sm': ['JetBrains Mono', 'monospace']
      },
      fontSize: {
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-sm': ['18px', { lineHeight: '24px', fontWeight: '500' }],
        'body-lg': ['16px', { lineHeight: '26px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '22px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '20px', fontWeight: '400' }],
        'label-caps': ['11px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '600' }],
        'code-sm': ['12px', { lineHeight: '18px', fontWeight: '400' }]
      },
      borderRadius: {
        sm: '0.125rem',
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px'
      },
      spacing: {
        'sidebar-width': '260px',
        'container-max': '1200px',
        gutter: '24px',
        'margin-mobile': '16px',
        unit: '8px'
      },
      maxWidth: {
        'container-max': '1200px'
      }
    }
  },
  plugins: []
} satisfies Config
