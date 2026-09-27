import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The .tsx test file renders components, so esbuild needs the JSX runtime.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'https://realdarrentsai.com/' },
    },
    // .tsx as well: tests/field-rules.test.tsx renders components to check what
    // a visitor sees on first paint, which the source-text scans cannot see.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Rendering a component pulls zod and libphonenumber through the transform
    // on a cold run, which is slower than the 5s default allows.
    testTimeout: 30000,
  },
});
