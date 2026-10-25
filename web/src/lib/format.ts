export function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function formatDate(value: string | null, withTime = false): string {
  if (value === null) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

export function percent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

export function roleLabel(role: string): string {
  switch (role) {
    case 'owner':
      return '所有者';
    case 'editor':
      return '编辑者';
    case 'viewer':
      return '只读';
    default:
      return role;
  }
}

export function deviceLabel(device: string): string {
  switch (device) {
    case 'desktop':
      return '桌面端';
    case 'mobile':
      return '手机';
    case 'tablet':
      return '平板';
    case 'bot':
      return '机器人';
    default:
      return '未知';
  }
}

export function browserLabel(browser: string): string {
  switch (browser) {
    case 'chrome':
      return 'Chrome';
    case 'safari':
      return 'Safari';
    case 'firefox':
      return 'Firefox';
    case 'edge':
      return 'Edge';
    case 'opera':
      return 'Opera';
    case 'other':
      return '其他';
    default:
      return '未知';
  }
}

export function countryLabel(country: string): string {
  if (country === 'unknown' || country.length === 0) {
    return '未知';
  }
  try {
    return (
      new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(country) ??
      country
    );
  } catch {
    return country;
  }
}
