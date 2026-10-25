const reservedCodes = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'dashboard',
  'docs',
  'favicon.ico',
  'favicon.svg',
  'health',
  'healthz',
  'login',
  'openapi',
  'robots.txt',
  'signup',
]);

export function normalizeHttpUrl(value: string): string | null {
  if (value.length > 2048) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (url.username !== '' || url.password !== '') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeHostname(value: string): string | null {
  const hostname = value.trim().toLowerCase().replace(/\.$/u, '');
  if (hostname.length === 0 || hostname.length > 253) {
    return null;
  }

  const localhostMatch = /^(localhost)(?::(\d{1,5}))?$/u.exec(hostname);
  if (localhostMatch !== null) {
    const port = localhostMatch[2];
    if (port === undefined) {
      return 'localhost';
    }
    const portNumber = Number(port);
    return portNumber >= 1 && portNumber <= 65_535 ? hostname : null;
  }

  try {
    const parsed = new URL(`http://${hostname}`);
    if (
      parsed.hostname !== hostname ||
      parsed.port !== '' ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

export function isValidCode(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 64 &&
    /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/u.test(value)
  );
}

export function isReservedCode(value: string): boolean {
  return reservedCodes.has(value.toLowerCase());
}

export function mergeQuery(target: string, incoming: URL): string {
  if (incoming.search.length === 0) {
    return target;
  }

  const destination = new URL(target);
  incoming.searchParams.forEach((value, key) => {
    destination.searchParams.append(key, value);
  });
  return destination.toString();
}

export function referrerHostname(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    return 'direct';
  }

  try {
    return new URL(value).hostname.toLowerCase().slice(0, 253);
  } catch {
    return 'invalid';
  }
}

export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    /^localhost:\d{1,5}$/u.test(hostname) ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

export function buildShortUrl(
  hostname: string | null,
  code: string,
  scheme: string,
): string | null {
  if (hostname === null || hostname.length === 0) {
    return null;
  }

  const resolvedScheme =
    scheme === 'http' || isLocalHostname(hostname) ? 'http' : 'https';
  return `${resolvedScheme}://${hostname}/${code}`;
}

export function escapeLike(value: string): string {
  return value
    .replaceAll('!', '!!')
    .replaceAll('%', '!%')
    .replaceAll('_', '!_');
}
