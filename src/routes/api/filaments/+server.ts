import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';

export interface Filament {
  id: number;
  color: string;
  material: string;
  nickname: string | null;
  created_at: string;
}

export const GET: RequestHandler = async () => {
  try {
    const rows = await query<Filament>(
      'SELECT id, color, material, nickname, created_at FROM filaments ORDER BY created_at ASC'
    );
    return json(rows);
  } catch (err) {
    console.error('[filaments] GET error:', err);
    return json({ error: '服务器内部错误' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  let body: { color?: string; material?: string; nickname?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, { status: 400 });
  }

  const { color, material, nickname } = body;
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return json({ error: '请提供有效的十六进制颜色（如 #FF0000）' }, { status: 400 });
  }
  if (!material?.trim()) {
    return json({ error: '请选择材质' }, { status: 400 });
  }

  try {
    const rows = await query<Filament>(
      'INSERT INTO filaments (color, material, nickname) VALUES ($1, $2, $3) RETURNING *',
      [color, material.trim(), nickname?.trim() || null]
    );
    return json(rows[0], { status: 201 });
  } catch (err) {
    console.error('[filaments] POST error:', err);
    return json({ error: '服务器内部错误' }, { status: 500 });
  }
};
