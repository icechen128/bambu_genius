/**
 * 使用 Playwright 无头浏览器绕过 Cloudflare 拦截
 * 用于访问 makerworld.com.cn 等受 Cloudflare 保护的 API
 *
 * 浏览器实例全局单例复用，避免每次请求都启动新进程
 */
import { chromium, type Browser, type BrowserContext } from 'playwright';

let _browser: Browser | null = null;
let _context: BrowserContext | null = null;

async function getContext(): Promise<BrowserContext> {
  if (_context && _browser?.isConnected()) return _context;

  // 关闭旧实例
  await _context?.close().catch(() => {});
  await _browser?.close().catch(() => {});

  // 生产环境（Docker）使用系统 Chromium，开发环境使用 Playwright 下载的版本
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

  // 若系统配置了 HTTPS_PROXY，让浏览器也走同一代理（用于访问 .com.cn）
  const systemProxy = process.env.HTTPS_PROXY || process.env.https_proxy;

  _browser = await chromium.launch({
    headless: true,
    executablePath,
    proxy: systemProxy ? { server: systemProxy } : undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  _context = await _browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    extraHTTPHeaders: {
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    },
    viewport: { width: 1280, height: 800 }
  });

  // 注入反检测脚本：隐藏 headless 特征
  await _context.addInitScript(() => {
    // 删除 webdriver 标志
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // 伪造插件列表
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    // 伪造语言
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
    // chrome 对象
    (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
  });

  console.log('[browser-fetch] Browser context initialized');
  return _context;
}

/**
 * 通过无头浏览器加载 MakerWorld 模型页面，
 * 从 Next.js SSR 注入的 __NEXT_DATA__ 中提取模型数据。
 * 适用于 makerworld.com.cn（受 Cloudflare 保护，但页面可正常加载）。
 */
export async function fetchModelViaNextData(
  pageUrl: string
): Promise<Record<string, unknown> | null> {
  let context: BrowserContext;
  try {
    context = await getContext();
  } catch (err) {
    console.error('[browser-fetch] Failed to init browser:', err);
    return null;
  }

  const page = await context.newPage();
  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const design = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el?.textContent) return null;
      try {
        const parsed = JSON.parse(el.textContent) as {
          props?: { pageProps?: { design?: unknown } };
        };
        return (parsed.props?.pageProps?.design as Record<string, unknown>) ?? null;
      } catch {
        return null;
      }
    });

    if (!design) {
      console.error(`[browser-fetch] __NEXT_DATA__ missing or no design for ${pageUrl}`);
    }
    return design;
  } catch (err) {
    console.error(`[browser-fetch] Failed for ${pageUrl}:`, err);
    return null;
  } finally {
    await page.close();
  }
}
