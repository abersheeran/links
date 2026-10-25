import { errorMessage } from './errors';

export type ClickOutcome = 'redirect' | 'expired' | 'disabled' | 'not_found';

export interface ClickEvent {
  analytics: AnalyticsEngineDataset;
  tenantId: string;
  linkId: string;
  code: string;
  hostname: string;
  country: string;
  referrer: string;
  userAgent: string;
  outcome: ClickOutcome;
  durationMs: number;
  device: string;
  browser: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

export function recordClick(event: ClickEvent): void {
  try {
    event.analytics.writeDataPoint({
      blobs: [
        event.tenantId,
        event.linkId,
        event.code,
        event.hostname,
        event.country,
        event.referrer,
        event.userAgent.slice(0, 256),
        event.outcome,
        event.device,
        event.browser,
        event.utmSource,
        event.utmMedium,
        event.utmCampaign,
      ],
      doubles: [1, event.durationMs],
      indexes: [event.tenantId],
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'analytics_write_failed',
        outcome: event.outcome,
        message: errorMessage(error),
      }),
    );
  }
}
