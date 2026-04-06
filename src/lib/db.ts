import pg from 'pg';

const { Pool } = pg;

// 验证 DATABASE_URL 环境变量
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// 单例连接池，整个进程复用
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// 添加池错误处理器，防止 Node.js 在空闲客户端出错时崩溃
pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err);
});

/**
 * 执行 SQL 查询，返回结果行数组
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params);
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
