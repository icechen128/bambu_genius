import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';

const PAGE_SIZE = 20;

export const GET: RequestHandler = async ({ url }) => {
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let records: unknown[];
  try {
    records = await query(
      `SELECT id, makerworld_url, model_name, model_id, thumbnail_url,
              designer_name, filament_grams, colors, print_time_minutes,
              note, created_at
       FROM print_records
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [PAGE_SIZE, offset]
    );
  } catch (err) {
    console.error('[records] DB error:', err);
    return json({ error: '服务器内部错误' }, { status: 500 });
  }

  return json({
    records,
    hasMore: records.length === PAGE_SIZE
  });
};
