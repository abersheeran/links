import { describe, expect, it } from 'vitest';
import { hashPassword, iterations, verifyPassword } from '../src/lib/password';

describe('password hashing', () => {
  // Local workerd does not enforce the production PBKDF2 cap, so pin it here.
  it('stays within the deployed Workers PBKDF2 iteration limit', async () => {
    expect(iterations).toBeLessThanOrEqual(100_000);

    const encoded = await hashPassword('correct horse battery staple');
    expect(encoded.split('$')[1]).toBe(String(iterations));
    await expect(
      verifyPassword('correct horse battery staple', encoded),
    ).resolves.toBe(true);
    await expect(verifyPassword('wrong password!!', encoded)).resolves.toBe(
      false,
    );
  });
});
