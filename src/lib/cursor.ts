import { ApiError } from './errors';

export interface LinkCursor {
  createdAt: number;
  id: string;
}

function base64UrlEncode(value: string): string {
  return btoa(value)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function base64UrlDecode(value: string): string {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  return atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding);
}

export function encodeLinkCursor(cursor: LinkCursor): string {
  return base64UrlEncode(`${cursor.createdAt}:${cursor.id}`);
}

export function decodeLinkCursor(value: string): LinkCursor {
  try {
    const decoded = base64UrlDecode(value);
    const separator = decoded.indexOf(':');
    if (separator <= 0) {
      throw new Error('Missing cursor separator.');
    }

    const createdAt = Number(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (
      !Number.isSafeInteger(createdAt) ||
      createdAt < 0 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        id,
      )
    ) {
      throw new Error('Invalid cursor contents.');
    }

    return { createdAt, id };
  } catch {
    throw new ApiError(
      422,
      'invalid_cursor',
      'The pagination cursor is invalid.',
    );
  }
}
