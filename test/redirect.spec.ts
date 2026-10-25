import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  apiRequest,
  createLinkFixture,
  createTenantFixture,
  fetchWorker,
  resetData,
} from './helpers';

describe('public redirects', () => {
  beforeEach(async () => {
    await resetData();
  });

  it('redirects and forwards incoming query parameters', async () => {
    const tenant = await createTenantFixture();
    await createLinkFixture(tenant, {
      code: 'promo',
      targetUrl: 'https://example.com/landing?keep=1',
    });

    const response = await fetchWorker(
      'http://links.test/promo?utm_source=newsletter&utm_source=second',
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://example.com/landing?keep=1&utm_source=newsletter&utm_source=second',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');

    const cachedTenant = await env.CACHE.get('v1:host:links.test', 'json');
    expect(cachedTenant).not.toBeNull();
    const cachedLink = await env.CACHE.get(
      `v1:link:${tenant.tenantId}:promo`,
      'json',
    );
    expect(cachedLink).not.toBeNull();
  });

  it('returns gone for disabled and expired links', async () => {
    const tenant = await createTenantFixture();
    const link = await createLinkFixture(tenant, { code: 'disabled' });

    const disabled = await apiRequest(
      `/api/v1/links/${link.id}`,
      tenant.apiKey,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'disabled' }),
      },
    );
    expect(disabled.status).toBe(200);

    const disabledRedirect = await fetchWorker('http://links.test/disabled');
    expect(disabledRedirect.status).toBe(410);

    const expiring = await createLinkFixture(tenant, { code: 'expired' });
    await env.DB.prepare('UPDATE links SET expires_at = ? WHERE id = ?')
      .bind(Date.now() - 1000, expiring.id)
      .run();
    await env.CACHE.delete(`v1:link:${tenant.tenantId}:expired`);

    const expiredRedirect = await fetchWorker('http://links.test/expired');
    expect(expiredRedirect.status).toBe(410);
  });

  it('returns not found for unknown hosts and missing codes', async () => {
    const tenant = await createTenantFixture();
    await createLinkFixture(tenant);

    const unknownHost = await fetchWorker('http://unknown.test/promo');
    expect(unknownHost.status).toBe(404);

    const missingCode = await fetchWorker('http://links.test/not-created');
    expect(missingCode.status).toBe(404);
  });
});
