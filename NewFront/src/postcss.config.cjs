module.exports = {
  plugins: {
    // Tailwind v4 plugin — runs alongside Mantine's preset. We deliberately
    // import only `tailwindcss/theme` + `tailwindcss/utilities` (no preflight)
    // from src/shadcn.css so Tailwind doesn't reset Mantine pages.
    '@tailwindcss/postcss': {},
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
};
