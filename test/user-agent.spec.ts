import { describe, expect, it } from 'vitest';
import { detectBrowser, detectDevice } from '../src/lib/user-agent';

describe('click dimension detection', () => {
  it('detects common devices and browsers', () => {
    expect(
      detectDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      ),
    ).toBe('mobile');
    expect(
      detectDevice(
        'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      ),
    ).toBe('tablet');
    expect(
      detectDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      ),
    ).toBe('desktop');
    expect(detectDevice('Googlebot/2.1')).toBe('bot');
    expect(detectBrowser('Mozilla/5.0 Chrome/140.0 Safari/537.36')).toBe(
      'chrome',
    );
    expect(detectBrowser('Mozilla/5.0 Firefox/130.0')).toBe('firefox');
    expect(detectBrowser('')).toBe('unknown');
  });
});
