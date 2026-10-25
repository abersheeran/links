import { beforeEach, describe, expect, it } from 'vitest';
import {
  apiRequest,
  createTenantFixture,
  createUserFixture,
  fetchWorker,
  loginFixture,
  readJson,
  resetData,
  sessionRequest,
} from './helpers';

describe('browser sessions and RBAC', () => {
  beforeEach(async () => {
    await resetData();
  });

  it('logs in, exposes permissions, enforces CSRF, and logs out', async () => {
    const tenant = await createTenantFixture();
    const owner = await createUserFixture(tenant);
    const login = await loginFixture(
      tenant.hostname,
      owner.email,
      owner.password,
    );

    expect(login.response.status).toBe(200);
    expect(login.cookie).toMatch(/^links_session=/u);
    const setCookie = login.response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=604800');
    expect(login.csrfToken.length).toBeGreaterThan(20);

    const session = await sessionRequest(
      tenant.hostname,
      '/api/v1/auth/session',
      login.cookie,
      login.csrfToken,
    );
    expect(session.status).toBe(200);
    const sessionPayload = await readJson<{
      data: {
        user: { email: string; role: string };
        tenant: { name: string };
        permissions: string[];
      };
    }>(session);
    expect(sessionPayload.data.user.email).toBe(owner.email);
    expect(sessionPayload.data.user.role).toBe('owner');
    expect(sessionPayload.data.tenant.name).toBe('Acme');
    expect(sessionPayload.data.permissions).toContain('users:manage');

    const withoutCsrf = await fetchWorker(
      `http://${tenant.hostname}/api/v1/links`,
      {
        method: 'POST',
        headers: {
          cookie: login.cookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          targetUrl: 'https://example.com',
          code: 'no-csrf',
        }),
      },
    );
    expect(withoutCsrf.status).toBe(403);

    const withCsrf = await sessionRequest(
      tenant.hostname,
      '/api/v1/links',
      login.cookie,
      login.csrfToken,
      {
        method: 'POST',
        body: JSON.stringify({
          targetUrl: 'https://example.com',
          code: 'with-csrf',
        }),
      },
    );
    expect(withCsrf.status).toBe(201);

    const logout = await sessionRequest(
      tenant.hostname,
      '/api/v1/auth/logout',
      login.cookie,
      login.csrfToken,
      { method: 'POST' },
    );
    expect(logout.status).toBe(204);

    const afterLogout = await sessionRequest(
      tenant.hostname,
      '/api/v1/auth/session',
      login.cookie,
      login.csrfToken,
    );
    expect(afterLogout.status).toBe(401);
  });

  it('applies editor and viewer permissions on API routes', async () => {
    const tenant = await createTenantFixture();
    const owner = await createUserFixture(tenant);
    const ownerLogin = await loginFixture(
      tenant.hostname,
      owner.email,
      owner.password,
    );

    const editor = await createUserFixture(tenant, {
      email: 'editor@example.com',
      name: 'Editor',
      password: 'editor password long enough',
      role: 'editor',
    });
    const viewer = await createUserFixture(tenant, {
      email: 'viewer@example.com',
      name: 'Viewer',
      password: 'viewer password long enough',
      role: 'viewer',
    });

    const editorLogin = await loginFixture(
      tenant.hostname,
      editor.email,
      editor.password,
    );
    const viewerLogin = await loginFixture(
      tenant.hostname,
      viewer.email,
      viewer.password,
    );

    const editorCreate = await sessionRequest(
      tenant.hostname,
      '/api/v1/links',
      editorLogin.cookie,
      editorLogin.csrfToken,
      {
        method: 'POST',
        body: JSON.stringify({
          targetUrl: 'https://example.com/editor',
          code: 'editor-link',
        }),
      },
    );
    expect(editorCreate.status).toBe(201);

    const viewerCreate = await sessionRequest(
      tenant.hostname,
      '/api/v1/links',
      viewerLogin.cookie,
      viewerLogin.csrfToken,
      {
        method: 'POST',
        body: JSON.stringify({
          targetUrl: 'https://example.com/viewer',
          code: 'viewer-link',
        }),
      },
    );
    expect(viewerCreate.status).toBe(403);

    const viewerList = await sessionRequest(
      tenant.hostname,
      '/api/v1/links',
      viewerLogin.cookie,
      viewerLogin.csrfToken,
    );
    expect(viewerList.status).toBe(200);

    const editorTeam = await sessionRequest(
      tenant.hostname,
      '/api/v1/users',
      editorLogin.cookie,
      editorLogin.csrfToken,
    );
    expect(editorTeam.status).toBe(403);

    const ownerTeam = await sessionRequest(
      tenant.hostname,
      '/api/v1/users',
      ownerLogin.cookie,
      ownerLogin.csrfToken,
    );
    expect(ownerTeam.status).toBe(200);
  });

  it('locks an account after repeated password failures', async () => {
    const tenant = await createTenantFixture();
    const owner = await createUserFixture(tenant);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const failed = await loginFixture(
        tenant.hostname,
        owner.email,
        'wrong password value',
      );
      expect(failed.response.status).toBe(401);
    }

    const fifth = await loginFixture(
      tenant.hostname,
      owner.email,
      'wrong password value',
    );
    expect(fifth.response.status).toBe(429);

    const locked = await loginFixture(
      tenant.hostname,
      owner.email,
      owner.password,
    );
    expect(locked.response.status).toBe(429);
  });

  it('allows the current user to change their password', async () => {
    const tenant = await createTenantFixture();
    const owner = await createUserFixture(tenant);
    const login = await loginFixture(
      tenant.hostname,
      owner.email,
      owner.password,
    );
    const newPassword = 'a completely new password';

    const changed = await sessionRequest(
      tenant.hostname,
      '/api/v1/auth/password',
      login.cookie,
      login.csrfToken,
      {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: owner.password,
          newPassword,
        }),
      },
    );
    expect(changed.status).toBe(204);

    const relogin = await loginFixture(
      tenant.hostname,
      owner.email,
      newPassword,
    );
    expect(relogin.response.status).toBe(200);
  });

  it('keeps API key clients working without CSRF', async () => {
    const tenant = await createTenantFixture();
    const response = await apiRequest('/api/v1/links', tenant.apiKey, {
      method: 'POST',
      body: JSON.stringify({
        targetUrl: 'https://example.com/api-key',
        code: 'api-key-link',
      }),
    });
    expect(response.status).toBe(201);
  });

  it('lets an owner change roles, reset passwords, and disable members', async () => {
    const tenant = await createTenantFixture();
    const owner = await createUserFixture(tenant);
    const ownerLogin = await loginFixture(
      tenant.hostname,
      owner.email,
      owner.password,
    );

    const created = await sessionRequest(
      tenant.hostname,
      '/api/v1/users',
      ownerLogin.cookie,
      ownerLogin.csrfToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Mira Member',
          email: 'mira@example.com',
          password: 'initial password long enough',
          role: 'editor',
        }),
      },
    );
    expect(created.status).toBe(201);
    const user = (await readJson<{ data: { id: string } }>(created)).data;

    const demoted = await sessionRequest(
      tenant.hostname,
      `/api/v1/users/${user.id}`,
      ownerLogin.cookie,
      ownerLogin.csrfToken,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'viewer' }),
      },
    );
    expect(demoted.status).toBe(200);

    const reset = await sessionRequest(
      tenant.hostname,
      `/api/v1/users/${user.id}/password`,
      ownerLogin.cookie,
      ownerLogin.csrfToken,
      {
        method: 'POST',
        body: JSON.stringify({
          newPassword: 'replacement password long enough',
        }),
      },
    );
    expect(reset.status).toBe(204);

    const memberLogin = await loginFixture(
      tenant.hostname,
      'mira@example.com',
      'replacement password long enough',
    );
    expect(memberLogin.response.status).toBe(200);
    const session = await sessionRequest(
      tenant.hostname,
      '/api/v1/auth/session',
      memberLogin.cookie,
      memberLogin.csrfToken,
    );
    const sessionPayload = await readJson<{
      data: { user: { role: string }; permissions: string[] };
    }>(session);
    expect(sessionPayload.data.user.role).toBe('viewer');
    expect(sessionPayload.data.permissions).not.toContain('links:write');

    const disabled = await sessionRequest(
      tenant.hostname,
      `/api/v1/users/${user.id}`,
      ownerLogin.cookie,
      ownerLogin.csrfToken,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'disabled' }),
      },
    );
    expect(disabled.status).toBe(200);

    const blocked = await sessionRequest(
      tenant.hostname,
      '/api/v1/links',
      memberLogin.cookie,
      memberLogin.csrfToken,
    );
    expect(blocked.status).toBe(401);
  });
});
