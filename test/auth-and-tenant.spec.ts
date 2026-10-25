import { beforeEach, describe, expect, it } from 'vitest';
import {
  apiRequest,
  bootstrapToken,
  createTenantFixture,
  fetchWorker,
  loginFixture,
  readJson,
  resetData,
} from './helpers';

describe('tenant bootstrap and API key authentication', () => {
  beforeEach(async () => {
    await resetData();
  });

  it('rejects missing and invalid platform tokens', async () => {
    const missing = await fetchWorker(
      'http://api.links.test/api/v1/admin/tenants',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Acme',
          slug: 'acme',
          hostname: 'links.test',
        }),
      },
    );
    expect(missing.status).toBe(401);

    const invalid = await fetchWorker(
      'http://api.links.test/api/v1/admin/tenants',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Acme',
          slug: 'acme',
          hostname: 'links.test',
        }),
      },
    );
    expect(invalid.status).toBe(401);
  });

  it('creates a tenant and returns its API key once', async () => {
    const tenant = await createTenantFixture();
    expect(tenant.apiKey).toMatch(/^lnk_[a-f0-9]{10}_[A-Za-z0-9_-]{32}$/u);

    const me = await fetchWorker('http://api.links.test/api/v1/me', {
      headers: { authorization: `Bearer ${tenant.apiKey}` },
    });
    expect(me.status).toBe(200);

    const payload = await readJson<{
      data: {
        tenant: { id: string; slug: string; primaryHostname: string };
      };
    }>(me);
    expect(payload.data.tenant.id).toBe(tenant.tenantId);
    expect(payload.data.tenant.slug).toBe('acme');
    expect(payload.data.tenant.primaryHostname).toBe('links.test');
  });

  it('rejects duplicate tenant domains', async () => {
    await createTenantFixture();
    const duplicate = await fetchWorker(
      'http://api.links.test/api/v1/admin/tenants',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bootstrapToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Other',
          slug: 'other',
          hostname: 'links.test',
        }),
      },
    );

    expect(duplicate.status).toBe(409);
  });

  it('rotates keys and prevents revoking the last active key', async () => {
    const tenant = await createTenantFixture();
    const created = await apiRequest('/api/v1/api-keys', tenant.apiKey, {
      method: 'POST',
      body: JSON.stringify({ name: 'Rotation key' }),
    });
    expect(created.status).toBe(201);
    const createdPayload = await readJson<{
      data: { id: string; token: string };
    }>(created);

    const oldKeyId = (
      await readJson<{
        data: Array<{ id: string; current: boolean }>;
      }>(await apiRequest('/api/v1/api-keys', tenant.apiKey))
    ).data.find((key) => key.current)?.id;
    expect(oldKeyId).toBeDefined();

    const revokeOld = await apiRequest(
      `/api/v1/api-keys/${oldKeyId}`,
      tenant.apiKey,
      { method: 'DELETE' },
    );
    expect(revokeOld.status).toBe(204);

    const oldKeyAttempt = await apiRequest('/api/v1/me', tenant.apiKey);
    expect(oldKeyAttempt.status).toBe(401);

    const newKeyMe = await apiRequest('/api/v1/me', createdPayload.data.token);
    expect(newKeyMe.status).toBe(200);

    const revokeLast = await apiRequest(
      `/api/v1/api-keys/${createdPayload.data.id}`,
      createdPayload.data.token,
      { method: 'DELETE' },
    );
    expect(revokeLast.status).toBe(409);
  });

  it('lists tenants and issues a platform recovery key', async () => {
    const tenant = await createTenantFixture();
    const list = await fetchWorker(
      'http://api.links.test/api/v1/admin/tenants',
      {
        headers: { authorization: `Bearer ${bootstrapToken}` },
      },
    );
    expect(list.status).toBe(200);
    const listPayload = await readJson<{
      data: Array<{ id: string; primaryHostname: string }>;
    }>(list);
    expect(listPayload.data[0]?.id).toBe(tenant.tenantId);
    expect(listPayload.data[0]?.primaryHostname).toBe('links.test');

    const recovery = await fetchWorker(
      `http://api.links.test/api/v1/admin/tenants/${tenant.tenantId}/api-keys`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bootstrapToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'Recovery key' }),
      },
    );
    expect(recovery.status).toBe(201);
    const recoveryPayload = await readJson<{
      data: { token: string };
    }>(recovery);

    const me = await apiRequest('/api/v1/me', recoveryPayload.data.token);
    expect(me.status).toBe(200);
  });

  it('rejects request bodies larger than 64 KiB', async () => {
    const tenant = await createTenantFixture();
    const response = await apiRequest('/api/v1/links', tenant.apiKey, {
      method: 'POST',
      body: JSON.stringify({
        targetUrl: 'https://example.com',
        title: 'x'.repeat(70 * 1024),
      }),
    });
    expect(response.status).toBe(413);
  });

  it('can provision a tenant and owner in one request', async () => {
    const created = await fetchWorker(
      'http://api.links.test/api/v1/admin/tenants',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bootstrapToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Owner Tenant',
          slug: 'owner-tenant',
          hostname: 'owner.test',
          owner: {
            name: 'Owner User',
            email: 'owner@owner.test',
            password: 'owner password long enough',
          },
        }),
      },
    );
    expect(created.status).toBe(201);
    const payload = await readJson<{
      data: { owner: { email: string; role: string } };
    }>(created);
    expect(payload.data.owner.role).toBe('owner');

    const login = await loginFixture(
      'owner.test',
      payload.data.owner.email,
      'owner password long enough',
    );
    expect(login.response.status).toBe(200);

    const unlinked = await loginFixture(
      'unlinked.test',
      payload.data.owner.email,
      'owner password long enough',
    );
    expect(unlinked.response.status).toBe(404);
    const unlinkedPayload = await readJson<{ error: { code: string } }>(
      unlinked.response,
    );
    expect(unlinkedPayload.error.code).toBe('tenant_not_found');
  });
});
