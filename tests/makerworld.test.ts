import { describe, it, expect } from 'vitest';
import { extractModelId, extractDomain, buildModelUrl, buildApiUrl } from '../src/lib/makerworld';

describe('extractModelId', () => {
  it('extracts model id from makerworld.com.cn url with query params', () => {
    expect(extractModelId('https://makerworld.com.cn/models/376231?appSharePlatform=copy')).toBe('376231');
  });

  it('extracts model id from makerworld.com url without query params', () => {
    expect(extractModelId('https://makerworld.com/models/123456')).toBe('123456');
  });

  it('returns null for non-makerworld url', () => {
    expect(extractModelId('https://example.com/foo')).toBeNull();
  });
});

describe('extractDomain', () => {
  it('returns makerworld.com.cn for cn urls', () => {
    expect(extractDomain('https://makerworld.com.cn/models/376231?appSharePlatform=copy')).toBe('makerworld.com.cn');
  });

  it('returns makerworld.com for international urls', () => {
    expect(extractDomain('https://makerworld.com/models/123456')).toBe('makerworld.com');
  });
});

describe('buildModelUrl', () => {
  it('builds canonical makerworld.com url', () => {
    expect(buildModelUrl('376231')).toBe('https://makerworld.com/models/376231');
  });

  it('builds makerworld.com.cn url', () => {
    expect(buildModelUrl('376231', 'makerworld.com.cn')).toBe('https://makerworld.com.cn/models/376231');
  });
});

describe('buildApiUrl', () => {
  it('builds makerworld.com API url', () => {
    expect(buildApiUrl('376231')).toBe(
      'https://makerworld.com/api/v1/design-service/design/376231'
    );
  });

  it('builds makerworld.com.cn API url', () => {
    expect(buildApiUrl('376231', 'makerworld.com.cn')).toBe(
      'https://makerworld.com.cn/api/v1/design-service/design/376231'
    );
  });
});
