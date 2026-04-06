// src/lib/makerworld.ts

export interface ParsedModel {
  model_id: string | null;
  model_name: string | null;
  thumbnail_url: string | null;
  designer_name: string | null;
  designer_avatar_url: string | null;
  filament_grams: number | null;
  colors: string[] | null;
  print_time_minutes: number | null;
  tags: string[] | null;
  raw_meta: Record<string, unknown> | null;
}

/** 从 MakerWorld URL 提取模型 ID */
export function extractModelId(url: string): string | null {
  const match = url.match(/makerworld(?:\.com\.cn|\.com)\/models\/(\d+)/);
  return match ? match[1] : null;
}

/** 构造 makerworld.com 规范 URL */
export function buildModelUrl(modelId: string): string {
  return `https://makerworld.com/models/${modelId}`;
}

/** 从 HTML 提取 <meta property="og:*"> 标签 */
export function parseMetaTags(html: string): Pick<ParsedModel, 'model_name' | 'thumbnail_url'> {
  const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
  const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
  return { model_name: title, thumbnail_url: image };
}

/** 从 HTML 提取 JSON-LD 数据 */
export function parseJsonLd(html: string): Pick<ParsedModel, 'model_name'> {
  const scriptMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return { model_name: null };

  try {
    const data = JSON.parse(scriptMatch[1]) as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name : null;
    return { model_name: name };
  } catch {
    return { model_name: null };
  }
}

/**
 * 主解析函数：fetch MakerWorld 页面并提取所有可用信息
 * 在服务端调用，避免 CORS 问题
 */
export async function parseMakerWorldUrl(url: string): Promise<ParsedModel> {
  const modelId = extractModelId(url);
  const base: ParsedModel = {
    model_id: modelId,
    model_name: null,
    thumbnail_url: null,
    designer_name: null,
    designer_avatar_url: null,
    filament_grams: null,
    colors: null,
    print_time_minutes: null,
    tags: null,
    raw_meta: null
  };

  if (!modelId) return base;

  let html: string;
  try {
    const fetchUrl = buildModelUrl(modelId);
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BambuGenius/1.0)',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return base;
    html = await res.text();
  } catch {
    return base;
  }

  // 优先级 1: JSON-LD
  const jsonLd = parseJsonLd(html);

  // 优先级 2: og meta 标签
  const meta = parseMetaTags(html);

  // 合并：JSON-LD 优先，meta 兜底
  const model_name = jsonLd.model_name ?? meta.model_name;
  const thumbnail_url = meta.thumbnail_url;

  const raw_meta: Record<string, unknown> = {};

  // 提取耗材克数（格式通常为 "xxg" 或数字）
  const filamentMatch = html.match(/["']filament_weight["']\s*:\s*([\d.]+)/i)
    ?? html.match(/([\d.]+)\s*g\s*(?:耗材|filament)/i);
  const filament_grams = filamentMatch ? parseFloat(filamentMatch[1]) : null;

  // 提取预计打印时长（分钟）
  const timeMatch = html.match(/["']print_time["']\s*:\s*(\d+)/i);
  const print_time_minutes = timeMatch ? parseInt(timeMatch[1], 10) : null;

  // 提取颜色
  const colorMatches = html.match(/["']color["']\s*:\s*["']([^"']+)["']/gi);
  const colors = colorMatches
    ? colorMatches.map(m => m.replace(/["']color["']\s*:\s*["']/, '').replace(/["']$/, ''))
    : null;

  if (filament_grams !== null) raw_meta.filament_grams_source = 'page_regex';
  if (colors) raw_meta.colors_source = 'page_regex';

  return {
    ...base,
    model_name,
    thumbnail_url,
    filament_grams,
    colors: colors && colors.length > 0 ? colors : null,
    print_time_minutes,
    raw_meta: Object.keys(raw_meta).length > 0 ? raw_meta : null
  };
}
