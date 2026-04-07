/** 单个打印配置（一个模型可能有多个） */
export interface ParsedInstance {
  id: number;
  title: string;
  filament_grams: number;
  print_time_minutes: number;
  colors: string[];
}

export interface ParsedModel {
  model_id: string | null;
  model_name: string | null;
  thumbnail_url: string | null;
  designer_name: string | null;
  designer_avatar_url: string | null;
  /** 由前端根据所选配置填入 */
  filament_grams: number | null;
  colors: string[] | null;
  print_time_minutes: number | null;
  tags: string[] | null;
  raw_meta: Record<string, unknown> | null;
  /** 所有可选打印配置；单配置时也包含，方便前端统一处理 */
  instances: ParsedInstance[] | null;
  /** 默认选中的配置 ID */
  default_instance_id: number | null;
  /** 当前选中的配置 ID（前端写入后提交） */
  instance_id: number | null;
  instance_title: string | null;
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
  designExtension?: {
    design_pictures?: Array<{ url: string; isRealLifePhoto: number }>;
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

  if (!modelId) return {
    ...base,
    instances: null,
    default_instance_id: null,
    instance_id: null,
    instance_title: null
  };

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

  // 将所有打印配置整理为统一结构
  const instances: ParsedInstance[] = (data.instances ?? []).map(inst => ({
    id: inst.id,
    title: inst.title || `配置 ${inst.id}`,
    filament_grams: Number(inst.weight) || 0,
    print_time_minutes: inst.prediction ? Math.round(inst.prediction / 60) : 0,
    colors: inst.instanceFilaments?.map(f => f.color).filter(Boolean) ?? []
  }));

  // 默认选中 defaultInstanceId，兜底取第一个
  const defaultInst =
    instances.find(i => i.id === data.defaultInstanceId) ?? instances[0] ?? null;

  return {
    // 优先取 design_pictures 里第一张非实拍图，兜底用 coverUrl
    model_id: String(data.id),
    model_name: data.title ?? null,
    thumbnail_url: (
      data.designExtension?.design_pictures?.find(p => p.isRealLifePhoto === 0)?.url
      ?? data.designExtension?.design_pictures?.[0]?.url
      ?? data.coverUrl
      ?? null
    ),
    designer_name: data.designCreator?.name ?? null,
    designer_avatar_url: data.designCreator?.avatar ?? null,
    // 默认用 defaultInstance 的值；前端选择后会覆盖
    filament_grams: defaultInst?.filament_grams ?? null,
    colors: defaultInst?.colors?.length ? defaultInst.colors : null,
    print_time_minutes: defaultInst?.print_time_minutes ?? null,
    tags: data.tags && data.tags.length > 0 ? data.tags : null,
    raw_meta: data as unknown as Record<string, unknown>,
    instances: instances.length > 0 ? instances : null,
    default_instance_id: data.defaultInstanceId ?? null,
    instance_id: defaultInst?.id ?? null,
    instance_title: defaultInst?.title ?? null
  };
}
