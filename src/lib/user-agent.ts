export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';

export function detectDevice(userAgent: string): DeviceType {
  if (userAgent.length === 0) {
    return 'unknown';
  }
  if (/(bot|crawler|spider|slurp|headless|preview)/iu.test(userAgent)) {
    return 'bot';
  }
  if (/(ipad|tablet|playbook|silk)|(android(?!.*mobile))/iu.test(userAgent)) {
    return 'tablet';
  }
  if (/(mobi|iphone|ipod|android)/iu.test(userAgent)) {
    return 'mobile';
  }
  if (/(windows|macintosh|linux|x11)/iu.test(userAgent)) {
    return 'desktop';
  }
  return 'unknown';
}

export function detectBrowser(userAgent: string): string {
  if (/(edg|edge)\//iu.test(userAgent)) {
    return 'edge';
  }
  if (/(opr|opera)\//iu.test(userAgent)) {
    return 'opera';
  }
  if (/firefox\//iu.test(userAgent)) {
    return 'firefox';
  }
  if (/chrome\//iu.test(userAgent)) {
    return 'chrome';
  }
  if (/safari\//iu.test(userAgent)) {
    return 'safari';
  }
  return userAgent.length === 0 ? 'unknown' : 'other';
}
