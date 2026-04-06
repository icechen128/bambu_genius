// tests/auth.test.ts
import { describe, it, expect } from 'vitest';
import { checkPassword, SESSION_DURATION_MS } from '../src/lib/auth';

describe('checkPassword', () => {
  it('returns true when password matches env var', () => {
    process.env.ADMIN_PASSWORD = 'secret123';
    expect(checkPassword('secret123')).toBe(true);
  });

  it('returns false when password does not match', () => {
    process.env.ADMIN_PASSWORD = 'secret123';
    expect(checkPassword('wrong')).toBe(false);
  });

  it('returns false when ADMIN_PASSWORD is not set', () => {
    delete process.env.ADMIN_PASSWORD;
    expect(checkPassword('')).toBe(false);
  });
});

describe('SESSION_DURATION_MS', () => {
  it('is 7 days in milliseconds', () => {
    expect(SESSION_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
