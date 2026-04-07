import type { PageServerLoad } from './$types';
import { query } from '$lib/db';

export interface Filament {
  id: number;
  color: string;
  material: string;
  nickname: string | null;
  created_at: string;
}

export const load: PageServerLoad = async () => {
  try {
    const filaments = await query<Filament>(
      'SELECT id, color, material, nickname, created_at FROM filaments ORDER BY created_at ASC'
    );
    return { filaments };
  } catch {
    return { filaments: [] };
  }
};
