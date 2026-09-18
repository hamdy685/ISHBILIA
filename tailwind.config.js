import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './vendor/laravel/framework/src/Illuminate/Pagination/resources/views/*.blade.php',
        './storage/framework/views/*.php',
        './resources/**/*.blade.php',
        './resources/**/*.js',
        './resources/**/*.vue',
        './src/**/*.{js,ts,jsx,tsx}',
        './index.html',
    ],
    theme: {
        extend: {
            colors: {
                gold: {
                    50: '#fdfbf7',
                    100: '#fbf6ec',
                    200: '#f5e9ce',
                    300: '#edd6a6',
                    400: '#e2be76',
                    500: '#d4a84e',
                    600: '#c5933d',
                    700: '#a47430',
                    800: '#855d2b',
                    900: '#6e4c27',
                    950: '#3f2812',
                },
                copper: {
                    50: '#fff7ed',
                    100: '#ffedd5',
                    200: '#fed7aa',
                    300: '#fdba74',
                    400: '#fb923c',
                    500: '#f97316',
                    600: '#ea580c',
                    700: '#c2410c',
                    800: '#9a3412',
                    900: '#7c2d12',
                },
                charcoal: {
                    800: '#151b26',
                    850: '#111722',
                    900: '#0c1017',
                    950: '#070a0f',
                },
            },
            fontFamily: {
                sans: ['Cairo', 'Tajawal', 'Segoe UI', ...defaultTheme.fontFamily.sans],
                cairo: ['Cairo', 'sans-serif'],
            },
            keyframes: {
                staggerFadeIn: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                slideInRight: {
                    '0%': { opacity: '0', transform: 'translateX(40px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                subtlePulse: {
                    '0%, 100%': { transform: 'scale(1)', opacity: '1' },
                    '50%': { transform: 'scale(1.08)', opacity: '0.85' },
                },
                glowPulse: {
                    '0%, 100%': { boxShadow: '0 0 15px rgba(212, 168, 78, 0.2)' },
                    '50%': { boxShadow: '0 0 25px rgba(212, 168, 78, 0.45)' },
                },
                accordionDown: {
                    from: { height: '0', opacity: '0' },
                    to: { height: 'var(--radix-accordion-content-height, auto)', opacity: '1' },
                },
                accordionUp: {
                    from: { height: 'var(--radix-accordion-content-height, auto)', opacity: '1' },
                    to: { height: '0', opacity: '0' },
                },
            },
            animation: {
                'stagger-fade': 'staggerFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'subtle-pulse': 'subtlePulse 2.5s ease-in-out infinite',
                'glow-pulse': 'glowPulse 3s ease-in-out infinite',
                'accordion-down': 'accordionDown 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                'accordion-up': 'accordionUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            },
        },
    },
    plugins: [],
};
