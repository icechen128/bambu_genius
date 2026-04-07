import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';

export const DELETE: RequestHandler = async ({ params }) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return json({ error: '无效 ID' }, { status: 400 });

  try {
    await query('DELETE FROM filaments WHERE id = $1', [id]);
    return json({ ok: true });
  } catch (err) {
    console.error('[filaments] DELETE error:', err);
    return json({ error: '服务器内部错误' }, { status: 500 });
  }
};
