/**
 * Bambu Lab 账号认证模块
 * 用于获取 access token，以便绕过 makerworld.com.cn 的 Cloudflare 保护
 *
 * 可选环境变量：BAMBU_USERNAME, BAMBU_PASSWORD
 * 未配置时，.com.cn API 调用将无认证，可能被 Cloudflare 拦截。
 */

interface BambuTokenCache {
  token: string;
  expiresAt: number; // ms timestamp
}

let _cache: BambuTokenCache | null = null;

interface BambuLoginResponse {
  accessToken?: string;
  token?: string;
  expiresIn?: number;
  code?: number;
  error?: string;
}

const AUTH_ENDPOINTS = [
  'https://api.bambulab.com.cn/v1/user-service/user/login',
  'https://api.bambulab.com/v1/user-service/user/login'
];

async function fetchToken(username: string, password: string): Promise<string | null> {
  for (const endpoint of AUTH_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: username, password, apiError: '' }),
        signal: AbortSignal.timeout(8000)
      });

      const data = await res.json() as BambuLoginResponse;

      if (!res.ok || data.code !== undefined) {
        console.warn(`[bambu-auth] ${endpoint} failed: ${data.error ?? res.status}`);
        continue;
      }

      const token = data.accessToken ?? data.token ?? null;
      if (token) {
        console.log(`[bambu-auth] Authenticated via ${new URL(endpoint).hostname}`);
        return token;
      }
    } catch (err) {
      console.warn(`[bambu-auth] ${endpoint} error:`, err);
    }
  }
  return null;
}

/**
 * 获取 Bambu access token（带内存缓存，过期前 5 分钟自动刷新）
 * 未配置 BAMBU_USERNAME/BAMBU_PASSWORD 时返回 null
 */
export async function getBambuToken(): Promise<string | null> {
  const username = process.env.BAMBU_USERNAME;
  const password = process.env.BAMBU_PASSWORD;
  if (!username || !password) return null;

  const now = Date.now();
  if (_cache && _cache.expiresAt > now + 5 * 60 * 1000) {
    return _cache.token;
  }

  const token = await fetchToken(username, password);
  if (!token) return null;

  // expiresIn 通常为 7776000 秒（90天），保守缓存 80 天
  const expiresAt = now + 80 * 24 * 60 * 60 * 1000;
  _cache = { token, expiresAt };
  return token;
}
