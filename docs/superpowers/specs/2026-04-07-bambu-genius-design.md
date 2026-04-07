# Bambu Genius — 设计规格文档

**日期：** 2026-04-07
**状态：** 待实现

---

## 1. 项目概述

一个基于 SvelteKit 的网页应用，用于控制小孩使用拓竹（Bambu Lab）打印机的耗材用量。

**核心功能：**
- 展示当前剩余耗材额度（克数）及打印历史
- 小孩可自行提交 MakerWorld 模型链接发起打印，系统自动解析耗材用量并扣除额度
- 管理员通过密码登录后可手动增减额度

---

## 2. 用户角色

| 角色 | 权限 |
|------|------|
| 普通用户（小孩） | 查看额度和历史、提交 MakerWorld 链接打印 |
| 管理员（家长） | 以上所有 + 增减额度、查看操作日志 |

---

## 3. 数据库设计

数据库：PostgreSQL 16

### 3.1 `print_records` — 打印历史

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PRIMARY KEY | |
| makerworld_url | TEXT NOT NULL | 原始提交链接 |
| model_name | TEXT | 模型名称 |
| model_id | TEXT | MakerWorld 模型 ID |
| thumbnail_url | TEXT | 封面图 URL |
| designer_name | TEXT | 设计师名称 |
| designer_avatar_url | TEXT | 设计师头像 URL |
| filament_grams | NUMERIC(8,2) NOT NULL | 耗材克数（解析或手动填写）|
| colors | TEXT[] | 颜色数组（如 `{"红","白"}`）|
| print_time_minutes | INTEGER | 预计打印时长（分钟）|
| tags | TEXT[] | 模型标签 |
| raw_meta | JSONB | 其他解析到的原始数据（兜底字段）|
| note | TEXT | 备注 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | 打印时间 |

### 3.2 `quota_records` — 额度变更日志

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL PRIMARY KEY | |
| delta | NUMERIC(8,2) NOT NULL | 变化量（正=增加，负=减少）|
| reason | TEXT | 原因描述 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | 操作时间 |

> **当前剩余额度计算：**
> `SUM(quota_records.delta) - SUM(print_records.filament_grams)`
> 不单独存储剩余额度，避免数据不一致。

### 3.3 `admin_sessions` — 管理员会话

| 字段 | 类型 | 说明 |
|------|------|------|
| token | TEXT PRIMARY KEY | 随机生成的 session token |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | 登录时间 |
| expires_at | TIMESTAMPTZ NOT NULL | 过期时间（登录后 7 天）|

---

## 4. 页面与功能设计

### 4.1 首页 `/`（所有人可访问）

**顶部状态栏**
- 当前剩余额度（大字显示，单位：克）
- 管理员登录按钮（右上角）

**提交打印区**
- 输入框：粘贴 MakerWorld 链接
- 点击"解析"：
  - 成功：展示模型卡片预览（封面图、名称、设计师、克数、颜色、打印时长）
  - 失败/部分失败：展示能解析到的字段，克数字段标红，提示手动填写
- 确认提交：写入 `print_records`，扣除额度

**打印历史列表**
- 按 `created_at` 倒序
- 每条显示：封面缩略图、模型名、克数、颜色、打印时间
- 采用无限滚动加载

### 4.2 管理面板（登录后可见）

以**侧边抽屉（桌面端）/ 底部抽屉（移动端）**形式展示（不跳转新页面）：
- 增加额度（输入克数 + 原因文本）
- 减少额度（输入克数 + 原因文本）
- 额度变更历史（`quota_records` 列表）
- 注销登录

### 4.3 响应式布局

| 断点 | 布局 |
|------|------|
| 移动端（< 768px） | 提交框全宽，历史单列卡片，管理面板底部抽屉 |
| 桌面端（≥ 768px） | 历史双列/三列卡片，管理面板侧边抽屉 |

---

## 5. API 接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/parse` | 公开 | 解析 MakerWorld 链接，返回模型元数据 |
| POST | `/api/print` | 公开 | 提交打印记录，扣除额度 |
| POST | `/api/quota` | 管理员 | 增减额度 |
| POST | `/api/auth/login` | 公开 | 密码登录，返回 session token |
| POST | `/api/auth/logout` | 管理员 | 注销 session |

### MakerWorld 解析策略

服务端执行 fetch（避免 CORS），按优先级尝试：
1. 提取页面 `<script type="application/ld+json">` 中的 JSON-LD 数据
2. 提取 `<meta>` 标签（og:title、og:image 等）
3. 正则匹配页面结构中的耗材/颜色信息

解析失败的字段返回 `null`，前端对 `filament_grams` 为 `null` 的情况单独标红提示手动输入。

---

## 6. 技术架构

### 6.1 项目结构

```
bambu_genius/
├── src/
│   ├── routes/
│   │   ├── +page.svelte              # 首页
│   │   ├── +page.server.ts           # 服务端数据加载（历史、额度）
│   │   └── api/
│   │       ├── parse/+server.ts      # MakerWorld 链接解析
│   │       ├── print/+server.ts      # 提交打印记录
│   │       ├── quota/+server.ts      # 管理员增减额度
│   │       ├── auth/
│   │       │   ├── login/+server.ts  # 登录
│   │       │   └── logout/+server.ts # 注销
│   └── lib/
│       ├── db.ts                     # pg 连接池
│       ├── makerworld.ts             # 页面解析逻辑
│       └── auth.ts                   # session 验证工具函数
├── docker-compose.yml
├── Dockerfile
├── init.sql                          # 数据库初始化脚本（幂等）
└── .env.example
```

### 6.2 技术选型

| 技术 | 用途 |
|------|------|
| SvelteKit + TypeScript | 全栈框架 |
| Tailwind CSS | 样式 + 响应式 |
| `pg`（node-postgres） | 数据库访问（直接 SQL，无 ORM）|
| 原生 `fetch` | 服务端解析 MakerWorld 页面 |
| Docker Compose | 容器化部署 |

---

## 7. 部署设计

### 7.1 Docker Compose

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      - DATABASE_URL=postgres://bambu:${POSTGRES_PASSWORD}@postgres:5432/bambu_genius
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=bambu_genius
      - POSTGRES_USER=bambu
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bambu -d bambu_genius"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### 7.2 环境变量（`.env.example`）

```env
ADMIN_PASSWORD=your_admin_password_here
POSTGRES_PASSWORD=your_postgres_password_here
```

### 7.3 安全要点

- 管理密码仅存环境变量，不进代码库
- Session token 使用 `crypto.randomUUID()` 生成，存入 `admin_sessions` 表，有效期 7 天
- Token 通过 HttpOnly cookie 传递，服务端每次请求验证有效性
- `.env` 加入 `.gitignore`
- 仅 `/api/quota` 和 `/api/auth/logout` 需要 session 验证

---

## 8. 范围外（明确不做）

- 多用户/多小孩账户系统
- 打印审批流程（提交即打印）
- 额度自动周期重置
- 邮件/消息通知
- 打印机直连控制
