import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import type { ParsedModel } from '$lib/makerworld';
import { extractModelId } from '$lib/makerworld';

interface PrintRequest extends ParsedModel {
  makerworld_url: string;
  note?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: PrintRequest;
  try {
    body = await request.json() as PrintRequest;
  } catch {
    return json({ error: '请求格式错误' }, { status: 400 });
  }

  const {
    makerworld_url,
    model_name,
    model_id,
    thumbnail_url,
    designer_name,
    designer_avatar_url,
    filament_grams,
    colors,
    print_time_minutes,
    tags,
    raw_meta,
    note,
    instance_id,
    instance_title
  } = body;

  if (!makerworld_url) {
    return json({ error: '缺少 makerworld_url' }, { status: 400 });
  }

  if (!extractModelId(makerworld_url)) {
    return json({ error: '无效的 MakerWorld 链接' }, { status: 422 });
  }

  if (filament_grams == null || isNaN(Number(filament_grams))) {
    return json({ error: '耗材克数不能为空，请手动填写' }, { status: 400 });
  }

  try {
    await query(
      `INSERT INTO print_records
        (makerworld_url, model_name, model_id, thumbnail_url, designer_name,
         designer_avatar_url, filament_grams, colors, print_time_minutes, tags,
         raw_meta, note, instance_id, instance_title)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        makerworld_url,
        model_name ?? null,
        model_id ?? null,
        thumbnail_url ?? null,
        designer_name ?? null,
        designer_avatar_url ?? null,
        filament_grams,
        colors ?? null,
        print_time_minutes ?? null,
        tags ?? null,
        raw_meta ? JSON.stringify(raw_meta) : null,
        note ?? null,
        instance_id != null ? String(instance_id) : null,
        instance_title ?? null
      ]
    );
  } catch (err) {
    console.error('[print] DB error:', err);
    return json({ error: '服务器内部错误' }, { status: 500 });
  }

  return json({ ok: true });
};
