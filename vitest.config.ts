import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { url: 'https://realdarrentsai.com/' },
    },
    include: ['tests/**/*.test.ts'],
  },
});
