import pg from 'pg';

const { Pool } = pg;

// 懒初始化连接池：在构建时不需要 DATABASE_URL，仅在运行时首次查询时创建
let _pool: InstanceType<typeof Pool> | null = null;

function getPool(): InstanceType<typeof Pool> {
  if (_pool) return _pool;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });
  _pool.on('error', (err) => {
    console.error('Unexpected error on idle pg client', err);
  });
  return _pool;
}

/**
 * 执行 SQL 查询，返回结果行数组
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/**
 * 执行 SQL 查询，返回第一行或 null
 */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
