/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1E3A8A',
          hover: '#1D4ED8',
          soft: '#DBEAFE',
          navy: '#1E3A8A',
        },
        accent: {
          DEFAULT: '#059669',
          soft: '#D1FAE5',
        },
        surface: {
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
          muted: '#F1F5F9',
        },
        content: {
          primary: '#0F172A',
          secondary: '#475569',
          muted: '#94A3B8',
        },
        status: {
          success: '#16A34A',
          'success-bg': '#F0FDF4',
          'success-border': '#BBF7D0',
          danger: '#DC2626',
          'danger-bg': '#FEF2F2',
          'danger-border': '#FECACA',
          warning: '#D97706',
          'warning-bg': '#FFFBEB',
          'warning-border': '#FDE68A',
          info: '#2563EB',
          'info-bg': '#EFF6FF',
          'info-border': '#BFDBFE',
        }
      },
      borderRadius: {
        'card': '8px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
        'card-hover': '0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
      }
    },
  },
  plugins: [],
}
