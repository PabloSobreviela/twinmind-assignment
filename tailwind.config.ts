import type { Config } from 'tailwindcss';

/**
 * tailwind.config.ts — round 5b-ii
 *
 * Final palette. Panel toned from #ffffff to #f0eadb (5b-ii) so column
 * surfaces sit on the cream bg rather than blazing against it. The
 * bg → panel → panel-2 hierarchy stays linear (each step slightly
 * lighter/warmer): #e8e0cf → #f0eadb → #f5efe2.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: '#e8e0cf',
        panel: '#f4eee2',
        'panel-2': '#f5efe2',
        border: '#b8aea0',
        text: '#1f1a14',
        muted: '#8a8074',

        // Action accents
        accent: '#601702',
        'accent-2': '#c8a24a',

        // Type-coded accents
        question: '#601702',
        talking: '#6b6357',
        answer: '#c8a24a',
        'answer-text': '#8a6f30',
        fact: '#1f1a14',

        // Status (banners)
        good: '#2d7a3e',
        warn: '#9c6612',
        danger: '#601702',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
