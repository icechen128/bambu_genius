import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkPassword, createSession, SESSION_DURATION_MS } from '$lib/auth';

export const POST: RequestHandler = async ({ request }) => {
  let password: string;
  try {
    const body = await request.json() as { password?: unknown };
    if (typeof body.password !== 'string' || !body.password) {
      return json({ error: '密码不能为空' }, { status: 400 });
    }
    password = body.password;
  } catch {
    return json({ error: '请求格式错误' }, { status: 400 });
  }

  if (!checkPassword(password)) {
    return json({ error: '密码错误' }, { status: 401 });
  }

  const token = await createSession();

  const isSecure =
    request.url.startsWith('https://') ||
    request.headers.get('x-forwarded-proto') === 'https';
  const cookieParts = [
    `session=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${SESSION_DURATION_MS / 1000}`
  ];
  if (isSecure) cookieParts.push('Secure');

  return json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': cookieParts.join('; ')
      }
    }
  );
};
