import { beforeEach, describe, expect, it } from 'vitest';
import {
  apiRequest,
  createTenantFixture,
  readJson,
  resetData,
} from './helpers';

describe('AI suggestion route', () => {
  beforeEach(async () => {
    await resetData();
  });

  it('falls back when Workers AI is unavailable', async () => {
    const tenant = await createTenantFixture();
    const response = await apiRequest('/api/v1/ai/suggest', tenant.apiKey, {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/blog/spring-launch',
      }),
    });

    expect(response.status).toBe(200);
    const payload = await readJson<{
      data: {
        title: string;
        codes: string[];
        source: string;
      };
    }>(response);
    expect(payload.data.source).toBe('fallback');
    expect(payload.data.title).toBe('blog spring-launch');
    expect(payload.data.codes).toHaveLength(3);
  });
});
