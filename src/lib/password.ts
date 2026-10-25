import { base64UrlDecode, base64UrlEncode, constantTimeEqual } from './crypto';

const algorithm = 'PBKDF2';
const digest = 'SHA-256';
// Deployed Workers reject PBKDF2 above 100,000 iterations; local workerd does not.
export const iterations = 100_000;
const saltLength = 16;
const keyLength = 32;
const encoder = new TextEncoder();

async function derivePassword(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  rounds: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    algorithm,
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: algorithm,
      hash: digest,
      salt,
      iterations: rounds,
    },
    key,
    keyLength * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(saltLength));
  const derived = await derivePassword(password, salt, iterations);
  return [
    'pbkdf2-sha256',
    String(iterations),
    base64UrlEncode(salt),
    base64UrlEncode(derived),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [scheme, rawRounds, rawSalt, rawHash] = encodedHash.split('$');
  if (
    scheme !== 'pbkdf2-sha256' ||
    rawRounds === undefined ||
    rawSalt === undefined ||
    rawHash === undefined
  ) {
    return false;
  }

  const rounds = Number(rawRounds);
  if (!Number.isSafeInteger(rounds) || rounds < 100_000) {
    return false;
  }

  try {
    const salt = base64UrlDecode(rawSalt);
    const expected = base64UrlDecode(rawHash);
    const actual = await derivePassword(password, salt, rounds);
    if (expected.byteLength !== actual.byteLength) {
      return false;
    }
    return constantTimeEqual(
      base64UrlEncode(expected),
      base64UrlEncode(actual),
    );
  } catch {
    return false;
  }
}

export async function burnPasswordCheck(password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(saltLength));
  await derivePassword(password, salt, iterations);
}
