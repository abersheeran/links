import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { recordClick } from '../lib/analytics';
import {
  isReservedCode,
  isValidCode,
  mergeQuery,
  referrerHostname,
} from '../lib/url';
import { detectBrowser, detectDevice } from '../lib/user-agent';
import { publicText } from '../lib/http';
import { resolveLink } from '../services/links';
import { resolveTenantByHost } from '../services/tenants';

export const redirectRoutes = new Hono<AppEnv>();

function countryFromRequest(request: Request): string {
  const cf = request.cf;
  if (cf !== undefined && 'country' in cf && typeof cf.country === 'string') {
    return cf.country;
  }
  return 'unknown';
}

redirectRoutes.on(['GET', 'HEAD'], '/:code', async (context) => {
  const started = Date.now();
  const request = context.req.raw;
  const requestUrl = new URL(request.url);
  const code = context.req.param('code').toLowerCase();
  const hostname = requestUrl.host.toLowerCase();
  const userAgent = request.headers.get('user-agent') ?? '';
  const utmSource = requestUrl.searchParams.get('utm_source') ?? 'none';
  const utmMedium = requestUrl.searchParams.get('utm_medium') ?? 'none';
  const utmCampaign = requestUrl.searchParams.get('utm_campaign') ?? 'none';

  if (isReservedCode(code) || !isValidCode(code)) {
    return publicText('Short link not found.', 404);
  }

  const tenant = await resolveTenantByHost(
    context.env,
    context.executionCtx,
    hostname,
  );
  if (tenant === null || tenant.status !== 'active') {
    return publicText('Short link not found.', 404);
  }

  const link = await resolveLink(
    context.env,
    context.executionCtx,
    tenant.id,
    code,
  );
  const baseEvent = {
    analytics: context.env.CLICK_ANALYTICS,
    tenantId: tenant.id,
    linkId: link?.id ?? '',
    code,
    hostname,
    country: countryFromRequest(request),
    referrer: referrerHostname(request.headers.get('referer') ?? undefined),
    userAgent,
    durationMs: Date.now() - started,
    device: detectDevice(userAgent),
    browser: detectBrowser(userAgent),
    utmSource: utmSource.slice(0, 64),
    utmMedium: utmMedium.slice(0, 64),
    utmCampaign: utmCampaign.slice(0, 64),
  };

  if (link === null) {
    recordClick({ ...baseEvent, outcome: 'not_found' });
    return publicText('Short link not found.', 404);
  }

  if (link.status === 'disabled') {
    recordClick({ ...baseEvent, outcome: 'disabled' });
    return publicText('This short link is no longer available.', 410);
  }

  if (link.expiresAt !== null && link.expiresAt <= Date.now()) {
    recordClick({ ...baseEvent, outcome: 'expired' });
    return publicText('This short link has expired.', 410);
  }

  recordClick({ ...baseEvent, outcome: 'redirect' });

  return new Response(null, {
    status: 302,
    headers: {
      location: mergeQuery(link.targetUrl, requestUrl),
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow',
      'x-content-type-options': 'nosniff',
    },
  });
});
