const encoder = new TextEncoder();
const base64Alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const codeAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

export interface ParsedApiKey {
  prefix: string;
  token: string;
}

export interface GeneratedApiKey extends ParsedApiKey {
  hash: string;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(
    value.replaceAll('-', '+').replaceAll('_', '/') + padding,
  );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export function randomToken(byteLength: number): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function randomId(): string {
  return crypto.randomUUID();
}

export function randomCode(length = 8): string {
  if (length < 3 || length > 64) {
    throw new RangeError('Short code length must be between 3 and 64.');
  }

  const rejectionLimit = 256 - (256 % codeAlphabet.length);
  let code = '';

  while (code.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte >= rejectionLimit) {
        continue;
      }
      const character = codeAlphabet[byte % codeAlphabet.length];
      if (character !== undefined) {
        code += character;
      }
      if (code.length === length) {
        break;
      }
    }
  }

  return code;
}

export async function generateApiKey(): Promise<GeneratedApiKey> {
  const prefix = toHex(crypto.getRandomValues(new Uint8Array(5)));
  const secret = randomToken(24);
  const token = `lnk_${prefix}_${secret}`;

  return { prefix, token, hash: await hashApiKey(token) };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

export async function hashApiKey(token: string): Promise<string> {
  return sha256Hex(token);
}

export function parseApiKey(value: string): ParsedApiKey | null {
  const match = /^lnk_([a-f0-9]{10})_([A-Za-z0-9_-]{32})$/u.exec(value);
  const prefix = match?.[1];
  if (prefix === undefined) {
    return null;
  }
  return { prefix, token: value };
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |=
      (leftBytes[index % leftBytes.length] ?? 0) ^
      (rightBytes[index % rightBytes.length] ?? 0);
  }

  return difference === 0;
}
