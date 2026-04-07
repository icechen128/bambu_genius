import type { PageServerLoad } from './$types';
import { query } from '$lib/db';

export interface Filament {
  id: number;
  color: string;
  material: string;
  nickname: string | null;
  created_at: string;
  total_grams: number;
  print_count: number;
}

export const load: PageServerLoad = async () => {
  try {
    const filaments = await query<Filament>(`
      SELECT
        f.id,
        f.color,
        f.material,
        f.nickname,
        f.created_at,
        COALESCE(SUM((u.item->>'grams')::numeric), 0)::float AS total_grams,
        COUNT(DISTINCT pr.id) FILTER (WHERE u.item IS NOT NULL)::int AS print_count
      FROM filaments f
      LEFT JOIN print_records pr ON pr.filament_usage IS NOT NULL
      LEFT JOIN LATERAL jsonb_array_elements(pr.filament_usage) AS u(item)
        ON (u.item->>'filament_id') IS NOT NULL
        AND (u.item->>'filament_id')::int = f.id
      GROUP BY f.id, f.color, f.material, f.nickname, f.created_at
      ORDER BY f.created_at ASC
    `);
    return { filaments };
  } catch {
    return { filaments: [] };
  }
};
