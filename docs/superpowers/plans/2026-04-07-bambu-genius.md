# Bambu Genius Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 SvelteKit 全栈网页应用，让小孩自助提交 MakerWorld 打印链接，自动解析并扣除耗材额度，家长通过管理员面板手动增减额度。

**Architecture:** SvelteKit（Node adapter）提供前端页面和 API 路由，服务端直接使用 `pg` 连接 PostgreSQL，MakerWorld 页面解析在服务端执行以规避 CORS 问题，管理员会话通过 HttpOnly cookie + 数据库 token 验证。

**Tech Stack:** SvelteKit 2 + TypeScript, Tailwind CSS v4, node-postgres (`pg`), PostgreSQL 16, Docker Compose, Vitest

---

## 文件结构总览

```
bambu_genius/
├── src/
│   ├── app.d.ts                              # SvelteKit 全局类型扩展
│   ├── app.html                              # HTML 模板
│   ├── lib/
│   │   ├── db.ts                             # pg 连接池 + query 工具
│   │   ├── auth.ts                           # session 验证 / 创建 / 删除
│   │   └── makerworld.ts                     # MakerWorld 页面解析逻辑
│   └── routes/
│       ├── +page.svelte                      # 首页（主 UI）
│       ├── +page.server.ts                   # 服务端数据加载（额度 + 历史）
│       └── api/
│           ├── parse/+server.ts              # POST /api/parse
│           ├── print/+server.ts              # POST /api/print
│           ├── quota/+server.ts              # POST /api/quota（需 session）
│           └── auth/
│               ├── login/+server.ts          # POST /api/auth/login
│               └── logout/+server.ts         # POST /api/auth/logout（需 session）
├── tests/
│   ├── makerworld.test.ts                    # makerworld.ts 单元测试
│   └── auth.test.ts                          # auth.ts 单元测试
├── init.sql                                  # 数据库建表脚本（幂等）
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

---

## Task 1: 初始化 SvelteKit 项目

**Files:**
- Create: `package.json`
- Create: `svelte.config.js`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/app.html`
- Create: `src/app.d.ts`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: 创建 SvelteKit 项目**

在 `/Users/ice/work/bambu/bambu_genius` 目录下执行：

```bash
npx sv create . --template minimal --types ts --no-add-ons
```

选择：
- Template: `minimal`
- Type checking: `TypeScript`
- 其余默认即可

- [ ] **Step 2: 安装依赖**

```bash
npm install pg
npm install -D @types/pg vitest @vitest/ui tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: 配置 SvelteKit 使用 Node adapter**

```bash
npm install -D @sveltejs/adapter-node
```

将 `svelte.config.js` 内容替换为：

```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};

export default config;
```

- [ ] **Step 4: 配置 Tailwind CSS v4**

将 `vite.config.ts` 内容替换为：

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
```

- [ ] **Step 5: 在 app.html 引入 Tailwind**

确认 `src/app.html` 中 `<head>` 包含：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

在 `src/app.css`（新建）写入：

```css
@import "tailwindcss";
```

- [ ] **Step 6: 配置全局类型扩展**

将 `src/app.d.ts` 内容替换为：

```ts
declare global {
  namespace App {
    interface Locals {
      isAdmin: boolean;
    }
  }
}

export {};
```

- [ ] **Step 7: 创建 .env.example 和 .gitignore**

`.env.example`:
```env
ADMIN_PASSWORD=your_admin_password_here
POSTGRES_PASSWORD=your_postgres_password_here
DATABASE_URL=postgres://bambu:your_postgres_password_here@localhost:5432/bambu_genius
```

`.gitignore` 追加（如未包含）：
```
.env
node_modules/
build/
.svelte-kit/
```

- [ ] **Step 8: 验证项目启动**

```bash
npm run dev
```

预期：终端显示 `Local: http://localhost:5173/`，浏览器打开显示默认页面。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "chore: initialize SvelteKit project with Tailwind and Node adapter"
```

---

## Task 2: 数据库建表脚本

**Files:**
- Create: `init.sql`

- [ ] **Step 1: 创建 init.sql**

```sql
-- init.sql
-- 幂等建表脚本，容器首次启动时自动执行

