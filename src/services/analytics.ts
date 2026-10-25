import { ApiError, errorMessage } from '../lib/errors';

interface AnalyticsQuery {
  from?: string;
  to?: string;
  linkId?: string;
}

interface AnalyticsConfig {
  ANALYTICS_ACCOUNT_ID: string;
  ANALYTICS_API_TOKEN?: string;
  ANALYTICS_DATASET: string;
}

interface AnalyticsEngineRow {
  [key: string]: string | number | null;
}

interface AnalyticsEngineResponse {
  data?: AnalyticsEngineRow[];
}

interface AnalyticsRange {
  fromMs: number;
  toMs: number;
  fromSeconds: number;
  toSeconds: number;
  bucketSeconds: number;
}

function parseTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new ApiError(
      422,
      'validation_error',
      `${field} must be a valid ISO 8601 timestamp or date.`,
    );
  }
  return timestamp;
}

function resolveRange(query: AnalyticsQuery, now: number): AnalyticsRange {
  const toMs = query.to === undefined ? now : parseTimestamp(query.to, 'to');
  const fromMs =
    query.from === undefined
      ? toMs - 7 * 24 * 60 * 60 * 1000
      : parseTimestamp(query.from, 'from');
  const spanMs = toMs - fromMs;

  if (spanMs <= 0) {
    throw new ApiError(
      422,
      'invalid_range',
      '`from` must be earlier than `to`.',
    );
  }
  if (spanMs > 90 * 24 * 60 * 60 * 1000) {
    throw new ApiError(
      422,
      'invalid_range',
      'Analytics ranges are limited to 90 days.',
    );
  }

  const bucketSeconds =
    spanMs <= 2 * 24 * 60 * 60 * 1000
      ? 60 * 60
      : spanMs <= 14 * 24 * 60 * 60 * 1000
        ? 6 * 60 * 60
        : 24 * 60 * 60;

  return {
    fromMs,
    toMs,
    fromSeconds: Math.floor(fromMs / 1000),
    toSeconds: Math.ceil(toMs / 1000),
    bucketSeconds,
  };
}

function sqlString(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function asNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

async function runQuery(
  env: AnalyticsConfig,
  query: string,
): Promise<AnalyticsEngineRow[]> {
  const accountId = env.ANALYTICS_ACCOUNT_ID;
  const token = env.ANALYTICS_API_TOKEN;
  if (accountId.length === 0 || token === undefined || token.length === 0) {
    throw new ApiError(
      503,
      'analytics_not_configured',
      'Analytics queries require ANALYTICS_ACCOUNT_ID and ANALYTICS_API_TOKEN.',
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'text/plain; charset=utf-8',
      },
      body: query,
    },
  );

  if (!response.ok) {
    const body = (await response.text()).slice(0, 1000);
    console.error(
      JSON.stringify({
        event: 'analytics_query_failed',
        status: response.status,
        body,
      }),
    );
    throw new ApiError(
      502,
      'analytics_unavailable',
      'Analytics Engine could not execute the query.',
    );
  }

  const payload = (await response.json()) as AnalyticsEngineResponse;
  if (!Array.isArray(payload.data)) {
    throw new ApiError(
      502,
      'analytics_invalid_response',
      'Analytics Engine returned an invalid response.',
    );
  }
  return payload.data;
}

function validateDatasetName(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new ApiError(
      500,
      'analytics_dataset_invalid',
      'ANALYTICS_DATASET must be a SQL identifier.',
    );
  }
  return value;
}

