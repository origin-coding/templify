import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 100,
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  sortPackageJson: true,
  ignorePatterns: [
    'AGENTS.md',
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/*.docx',
    '**/*.xlsx',
    '**/*.xls',
    '**/*.zip',
    'pnpm-lock.yaml',
  ],
});
