import { beforeEach, describe, expect, it } from 'vitest';
import {
  apiRequest,
  createLinkFixture,
  createTenantFixture,
  fetchWorker,
  readJson,
  resetData,
} from './helpers';

describe('tenant-scoped short link CRUD', () => {
  beforeEach(async () => {
    await resetData();
  });

  it('creates, lists, updates, and deletes a short link', async () => {
    const tenant = await createTenantFixture();
    const link = await createLinkFixture(tenant, {
      targetUrl: 'https://example.com/landing?keep=1',
      tags: ['campaign', 'campaign', 'launch'],
    });

    expect(link.code).toBe('promo');
    expect(link.shortUrl).toBe('http://links.test/promo');

    const list = await apiRequest(
      '/api/v1/links?q=promo&limit=10',
      tenant.apiKey,
    );
    expect(list.status).toBe(200);
    const listPayload = await readJson<{
      data: Array<{ id: string; tags: string[] }>;
      pagination: { hasMore: boolean; total: number };
    }>(list);
    expect(listPayload.data).toHaveLength(1);
    expect(listPayload.data[0]?.id).toBe(link.id);
    expect(listPayload.data[0]?.tags).toEqual(['campaign', 'launch']);
    expect(listPayload.pagination.hasMore).toBe(false);
    expect(listPayload.pagination.total).toBe(1);

    const updated = await apiRequest(
      `/api/v1/links/${link.id}`,
      tenant.apiKey,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Updated',
          status: 'disabled',
          tags: ['updated'],
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      },
    );
    expect(updated.status).toBe(200);
    const updatedPayload = await readJson<{
      data: { title: string; status: string; tags: string[] };
    }>(updated);
    expect(updatedPayload.data.title).toBe('Updated');
    expect(updatedPayload.data.status).toBe('disabled');
    expect(updatedPayload.data.tags).toEqual(['updated']);

    const deleted = await apiRequest(
      `/api/v1/links/${link.id}`,
      tenant.apiKey,
      { method: 'DELETE' },
    );
    expect(deleted.status).toBe(204);

    const missing = await apiRequest(`/api/v1/links/${link.id}`, tenant.apiKey);
    expect(missing.status).toBe(404);
  });

  it('isolates links between tenants while allowing code reuse', async () => {
    const first = await createTenantFixture({
      hostname: 'one.test',
      slug: 'one',
      name: 'One',
    });
    const second = await createTenantFixture({
      hostname: 'two.test',
      slug: 'two',
      name: 'Two',
    });

    const firstLink = await createLinkFixture(first);
    const secondLink = await createLinkFixture(second);
    expect(firstLink.code).toBe(secondLink.code);

    const crossTenantRead = await apiRequest(
      `/api/v1/links/${firstLink.id}`,
      second.apiKey,
    );
    expect(crossTenantRead.status).toBe(404);
  });

  it('rejects invalid targets, reserved codes, and duplicate custom codes', async () => {
    const tenant = await createTenantFixture();
    for (const body of [
      { targetUrl: 'javascript:alert(1)' },
      { targetUrl: 'https://example.com', code: 'api' },
      { targetUrl: 'https://example.com', expiresAt: '2000-01-01T00:00:00Z' },
    ]) {
      const response = await apiRequest('/api/v1/links', tenant.apiKey, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(422);
    }

    await createLinkFixture(tenant, { code: 'duplicate' });
    const duplicate = await apiRequest('/api/v1/links', tenant.apiKey, {
      method: 'POST',
      body: JSON.stringify({
        targetUrl: 'https://example.org',
        code: 'duplicate',
      }),
    });
    expect(duplicate.status).toBe(409);
  });

  it('includes the local development port in generated short URLs', async () => {
    const tenant = await createTenantFixture({
      hostname: 'localhost:8787',
      slug: 'local',
      name: 'Local',
    });
    const link = await createLinkFixture(tenant, { code: 'local-link' });
    expect(link.shortUrl).toBe('http://localhost:8787/local-link');
  });

  it('generates lowercase codes that resolve through the public route', async () => {
    const tenant = await createTenantFixture();
    const created = await apiRequest('/api/v1/links', tenant.apiKey, {
      method: 'POST',
      body: JSON.stringify({
        targetUrl: 'https://example.com/generated',
      }),
    });
    expect(created.status).toBe(201);
    const payload = await readJson<{ data: { code: string } }>(created);
    expect(payload.data.code).toMatch(/^[a-z0-9]{8}$/u);

    const redirect = await fetchWorker(
      `http://links.test/${payload.data.code}`,
    );
    expect(redirect.status).toBe(302);
  });
});
