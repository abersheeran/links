export function nowMs(): number {
  return Date.now();
}

export function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

export function parseIsoToMs(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
