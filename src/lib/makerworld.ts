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

/** 构造 MakerWorld 页面 URL */
export function buildModelUrl(modelId: string, domain = 'makerworld.com'): string {
  return `https://${domain}/models/${modelId}`;
}

/** 构造 MakerWorld API URL（根据域名选对应站点） */
export function buildApiUrl(modelId: string, domain = 'makerworld.com'): string {
  return `https://${domain}/api/v1/design-service/design/${modelId}`;
}

interface MakerWorldFilament {
  type: string;
  color: string;
  usedM: string;
  usedG: string;
}

interface MakerWorldInstance {
  id: number;
  weight: number;
  prediction: number;
  instanceFilaments: MakerWorldFilament[];
}

interface MakerWorldApiResponse {
  id: number;
  title: string;
  coverUrl: string;
  tags: string[];
  defaultInstanceId: number;
  instances: MakerWorldInstance[];
  designCreator: {
    name: string;
    avatar: string;
  };
}

/**
 * 主解析函数：调用 MakerWorld API 获取模型元数据
 * 在服务端调用，避免 CORS 问题
 */
/** 从 URL 提取域名（makerworld.com 或 makerworld.com.cn） */
export function extractDomain(url: string): string {
  return url.includes('makerworld.com.cn') ? 'makerworld.com.cn' : 'makerworld.com';
}

/**
 * 主解析函数：调用 MakerWorld API 获取模型元数据
 * 在服务端调用，避免 CORS 问题
 */
export async function parseMakerWorldUrl(url: string): Promise<ParsedModel> {
  const modelId = extractModelId(url);
  const domain = extractDomain(url);
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

  let data: MakerWorldApiResponse;
  try {
    if (domain === 'makerworld.com.cn') {
      // .com.cn 受 Cloudflare 保护，用无头浏览器加载页面，从 __NEXT_DATA__ 提取数据
      const { fetchModelViaNextData } = await import('./browser-fetch');
      const pageUrl = buildModelUrl(modelId, domain);
      const raw = await fetchModelViaNextData(pageUrl);
      if (!raw) {
        console.error(`[makerworld] Browser fetch returned nothing for model ${modelId}`);
        return base;
      }
      data = raw as unknown as MakerWorldApiResponse;
    } else {
      // .com 直接调 API，无 Cloudflare 拦截
      const res = await fetch(buildApiUrl(modelId, domain), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BambuGenius/1.0)',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) {
        console.error(`[makerworld] API returned ${res.status} for model ${modelId}`);
        return base;
      }
      data = await res.json() as MakerWorldApiResponse;
    }
  } catch (err) {
    console.error(`[makerworld] Failed to fetch model ${modelId}:`, err);
    return base;
  }

  // 优先使用 defaultInstanceId 对应的实例，兜底取第一个
  const defaultInstance =
    data.instances?.find(i => i.id === data.defaultInstanceId)
    ?? data.instances?.[0]
    ?? null;

  const filament_grams = defaultInstance?.weight ? Number(defaultInstance.weight) : null;
  const print_time_minutes = defaultInstance?.prediction
    ? Math.round(defaultInstance.prediction / 60)
    : null;
  const colors =
    defaultInstance?.instanceFilaments?.map(f => f.color).filter(Boolean) ?? null;

  return {
    model_id: String(data.id),
    model_name: data.title ?? null,
    thumbnail_url: data.coverUrl ?? null,
    designer_name: data.designCreator?.name ?? null,
    designer_avatar_url: data.designCreator?.avatar ?? null,
    filament_grams,
    colors: colors && colors.length > 0 ? colors : null,
    print_time_minutes,
    tags: data.tags && data.tags.length > 0 ? data.tags : null,
    raw_meta: data as unknown as Record<string, unknown>
  };
}
