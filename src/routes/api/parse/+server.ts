import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseMakerWorldUrl, extractModelId } from '$lib/makerworld';

export const POST: RequestHandler = async ({ request }) => {
  let url: string;
  try {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== 'string' || !body.url) {
      return json({ error: '缺少 url 参数' }, { status: 400 });
    }
    url = body.url;
  } catch {
    return json({ error: '请求格式错误' }, { status: 400 });
  }

  const modelId = extractModelId(url);
  if (!modelId) {
    return json({ error: '无法识别 MakerWorld 链接格式' }, { status: 422 });
  }

  const parsed = await parseMakerWorldUrl(url);
  return json(parsed);
};