CREATE TABLE IF NOT EXISTS print_records (
  id                  SERIAL PRIMARY KEY,
  makerworld_url      TEXT NOT NULL,
  model_name          TEXT,
  model_id            TEXT,
  thumbnail_url       TEXT,
  designer_name       TEXT,
  designer_avatar_url TEXT,
  filament_grams      NUMERIC(8,2) NOT NULL,
  colors              TEXT[],
  print_time_minutes  INTEGER,
  tags                TEXT[],
  raw_meta            JSONB,
  note                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quota_records (
  id         SERIAL PRIMARY KEY,
  delta      NUMERIC(8,2) NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 清理过期 session（可选，防止表无限增长）
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions (expires_at);
```

- [ ] **Step 2: 提交**

```bash
git add init.sql
git commit -m "feat: add database initialization SQL"
```

---

## Task 3: 数据库连接层

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: 创建 db.ts**

```ts
// src/lib/db.ts
import pg from 'pg';

const { Pool } = pg;

// 单例连接池，整个进程复用
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
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
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/db.ts
git commit -m "feat: add database connection pool"
```

---

## Task 4: MakerWorld 解析库（含测试）

**Files:**
- Create: `src/lib/makerworld.ts`
- Create: `tests/makerworld.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/makerworld.test.ts
import { describe, it, expect } from 'vitest';
import { extractModelId, parseMetaTags, parseJsonLd, buildModelUrl } from '../src/lib/makerworld';

describe('extractModelId', () => {
  it('extracts model id from standard makerworld url', () => {
    expect(extractModelId('https://makerworld.com.cn/models/376231?appSharePlatform=copy')).toBe('376231');
  });

  it('extracts model id from url without query params', () => {
    expect(extractModelId('https://makerworld.com/models/123456')).toBe('123456');
  });

  it('returns null for invalid url', () => {
    expect(extractModelId('https://example.com/foo')).toBeNull();
  });
});

describe('parseMetaTags', () => {
  it('extracts og:title from html', () => {
    const html = '<html><head><meta property="og:title" content="Cool Model"/></head></html>';
    const result = parseMetaTags(html);
    expect(result.model_name).toBe('Cool Model');
  });

  it('extracts og:image from html', () => {
    const html = '<html><head><meta property="og:image" content="https://img.example.com/thumb.jpg"/></head></html>';
    const result = parseMetaTags(html);
    expect(result.thumbnail_url).toBe('https://img.example.com/thumb.jpg');
  });

  it('returns null fields when meta tags are absent', () => {
    const result = parseMetaTags('<html><body></body></html>');
    expect(result.model_name).toBeNull();
    expect(result.thumbnail_url).toBeNull();
  });
});

describe('parseJsonLd', () => {
  it('extracts name from JSON-LD', () => {
    const html = `<script type="application/ld+json">{"@type":"Product","name":"Awesome Print"}</script>`;
    const result = parseJsonLd(html);
    expect(result.model_name).toBe('Awesome Print');
  });

  it('returns null fields when no JSON-LD present', () => {
    const result = parseJsonLd('<html><body></body></html>');
    expect(result.model_name).toBeNull();
  });
});

describe('buildModelUrl', () => {
  it('normalizes makerworld.com.cn url', () => {
    expect(buildModelUrl('376231')).toBe('https://makerworld.com/models/376231');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/makerworld.test.ts
```

预期：FAIL，提示 `Cannot find module '../src/lib/makerworld'`

- [ ] **Step 3: 实现 makerworld.ts**

```ts
// src/lib/makerworld.ts

export interface ParsedModel {
  model_id: string | null;
  model_name: string | null;
  thumbnail_url: string | null;
  designer_name: string | null;
  designer_avatar_url: string | null;
  filament_grams: number | null;
  colors: string[] | null;
  print_time_minutes: number | null;
  tags: string[] | null;
  raw_meta: Record<string, unknown> | null;
}

/** 从 MakerWorld URL 提取模型 ID */
export function extractModelId(url: string): string | null {
  const match = url.match(/makerworld(?:\.com\.cn|\.com)\/models\/(\d+)/);
  return match ? match[1] : null;
}

/** 构造 makerworld.com 规范 URL */
export function buildModelUrl(modelId: string): string {
  return `https://makerworld.com/models/${modelId}`;
}

/** 从 HTML 提取 <meta property="og:*"> 标签 */
export function parseMetaTags(html: string): Pick<ParsedModel, 'model_name' | 'thumbnail_url'> {
  const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
  const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;
  return { model_name: title, thumbnail_url: image };
}

/** 从 HTML 提取 JSON-LD 数据 */
export function parseJsonLd(html: string): Pick<ParsedModel, 'model_name'> {
  const scriptMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return { model_name: null };

  try {
    const data = JSON.parse(scriptMatch[1]) as Record<string, unknown>;
    const name = typeof data.name === 'string' ? data.name : null;
    return { model_name: name };
  } catch {
    return { model_name: null };
  }
}

/**
 * 主解析函数：fetch MakerWorld 页面并提取所有可用信息
 * 在服务端调用，避免 CORS 问题
 */
export async function parseMakerWorldUrl(url: string): Promise<ParsedModel> {
  const modelId = extractModelId(url);
  const base: ParsedModel = {
    model_id: modelId,
    model_name: null,
    thumbnail_url: null,
    designer_name: null,
    designer_avatar_url: null,
    filament_grams: null,
    colors: null,
    print_time_minutes: null,
    tags: null,
    raw_meta: null
  };

  if (!modelId) return base;

  let html: string;
  try {
    const fetchUrl = buildModelUrl(modelId);
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BambuGenius/1.0)',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return base;
    html = await res.text();
  } catch {
    return base;
  }

  // 优先级 1: JSON-LD
  const jsonLd = parseJsonLd(html);

  // 优先级 2: og meta 标签
  const meta = parseMetaTags(html);

  // 合并：JSON-LD 优先，meta 兜底
  const model_name = jsonLd.model_name ?? meta.model_name;
  const thumbnail_url = meta.thumbnail_url;

  // 尝试从页面脚本数据中提取耗材、颜色、时间等
  // MakerWorld 页面将模型数据注入 __NUXT_DATA__ 或 window.__INITIAL_STATE__
  const raw_meta: Record<string, unknown> = {};

  // 提取耗材克数（格式通常为 "xxg" 或数字）
  const filamentMatch = html.match(/["']filament_weight["']\s*:\s*([\d.]+)/i)
    ?? html.match(/([\d.]+)\s*g\s*(?:耗材|filament)/i);
  const filament_grams = filamentMatch ? parseFloat(filamentMatch[1]) : null;

  // 提取预计打印时长（分钟）
  const timeMatch = html.match(/["']print_time["']\s*:\s*(\d+)/i);
  const print_time_minutes = timeMatch ? parseInt(timeMatch[1], 10) : null;

  // 提取颜色
  const colorMatches = html.match(/["']color["']\s*:\s*["']([^"']+)["']/gi);
  const colors = colorMatches
    ? colorMatches.map(m => m.replace(/["']color["']\s*:\s*["']/, '').replace(/["']$/, ''))
    : null;

  if (filament_grams !== null) raw_meta.filament_grams_source = 'page_regex';
  if (colors) raw_meta.colors_source = 'page_regex';

  return {
    ...base,
    model_name,
    thumbnail_url,
    filament_grams,
    colors: colors && colors.length > 0 ? colors : null,
    print_time_minutes,
    raw_meta: Object.keys(raw_meta).length > 0 ? raw_meta : null
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/makerworld.test.ts
```

预期：所有测试 PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/makerworld.ts tests/makerworld.test.ts
git commit -m "feat: add MakerWorld page parser with unit tests"
```

---

## Task 5: 认证库（含测试）

**Files:**
- Create: `src/lib/auth.ts`
- Create: `tests/auth.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/auth.test.ts
import { describe, it, expect } from 'vitest';
import { checkPassword, SESSION_DURATION_MS } from '../src/lib/auth';

describe('checkPassword', () => {
  it('returns true when password matches env var', () => {
    process.env.ADMIN_PASSWORD = 'secret123';
    expect(checkPassword('secret123')).toBe(true);
  });

  it('returns false when password does not match', () => {
    process.env.ADMIN_PASSWORD = 'secret123';
    expect(checkPassword('wrong')).toBe(false);
  });

  it('returns false when ADMIN_PASSWORD is not set', () => {
    delete process.env.ADMIN_PASSWORD;
    expect(checkPassword('')).toBe(false);
  });
});

describe('SESSION_DURATION_MS', () => {
  it('is 7 days in milliseconds', () => {
    expect(SESSION_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/auth.test.ts
```

预期：FAIL，提示 `Cannot find module '../src/lib/auth'`

- [ ] **Step 3: 实现 auth.ts**

```ts
// src/lib/auth.ts
import { query, queryOne } from './db';

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/** 验证管理员密码是否正确 */
export function checkPassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return password === adminPassword;
}

/** 创建新的管理员 session，返回 token */
export async function createSession(): Promise<string> {
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
  const row = await queryOne<{ token: string }>(
    'SELECT token FROM admin_sessions WHERE token = $1 AND expires_at > NOW()',
    [token]
  );
  return row !== null;
}

/** 删除 session（注销） */
export async function deleteSession(token: string): Promise<void> {
  await query('DELETE FROM admin_sessions WHERE token = $1', [token]);
}

/** 从 cookie 字符串中提取 session token */
export function extractTokenFromCookie(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : undefined;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/auth.test.ts
```

预期：所有测试 PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/auth.ts tests/auth.test.ts
git commit -m "feat: add admin auth library with session management"
```

---

## Task 6: API 路由 — 认证（登录 / 注销）

**Files:**
- Create: `src/routes/api/auth/login/+server.ts`
- Create: `src/routes/api/auth/logout/+server.ts`

- [ ] **Step 1: 实现登录接口**

```ts
// src/routes/api/auth/login/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkPassword, createSession, SESSION_DURATION_MS } from '$lib/auth';

export const POST: RequestHandler = async ({ request }) => {
  const { password } = await request.json() as { password: string };

  if (!checkPassword(password)) {
    return json({ error: '密码错误' }, { status: 401 });
  }

  const token = await createSession();

  return json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': [
          `session=${token}`,
          'HttpOnly',
          'Path=/',
          'SameSite=Strict',
          `Max-Age=${SESSION_DURATION_MS / 1000}`
        ].join('; ')
      }
    }
  );
};
```

- [ ] **Step 2: 实现注销接口**

```ts
// src/routes/api/auth/logout/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifySession, deleteSession, extractTokenFromCookie } from '$lib/auth';

export const POST: RequestHandler = async ({ request }) => {
  const token = extractTokenFromCookie(request.headers.get('cookie'));

  if (!await verifySession(token)) {
    return json({ error: '未登录' }, { status: 401 });
  }

  await deleteSession(token!);

  return json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': 'session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'
      }
    }
  );
};
```

- [ ] **Step 3: 手动验证（启动开发服务器后测试）**

```bash
# 登录
curl -X POST http://localhost:5173/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"your_password"}' -v

# 预期响应：{"ok":true}，Set-Cookie 包含 session=<uuid>
```

- [ ] **Step 4: 提交**

```bash
git add src/routes/api/auth/
git commit -m "feat: add admin auth API routes (login/logout)"
```

---

## Task 7: API 路由 — MakerWorld 解析

**Files:**
- Create: `src/routes/api/parse/+server.ts`

- [ ] **Step 1: 实现解析接口**

```ts
// src/routes/api/parse/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseMakerWorldUrl, extractModelId } from '$lib/makerworld';

export const POST: RequestHandler = async ({ request }) => {
  const { url } = await request.json() as { url: string };

  if (!url || typeof url !== 'string') {
    return json({ error: '缺少 url 参数' }, { status: 400 });
  }

  const modelId = extractModelId(url);
  if (!modelId) {
    return json({ error: '无法识别 MakerWorld 链接格式' }, { status: 422 });
  }

  const parsed = await parseMakerWorldUrl(url);
  return json(parsed);
};
```

- [ ] **Step 2: 手动验证**

```bash
curl -X POST http://localhost:5173/api/parse \
  -H "Content-Type: application/json" \
  -d '{"url":"https://makerworld.com.cn/models/376231?appSharePlatform=copy"}'

# 预期：返回 JSON，包含 model_id: "376231"，
# 其他字段可能为 null（取决于页面结构）
```

- [ ] **Step 3: 提交**

```bash
git add src/routes/api/parse/
git commit -m "feat: add MakerWorld URL parse API route"
```

---

## Task 8: API 路由 — 提交打印记录

**Files:**
- Create: `src/routes/api/print/+server.ts`

- [ ] **Step 1: 实现提交打印接口**

```ts
// src/routes/api/print/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import type { ParsedModel } from '$lib/makerworld';

interface PrintRequest extends ParsedModel {
  makerworld_url: string;
  note?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json() as PrintRequest;

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
    note
  } = body;

  if (!makerworld_url) {
    return json({ error: '缺少 makerworld_url' }, { status: 400 });
  }

  if (filament_grams == null || isNaN(Number(filament_grams))) {
    return json({ error: '耗材克数不能为空，请手动填写' }, { status: 400 });
  }

  await query(
    `INSERT INTO print_records
      (makerworld_url, model_name, model_id, thumbnail_url, designer_name,
       designer_avatar_url, filament_grams, colors, print_time_minutes, tags, raw_meta, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
      note ?? null
    ]
  );

  return json({ ok: true });
};
```

- [ ] **Step 2: 提交**

```bash
git add src/routes/api/print/
git commit -m "feat: add print record submission API route"
```

---

## Task 9: API 路由 — 额度管理

**Files:**
- Create: `src/routes/api/quota/+server.ts`

- [ ] **Step 1: 实现额度增减接口**

```ts
// src/routes/api/quota/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';
import { verifySession, extractTokenFromCookie } from '$lib/auth';

export const POST: RequestHandler = async ({ request }) => {
  const token = extractTokenFromCookie(request.headers.get('cookie'));
  if (!await verifySession(token)) {
    return json({ error: '需要管理员权限' }, { status: 401 });
  }

  const { delta, reason } = await request.json() as { delta: number; reason?: string };

  if (delta == null || isNaN(Number(delta)) || delta === 0) {
    return json({ error: 'delta 必须为非零数字' }, { status: 400 });
  }

  await query(
    'INSERT INTO quota_records (delta, reason) VALUES ($1, $2)',
    [delta, reason ?? null]
  );

  return json({ ok: true });
};
```

- [ ] **Step 2: 提交**

```bash
git add src/routes/api/quota/
git commit -m "feat: add quota management API route (admin only)"
```

---

## Task 10: 服务端数据加载

**Files:**
- Create: `src/routes/+page.server.ts`

- [ ] **Step 1: 实现 load 函数**

```ts
// src/routes/+page.server.ts
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

  // 额度变更日志（仅管理员需要，但一并加载简化逻辑）
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
```

- [ ] **Step 2: 提交**

```bash
git add src/routes/+page.server.ts
git commit -m "feat: add server-side data loading for main page"
```

---

## Task 11: 首页 UI

**Files:**
- Create: `src/routes/+page.svelte`

这是最大的单一文件，包含所有 UI 组件逻辑（保持在一个文件便于初期迭代，后续可拆分）。

- [ ] **Step 1: 确保有 app.css 被引入**

在 `src/routes/+layout.svelte` 创建（如不存在）：

```svelte
<script>
  import '../app.css';
</script>
<slot />
```

- [ ] **Step 2: 实现首页**

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

  // 状态
  let url = '';
  let parsing = false;
  let parsed: Record<string, unknown> | null = null;
  let parseError = '';
  let manualGrams = '';
  let submitting = false;
  let submitError = '';
  let submitSuccess = false;

  // 管理员面板
  let showAdmin = false;
  let adminPassword = '';
  let loginError = '';
  let loggingIn = false;
  let adminDelta = '';
  let adminReason = '';
  let quotaError = '';
  let quotaSuccess = '';

  // 加载更多（分页）
  let currentPage = data.page;
  let records = [...data.printRecords];
  let hasMore = data.hasMore;
  let loadingMore = false;

  async function handleParse() {
    parsing = true;
    parseError = '';
    parsed = null;
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (!res.ok) {
        parseError = data.error ?? '解析失败';
      } else {
        parsed = data;
        if (!data.filament_grams) manualGrams = '';
      }
    } catch {
      parseError = '网络错误，请稍后重试';
    } finally {
      parsing = false;
    }
  }

  async function handleSubmit() {
    submitting = true;
    submitError = '';
    submitSuccess = false;
    const grams = parsed?.filament_grams ?? parseFloat(manualGrams);
    if (!grams || isNaN(Number(grams))) {
      submitError = '请填写耗材克数';
      submitting = false;
      return;
    }
    try {
      const res = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed, makerworld_url: url, filament_grams: grams })
      });
      const body = await res.json();
      if (!res.ok) {
        submitError = body.error ?? '提交失败';
      } else {
        submitSuccess = true;
        url = '';
        parsed = null;
        manualGrams = '';
        // 刷新页面数据
        window.location.reload();
      }
    } catch {
      submitError = '网络错误，请稍后重试';
    } finally {
      submitting = false;
    }
  }

  async function handleLogin() {
    loggingIn = true;
    loginError = '';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword })
      });
      if (!res.ok) {
        loginError = '密码错误';
      } else {
        window.location.reload();
      }
    } catch {
      loginError = '网络错误';
    } finally {
      loggingIn = false;
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  async function handleQuota(type: 'add' | 'subtract') {
    quotaError = '';
    quotaSuccess = '';
    const delta = parseFloat(adminDelta) * (type === 'subtract' ? -1 : 1);
    if (!adminDelta || isNaN(delta) || delta === 0) {
      quotaError = '请输入有效的克数';
      return;
    }
    const res = await fetch('/api/quota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta, reason: adminReason })
    });
    if (res.ok) {
      quotaSuccess = '已更新';
      adminDelta = '';
      adminReason = '';
      window.location.reload();
    } else {
      quotaError = '操作失败';
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    loadingMore = true;
    currentPage += 1;
    try {
      const res = await fetch(`/api/records?page=${currentPage}`);
      if (res.ok) {
        const { records: newRecords, hasMore: newHasMore } = await res.json();
        records = [...records, ...newRecords];
        hasMore = newHasMore;
      }
    } catch {
      currentPage -= 1;
    } finally {
      loadingMore = false;
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- 顶部状态栏 -->
  <header class="bg-white shadow-sm sticky top-0 z-10">
    <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-2xl font-bold text-blue-600">{data.remaining.toFixed(1)}g</span>
        <span class="text-sm text-gray-500">剩余额度</span>
      </div>
      <button
        on:click={() => showAdmin = !showAdmin}
        class="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
      >
        {data.isAdmin ? '管理面板' : '管理员登录'}
      </button>
    </div>
  </header>

  <main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
    <!-- 提交打印区 -->
    <section class="bg-white rounded-xl shadow-sm p-4 space-y-4">
      <h2 class="font-semibold text-gray-700">提交打印</h2>
      <div class="flex gap-2">
        <input
          type="url"
          bind:value={url}
          placeholder="粘贴 MakerWorld 链接…"
          class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button
          on:click={handleParse}
          disabled={parsing || !url}
          class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {parsing ? '解析中…' : '解析'}
        </button>
      </div>

      {#if parseError}
        <p class="text-red-500 text-sm">{parseError}</p>
      {/if}

      {#if parsed}
        <!-- 模型预览卡片 -->
        <div class="border border-gray-200 rounded-lg p-3 flex gap-3">
          {#if parsed.thumbnail_url}
            <img src={String(parsed.thumbnail_url)} alt="model" class="w-20 h-20 object-cover rounded-lg flex-shrink-0" />
          {/if}
          <div class="flex-1 min-w-0 space-y-1">
            <p class="font-medium text-sm truncate">{parsed.model_name ?? '未知模型'}</p>
            {#if parsed.designer_name}
              <p class="text-xs text-gray-500">设计师：{parsed.designer_name}</p>
            {/if}
            <div class="flex items-center gap-2 flex-wrap">
              {#if parsed.filament_grams}
                <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {parsed.filament_grams}g
                </span>
              {:else}
                <div class="flex items-center gap-1">
                  <span class="text-xs text-red-500">克数未知，请填写：</span>
                  <input
                    type="number"
                    bind:value={manualGrams}
                    placeholder="如 50"
                    class="w-20 border border-red-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-300"
                  />
                  <span class="text-xs text-gray-500">g</span>
                </div>
              {/if}
              {#if parsed.print_time_minutes}
                <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  约 {Math.round(Number(parsed.print_time_minutes) / 60)}h
                </span>
              {/if}
            </div>
            {#if parsed.colors && Array.isArray(parsed.colors) && parsed.colors.length > 0}
              <div class="flex gap-1 flex-wrap">
                {#each parsed.colors as color}
                  <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{color}</span>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        {#if submitError}
          <p class="text-red-500 text-sm">{submitError}</p>
        {/if}

        <button
          on:click={handleSubmit}
          disabled={submitting}
          class="w-full py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          {submitting ? '提交中…' : '确认打印，扣除额度'}
        </button>
      {/if}
    </section>

    <!-- 打印历史 -->
    <section class="space-y-3">
      <h2 class="font-semibold text-gray-700 px-1">打印历史</h2>
      {#if records.length === 0}
        <p class="text-center text-gray-400 py-8">还没有打印记录</p>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each records as record (record.id)}
            <div class="bg-white rounded-xl shadow-sm p-3 flex gap-3">
              {#if record.thumbnail_url}
                <img src={record.thumbnail_url} alt="thumb" class="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
              {:else}
                <div class="w-16 h-16 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center text-gray-300 text-xs">无图</div>
              {/if}
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{record.model_name ?? '未知模型'}</p>
                <p class="text-xs text-gray-500">{record.filament_grams}g</p>
                {#if record.colors && record.colors.length > 0}
                  <div class="flex gap-1 flex-wrap mt-0.5">
                    {#each record.colors as color}
                      <span class="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{color}</span>
                    {/each}
                  </div>
                {/if}
                <p class="text-xs text-gray-400 mt-1">{formatDate(record.created_at)}</p>
              </div>
            </div>
          {/each}
        </div>

        {#if hasMore}
          <button
            on:click={loadMore}
            disabled={loadingMore}
            class="w-full py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            {loadingMore ? '加载中…' : '加载更多'}
          </button>
        {/if}
      {/if}
    </section>
  </main>
</div>

<!-- 管理员面板：移动端底部抽屉 / 桌面端侧边抽屉 -->
{#if showAdmin}
  <!-- 遮罩 -->
  <div
    class="fixed inset-0 bg-black/30 z-20"
    on:click={() => showAdmin = false}
    role="button"
    tabindex="-1"
    on:keydown={() => {}}
  ></div>

  <!-- 抽屉容器 -->
  <aside class="
    fixed z-30 bg-white shadow-xl overflow-y-auto
    bottom-0 left-0 right-0 max-h-[80vh] rounded-t-2xl
    md:bottom-auto md:top-0 md:right-0 md:left-auto md:h-full md:w-80 md:rounded-none md:rounded-l-2xl
  ">
    <div class="p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-gray-800">管理面板</h2>
        <button on:click={() => showAdmin = false} class="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      {#if !data.isAdmin}
        <!-- 登录表单 -->
        <div class="space-y-3">
          <input
            type="password"
            bind:value={adminPassword}
            placeholder="管理员密码"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {#if loginError}
            <p class="text-red-500 text-sm">{loginError}</p>
          {/if}
          <button
            on:click={handleLogin}
            disabled={loggingIn}
            class="w-full py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
          >
            {loggingIn ? '登录中…' : '登录'}
          </button>
        </div>
      {:else}
        <!-- 额度管理 -->
        <div class="space-y-3">
          <div class="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p>总充值：<span class="font-medium">{data.totalAdded.toFixed(1)}g</span></p>
            <p>已用：<span class="font-medium">{data.totalPrinted.toFixed(1)}g</span></p>
            <p>剩余：<span class="font-bold text-blue-600">{data.remaining.toFixed(1)}g</span></p>
          </div>

          <input
            type="number"
            bind:value={adminDelta}
            placeholder="克数（如 100）"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <input
            type="text"
            bind:value={adminReason}
            placeholder="原因（可选）"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />

          {#if quotaError}
            <p class="text-red-500 text-sm">{quotaError}</p>
          {/if}
          {#if quotaSuccess}
            <p class="text-green-500 text-sm">{quotaSuccess}</p>
          {/if}

          <div class="flex gap-2">
            <button
              on:click={() => handleQuota('add')}
              class="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600"
            >
              + 增加额度
            </button>
            <button
              on:click={() => handleQuota('subtract')}
              class="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600"
            >
              - 减少额度
            </button>
          </div>

          <!-- 额度变更历史 -->
          {#if data.quotaRecords.length > 0}
            <div class="space-y-1 max-h-48 overflow-y-auto">
              <p class="text-xs text-gray-500 font-medium">变更记录</p>
              {#each data.quotaRecords as q (q.id)}
                <div class="text-xs flex justify-between items-center py-1 border-b border-gray-100">
                  <span class={Number(q.delta) > 0 ? 'text-green-600' : 'text-orange-600'}>
                    {Number(q.delta) > 0 ? '+' : ''}{q.delta}g
                    {#if q.reason}<span class="text-gray-400">· {q.reason}</span>{/if}
                  </span>
                  <span class="text-gray-400">{formatDate(q.created_at)}</span>
                </div>
              {/each}
            </div>
          {/if}

          <button
            on:click={handleLogout}
            class="w-full py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
          >
            注销登录
          </button>
        </div>
      {/if}
    </div>
  </aside>
{/if}
```

- [ ] **Step 3: 提交**

```bash
git add src/routes/+page.svelte src/routes/+layout.svelte src/app.css
git commit -m "feat: add main page UI with print submission and history"
```

---

## Task 12: API 路由 — 历史记录分页（支持无限滚动）

**Files:**
- Create: `src/routes/api/records/+server.ts`

- [ ] **Step 1: 实现分页接口**

```ts
// src/routes/api/records/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/db';

const PAGE_SIZE = 20;

export const GET: RequestHandler = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const offset = (page - 1) * PAGE_SIZE;

  const records = await query(
    `SELECT id, makerworld_url, model_name, model_id, thumbnail_url,
            designer_name, filament_grams, colors, print_time_minutes,
            note, created_at
     FROM print_records
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [PAGE_SIZE, offset]
  );

  return json({
    records,
    hasMore: records.length === PAGE_SIZE
  });
};
```

- [ ] **Step 2: 提交**

```bash
git add src/routes/api/records/
git commit -m "feat: add paginated records API for infinite scroll"
```

---

## Task 13: Docker 化部署

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: 创建 Dockerfile**

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "build"]
```

- [ ] **Step 2: 创建 docker-compose.yml**

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://bambu:${POSTGRES_PASSWORD}@postgres:5432/bambu_genius
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=bambu_genius
      - POSTGRES_USER=bambu
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bambu -d bambu_genius"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```

- [ ] **Step 3: 验证 Docker 构建**

```bash
cp .env.example .env
# 编辑 .env，填入真实密码

docker compose build
docker compose up -d
```

预期：`docker compose ps` 显示两个服务均为 `running`

访问 `http://localhost:3000`，页面正常加载。

- [ ] **Step 4: 提交**

```bash
git add Dockerfile docker-compose.yml
git commit -m "chore: add Docker and docker-compose deployment config"
```

---

## Task 14: 运行完整测试

- [ ] **Step 1: 运行所有单元测试**

```bash
npx vitest run
```

预期：所有测试 PASS

- [ ] **Step 2: 手动端到端验证清单**

使用 `docker compose up` 启动后，逐项验证：

1. 首页加载，显示 `0.0g 剩余额度`
2. 管理员登录：点击"管理员登录"，输入正确密码 → 显示管理面板
3. 增加额度：填写 500g，原因"初始充值" → 页面刷新显示 `500.0g`
4. 提交打印：粘贴一条 MakerWorld 链接 → 解析 → 确认提交 → 额度减少
5. 克数手动填写：提交一个解析不到克数的链接 → 看到红色提示 → 手动填写 → 提交成功
6. 历史列表：显示打印记录，有封面图/模型名/克数
7. 移动端（浏览器 DevTools 切换设备模式）：管理面板从底部弹出
8. 注销登录：点击"注销登录" → 管理面板变回登录表单
9. 密码错误：输入错误密码 → 显示"密码错误"

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "chore: finalize implementation and verify e2e"
```
