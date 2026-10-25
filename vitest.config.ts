import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, 'migrations'),
  );

  return {
    plugins: [
      cloudflareTest({
        // Workers AI is a remote-only binding. Omit it from automated tests so
        // the suite stays fully local; the AI route is covered through its
        // fallback path and pure parser tests.
        wrangler: { configPath: './wrangler.test.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BOOTSTRAP_TOKEN: 'test-bootstrap-token-0123456789abcdef',
            ANALYTICS_API_TOKEN: 'test-analytics-token',
            ANALYTICS_ACCOUNT_ID: 'test-account',
            PUBLIC_SCHEME: 'http',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
