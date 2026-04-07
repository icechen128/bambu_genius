import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import { verifySession, extractTokenFromCookie } from '$lib/auth';

export const POST: RequestHandler = async ({ request }) => {
  const token = extractTokenFromCookie(request.headers.get('cookie'));
  if (!await verifySession(token)) {
    return json({ error: '需要管理员权限' }, { status: 401 });
  }

  let delta: number;
  let reason: string | undefined;
  try {
    const body = await request.json() as { delta?: unknown; reason?: unknown };
    delta = Number(body.delta);
    reason = typeof body.reason === 'string' ? body.reason : undefined;
    if (isNaN(delta) || delta === 0) {
      return json({ error: 'delta 必须为非零数字' }, { status: 400 });
    }
  } catch {
    return json({ error: '请求格式错误' }, { status: 400 });
  }

  try {
    await query(
      'INSERT INTO quota_records (delta, reason) VALUES ($1, $2)',
      [delta, reason ?? null]
    );
  } catch (err) {
    console.error('[quota] DB error:', err);
    return json({ error: '服务器内部错误' }, { status: 500 });
  }

  return json({ ok: true });
};
