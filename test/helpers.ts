import { env } from 'cloudflare:workers';
import {
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import worker from '../src';

export const bootstrapToken = 'test-bootstrap-token-0123456789abcdef';

export async function fetchWorker(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const context = createExecutionContext();
  const response = await worker.fetch(new Request(url, init), env, context);
  await waitOnExecutionContext(context);
  return response;
}

export async function resetData(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM users'),
    env.DB.prepare('DELETE FROM links'),
    env.DB.prepare('DELETE FROM api_keys'),
    env.DB.prepare('DELETE FROM tenant_domains'),
    env.DB.prepare('DELETE FROM tenants'),
  ]);

  let cursor: string | undefined;
  do {
    const page = await env.CACHE.list(cursor === undefined ? {} : { cursor });
    await Promise.all(page.keys.map((key) => env.CACHE.delete(key.name)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor !== undefined);
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export interface TenantFixture {
  tenantId: string;
  hostname: string;
  apiKey: string;
}

export interface UserFixture {
  id: string;
  email: string;
  password: string;
  role: 'owner' | 'editor' | 'viewer';
}

export async function createTenantFixture(options?: {
  hostname?: string;
  slug?: string;
  name?: string;
}): Promise<TenantFixture> {
  const hostname = options?.hostname ?? 'links.test';
  const slug = options?.slug ?? 'acme';
  const response = await fetchWorker(
    'http://api.links.test/api/v1/admin/tenants',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bootstrapToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: options?.name ?? 'Acme',
        slug,
        hostname,
        apiKeyName: 'Test key',
      }),
    },
  );

  if (response.status !== 201) {
    throw new Error(
      `Failed to create tenant fixture: ${response.status} ${await response.text()}`,
    );
  }

  const payload = await readJson<{
    data: {
      tenant: { id: string; hostname: string };
      apiKey: { token: string };
    };
  }>(response);

  return {
    tenantId: payload.data.tenant.id,
    hostname: payload.data.tenant.hostname,
    apiKey: payload.data.apiKey.token,
  };
}

export async function apiRequest(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init?.body !== undefined) {
    headers.set('content-type', 'application/json');
  }

  return fetchWorker(`http://api.links.test${path}`, {
    ...init,
    headers,
  });
}

export async function createUserFixture(
  tenant: TenantFixture,
  options?: {
    name?: string;
    email?: string;
    password?: string;
    role?: 'owner' | 'editor' | 'viewer';
  },
): Promise<UserFixture> {
  const email = options?.email ?? 'owner@example.com';
  const password = options?.password ?? 'correct horse battery staple';
  const role = options?.role ?? 'owner';
  const response = await fetchWorker(
    `http://api.links.test/api/v1/admin/tenants/${tenant.tenantId}/users`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bootstrapToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: options?.name ?? 'Owner',
        email,
        password,
        role,
      }),
    },
  );

  if (response.status !== 201) {
    throw new Error(
      `Failed to create user fixture: ${response.status} ${await response.text()}`,
    );
  }

  const payload = await readJson<{ data: { id: string } }>(response);
  return { id: payload.data.id, email, password, role };
}

export async function loginFixture(
  hostname: string,
  email: string,
  password: string,
): Promise<{
  response: Response;
  cookie: string;
  csrfToken: string;
}> {
  const response = await fetchWorker(`http://${hostname}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: `http://${hostname}`,
    },
    body: JSON.stringify({ email, password }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  let csrfToken = '';
  if (response.ok) {
    const payload = await readJson<{
      data: { csrfToken: string };
    }>(response.clone());
    csrfToken = payload.data.csrfToken;
  }
  return { response, cookie, csrfToken };
}

export async function sessionRequest(
  hostname: string,
  path: string,
  cookie: string,
  csrfToken: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('cookie', cookie);
  if (init?.method !== undefined && init.method !== 'GET') {
    headers.set('x-csrf-token', csrfToken);
  }
  if (init?.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  return fetchWorker(`http://${hostname}${path}`, { ...init, headers });
}

export interface LinkFixture {
  id: string;
  code: string;
  shortUrl: string;
  targetUrl: string;
}

export async function createLinkFixture(
  tenant: TenantFixture,
  overrides?: {
    code?: string;
    targetUrl?: string;
    title?: string;
    tags?: string[];
    expiresAt?: string;
  },
): Promise<LinkFixture> {
  const response = await apiRequest('/api/v1/links', tenant.apiKey, {
    method: 'POST',
    body: JSON.stringify({
      targetUrl: overrides?.targetUrl ?? 'https://example.com/landing',
      code: overrides?.code ?? 'promo',
      title: overrides?.title ?? 'Promo',
      tags: overrides?.tags ?? ['campaign'],
      ...(overrides?.expiresAt === undefined
        ? {}
        : { expiresAt: overrides.expiresAt }),
    }),
  });

  if (response.status !== 201) {
    throw new Error(
      `Failed to create link fixture: ${response.status} ${await response.text()}`,
    );
  }

  const payload = await readJson<{
    data: LinkFixture;
  }>(response);
  return payload.data;
}
