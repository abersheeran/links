import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryAnalytics } from '../src/services/analytics';
import {
  apiRequest,
  createLinkFixture,
  createTenantFixture,
  readJson,
  resetData,
} from './helpers';

describe('Analytics Engine queries', () => {
  beforeEach(async () => {
    await resetData();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a configuration error when the account ID is absent', async () => {
    await expect(
      queryAnalytics(
        {
          ANALYTICS_ACCOUNT_ID: '',
          ANALYTICS_DATASET: 'links_clicks',
        },
        '00000000-0000-4000-8000-000000000000',
        {},
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: 'analytics_not_configured',
    });
  });

  it('queries totals, series, and top dimensions with sampling weights', async () => {
    const tenant = await createTenantFixture();
    const link = await createLinkFixture(tenant);

    const queryBodies: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? init.body : '';
        queryBodies.push(body);

        if (body.includes('AS bucket')) {
          return Response.json({
            data: [{ bucket: '1760000000', clicks: '12' }],
            rows: 1,
          });
        }
        if (body.includes('blob3 AS code')) {
          return Response.json({
            data: [{ link_id: link.id, code: link.code, clicks: '12' }],
            rows: 1,
          });
        }
        if (body.includes('blob5 AS country')) {
          return Response.json({
            data: [{ country: 'US', clicks: '8' }],
            rows: 1,
          });
        }
        if (body.includes('blob6 AS referrer')) {
          return Response.json({
            data: [{ referrer: 'example.com', clicks: '7' }],
            rows: 1,
          });
        }
        if (body.includes('blob9 AS device')) {
          return Response.json({
            data: [{ device: 'mobile', clicks: '9' }],
            rows: 1,
          });
        }
        if (body.includes('blob10 AS browser')) {
          return Response.json({
            data: [{ browser: 'safari', clicks: '6' }],
            rows: 1,
          });
        }
        if (body.includes('blob11 AS source')) {
          return Response.json({
            data: [
              {
                source: 'newsletter',
                medium: 'email',
                campaign: 'launch',
                clicks: '5',
              },
            ],
            rows: 1,
          });
        }
        return Response.json({ data: [{ clicks: '12' }], rows: 1 });
      }),
    );

    const response = await apiRequest(
      '/api/v1/analytics?from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z',
      tenant.apiKey,
    );
    expect(response.status).toBe(200);

    const payload = await readJson<{
      data: {
        totals: { clicks: number };
        topLinks: Array<{ linkId: string; clicks: number }>;
        topDevices: Array<{ device: string; clicks: number }>;
        topCampaigns: Array<{ campaign: string; clicks: number }>;
      };
    }>(response);
    expect(payload.data.totals.clicks).toBe(12);
    expect(payload.data.topLinks[0]?.linkId).toBe(link.id);
    expect(payload.data.topDevices[0]?.device).toBe('mobile');
    expect(payload.data.topCampaigns[0]?.campaign).toBe('launch');
    expect(queryBodies).toHaveLength(8);
    for (const query of queryBodies) {
      expect(query).toContain("blob8 = 'redirect'");
      expect(query).toContain('SUM(_sample_interval)');
      expect(query).toContain(tenant.tenantId);
    }
  });
});
