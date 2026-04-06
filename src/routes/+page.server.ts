import type { PageServerLoad } from './$types';
import { query, queryOne } from '$lib/db';
import { verifySession, extractTokenFromCookie } from '$lib/auth';

const PAGE_SIZE = 20;

interface PrintRecord {
  id: number;
  makerworld_url: string;
  model_name: string | null;
  model_id: string | null;
  thumbnail_url: string | null;
  designer_name: string | null;
  filament_grams: string;
  colors: string[] | null;
  print_time_minutes: number | null;
  note: string | null;
  created_at: string;
}

interface QuotaSummary {
  total_added: string;
  total_printed: string;
  remaining: string;
}

export const load: PageServerLoad = async ({ request, url }) => {
  const token = extractTokenFromCookie(request.headers.get('cookie'));
  const isAdmin = await verifySession(token);

  // 计算剩余额度
  const quotaSummary = await queryOne<QuotaSummary>(`
    SELECT
      COALESCE((SELECT SUM(delta) FROM quota_records), 0)::text AS total_added,
      COALESCE((SELECT SUM(filament_grams) FROM print_records), 0)::text AS total_printed,
      (
        COALESCE((SELECT SUM(delta) FROM quota_records), 0) -
        COALESCE((SELECT SUM(filament_grams) FROM print_records), 0)
      )::text AS remaining
  `);

  // 分页参数
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const offset = (page - 1) * PAGE_SIZE;

  // 打印历史（倒序）
  const printRecords = await query<PrintRecord>(`
    SELECT id, makerworld_url, model_name, model_id, thumbnail_url,
           designer_name, filament_grams, colors, print_time_minutes,
           note, created_at
    FROM print_records
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
  `, [PAGE_SIZE, offset]);

  // 额度变更日志（仅管理员加载）
  const quotaRecords = isAdmin
    ? await query<{ id: number; delta: string; reason: string | null; created_at: string }>(
        'SELECT id, delta, reason, created_at FROM quota_records ORDER BY created_at DESC LIMIT 50'
      )
    : [];

  return {
    isAdmin,
    remaining: parseFloat(quotaSummary?.remaining ?? '0'),
    totalAdded: parseFloat(quotaSummary?.total_added ?? '0'),
    totalPrinted: parseFloat(quotaSummary?.total_printed ?? '0'),
    printRecords,
    quotaRecords,
    page,
    hasMore: printRecords.length === PAGE_SIZE
  };
};
