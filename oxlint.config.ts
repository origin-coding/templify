import { defineConfig } from 'oxlint';

export default defineConfig({
  categories: {
    correctness: 'error',
    suspicious: 'error',
    perf: 'error',
  },
  plugins: ['typescript', 'oxc', 'import', 'node', 'vitest', 'vue'],
  ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  options: {
    maxWarnings: 0,
  },
});
