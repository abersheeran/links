import type { Permission, UserRole } from '../../../shared/permissions';

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  primaryHostname: string | null;
}

export interface SessionData {
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: 'active' | 'disabled';
  };
  tenant: TenantSummary;
  permissions: Permission[];
  csrfToken: string;
  expiresAt: string | null;
}

export interface LinkItem {
  id: string;
  code: string;
  shortUrl: string | null;
  targetUrl: string;
  title: string | null;
  description: string | null;
  tags: string[];
  status: 'active' | 'disabled';
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LinkListResponse {
  data: LinkItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    total: number;
  };
}

export interface AnalyticsData {
  range: {
    from: string;
    to: string;
    bucketSeconds: number;
  };
  totals: {
    clicks: number;
  };
  series: Array<{
    timestamp: string;
    clicks: number;
  }>;
  topLinks: Array<{
    linkId: string;
    code: string;
    clicks: number;
  }>;
  topCountries: Array<{
    country: string;
    clicks: number;
  }>;
  topReferrers: Array<{
    referrer: string;
    clicks: number;
  }>;
  topDevices: Array<{
    device: string;
    clicks: number;
  }>;
  topBrowsers: Array<{
    browser: string;
    clicks: number;
  }>;
  topCampaigns: Array<{
    source: string;
    medium: string;
    campaign: string;
    clicks: number;
  }>;
  meta: {
    source: string;
    sampled: boolean;
    retentionDays: number;
  };
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  current: boolean;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  current: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