export async function queryAnalytics(
  env: AnalyticsConfig,
  tenantId: string,
  query: AnalyticsQuery,
) {
  const now = Date.now();
  const range = resolveRange(query, now);
  const dataset = validateDatasetName(env.ANALYTICS_DATASET);
  const linkFilter =
    query.linkId === undefined ? '' : ` AND blob2 = ${sqlString(query.linkId)}`;
  const commonWhere = [
    `index1 = ${sqlString(tenantId)}`,
    "blob8 = 'redirect'",
    `timestamp >= toDateTime(${range.fromSeconds})`,
    `timestamp < toDateTime(${range.toSeconds})`,
  ].join('\n    AND ');

  const totalsQuery = `
    SELECT SUM(_sample_interval) AS clicks
    FROM ${dataset}
    WHERE ${commonWhere}${linkFilter}
    FORMAT JSON`;

  const seriesQuery = `
    SELECT
      intDiv(toUInt32(timestamp), ${range.bucketSeconds}) * ${range.bucketSeconds} AS bucket,
      SUM(_sample_interval) AS clicks
    FROM ${dataset}
    WHERE ${commonWhere}${linkFilter}
    GROUP BY bucket
    ORDER BY bucket
    FORMAT JSON`;

  const linksQuery = `
    SELECT
      blob2 AS link_id,
      blob3 AS code,
      SUM(_sample_interval) AS clicks
    FROM ${dataset}
    WHERE ${commonWhere}${linkFilter}
    GROUP BY link_id, code
    ORDER BY clicks DESC
    LIMIT 10
    FORMAT JSON`;

  const countriesQuery = `
    SELECT
      blob5 AS country,
      SUM(_sample_interval) AS clicks
    FROM ${dataset}
    WHERE ${commonWhere}${linkFilter}
    GROUP BY country
    ORDER BY clicks DESC
    LIMIT 10
    FORMAT JSON`;

  const referrersQuery = `
    SELECT
      blob6 AS referrer,
      SUM(_sample_interval) AS clicks
    FROM ${dataset}
    WHERE ${commonWhere}${linkFilter}
    GROUP BY referrer
    ORDER BY clicks DESC
    LIMIT 10
    FORMAT JSON`;

  const devicesQuery = `
    SELECT
      blob9 AS device,
      SUM(_sample_interval) AS clicks
    FROM ${dataset}
    WHERE ${commonWhere}${linkFilter}
    GROUP BY device
    ORDER BY clicks DESC
    LIMIT 10
    FORMAT JSON`;

  const browsersQuery = `
    SELECT
      blob10 AS browser,
      SUM(_sample_interval) AS clicks
    FROM ${dataset}
    WHERE ${commonWhere}${linkFilter}
    GROUP BY browser
    ORDER BY clicks DESC
    LIMIT 10
    FORMAT JSON`;

  const campaignsQuery = `
    SELECT
      blob11 AS source,
      blob12 AS medium,
      blob13 AS campaign,
      SUM(_sample_interval) AS clicks
    FROM ${dataset}
    WHERE ${commonWhere}${linkFilter}
    GROUP BY source, medium, campaign
    ORDER BY clicks DESC
    LIMIT 10
    FORMAT JSON`;

  let totals: AnalyticsEngineRow[];
  let series: AnalyticsEngineRow[];
  let links: AnalyticsEngineRow[];
  let countries: AnalyticsEngineRow[];
  let referrers: AnalyticsEngineRow[];
  let devices: AnalyticsEngineRow[];
  let browsers: AnalyticsEngineRow[];
  let campaigns: AnalyticsEngineRow[];

  try {
    [
      totals,
      series,
      links,
      countries,
      referrers,
      devices,
      browsers,
      campaigns,
    ] = await Promise.all([
      runQuery(env, totalsQuery),
      runQuery(env, seriesQuery),
      runQuery(env, linksQuery),
      runQuery(env, countriesQuery),
      runQuery(env, referrersQuery),
      runQuery(env, devicesQuery),
      runQuery(env, browsersQuery),
      runQuery(env, campaignsQuery),
    ]);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error(
      JSON.stringify({
        event: 'analytics_request_failed',
        message: errorMessage(error),
      }),
    );
    throw new ApiError(
      502,
      'analytics_unavailable',
      'Analytics Engine is temporarily unavailable.',
    );
  }

  return {
    range: {
      from: new Date(range.fromMs).toISOString(),
      to: new Date(range.toMs).toISOString(),
      bucketSeconds: range.bucketSeconds,
    },
    totals: {
      clicks: asNumber(totals[0]?.clicks),
    },
    series: series.map((row) => ({
      timestamp: new Date(asNumber(row.bucket) * 1000).toISOString(),
      clicks: asNumber(row.clicks),
    })),
    topLinks: links.map((row) => ({
      linkId: String(row.link_id ?? ''),
      code: String(row.code ?? ''),
      clicks: asNumber(row.clicks),
    })),
    topCountries: countries.map((row) => ({
      country: String(row.country ?? 'unknown'),
      clicks: asNumber(row.clicks),
    })),
    topReferrers: referrers.map((row) => ({
      referrer: String(row.referrer ?? 'direct'),
      clicks: asNumber(row.clicks),
    })),
    topDevices: devices.map((row) => ({
      device: String(row.device || 'unknown'),
      clicks: asNumber(row.clicks),
    })),
    topBrowsers: browsers.map((row) => ({
      browser: String(row.browser || 'unknown'),
      clicks: asNumber(row.clicks),
    })),
    topCampaigns: campaigns.map((row) => ({
      source: String(row.source || 'none'),
      medium: String(row.medium || 'none'),
      campaign: String(row.campaign || 'none'),
      clicks: asNumber(row.clicks),
    })),
    meta: {
      source: 'analytics_engine',
      sampled: true,
      retentionDays: 90,
    },
  };
}
