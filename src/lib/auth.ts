// src/lib/auth.ts

import { timingSafeEqual } from 'crypto';

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/** 验证管理员密码是否正确 */
export function checkPassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(adminPassword);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 创建新的管理员 session，返回 token */
export async function createSession(): Promise<string> {
  const { query } = await import('./db');
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await query(
    'INSERT INTO admin_sessions (token, expires_at) VALUES ($1, $2)',
    [token, expiresAt]
  );
  return token;
}

/** 验证 token 是否有效（存在且未过期），返回 boolean */
export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { queryOne } = await import('./db');
  const row = await queryOne<{ token: string }>(
    'SELECT token FROM admin_sessions WHERE token = $1 AND expires_at > NOW()',
    [token]
  );
  return row !== null;
}

/** 删除 session（注销） */
export async function deleteSession(token: string): Promise<void> {
  const { query } = await import('./db');
  await query('DELETE FROM admin_sessions WHERE token = $1', [token]);
}

/** 从 cookie 字符串中提取 session token */
export function extractTokenFromCookie(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : undefined;
}
