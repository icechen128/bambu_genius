import { describe, it, expect } from 'vitest';
import { extractModelId, parseMetaTags, parseJsonLd, buildModelUrl } from '../src/lib/makerworld';

describe('extractModelId', () => {
  it('extracts model id from standard makerworld url', () => {
    expect(extractModelId('https://makerworld.com.cn/models/376231?appSharePlatform=copy')).toBe('376231');
  });

  it('extracts model id from url without query params', () => {
    expect(extractModelId('https://makerworld.com/models/123456')).toBe('123456');
  });

  it('returns null for invalid url', () => {
    expect(extractModelId('https://example.com/foo')).toBeNull();
  });
});

describe('parseMetaTags', () => {
  it('extracts og:title from html', () => {
    const html = '<html><head><meta property="og:title" content="Cool Model"/></head></html>';
    const result = parseMetaTags(html);
    expect(result.model_name).toBe('Cool Model');
  });

  it('extracts og:image from html', () => {
    const html = '<html><head><meta property="og:image" content="https://img.example.com/thumb.jpg"/></head></html>';
    const result = parseMetaTags(html);
    expect(result.thumbnail_url).toBe('https://img.example.com/thumb.jpg');
  });

  it('returns null fields when meta tags are absent', () => {
    const result = parseMetaTags('<html><body></body></html>');
    expect(result.model_name).toBeNull();
    expect(result.thumbnail_url).toBeNull();
  });
});

describe('parseJsonLd', () => {
  it('extracts name from JSON-LD', () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Awesome Print"}</script>`;
    const result = parseJsonLd(html);
    expect(result.model_name).toBe('Awesome Print');
  });

  it('returns null fields when no JSON-LD present', () => {
    const result = parseJsonLd('<html><body></body></html>');
    expect(result.model_name).toBeNull();
  });
});

describe('buildModelUrl', () => {
  it('normalizes makerworld.com.cn url', () => {
    expect(buildModelUrl('376231')).toBe('https://makerworld.com/models/376231');
  });
});
