// tests/auth.test.ts
import { describe, it, expect } from 'vitest';
import { checkPassword, SESSION_DURATION_MS, extractTokenFromCookie } from '../src/lib/auth';

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

describe('extractTokenFromCookie', () => {
  it('returns undefined for null input', () => {
    expect(extractTokenFromCookie(null)).toBeUndefined();
  });

  it('extracts token when session is the only cookie', () => {
    expect(extractTokenFromCookie('session=abc-123')).toBe('abc-123');
  });

  it('extracts token when session is among multiple cookies', () => {
    expect(extractTokenFromCookie('foo=bar; session=abc-123; other=val')).toBe('abc-123');
  });

  it('returns undefined when no session cookie', () => {
    expect(extractTokenFromCookie('foo=bar; other=val')).toBeUndefined();
  });
});
