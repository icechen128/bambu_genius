import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkPassword, createSession, SESSION_DURATION_MS } from '$lib/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
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

  console.log('[login] request.url prefix:', request.url.slice(0, 30), '| x-forwarded-proto:', request.headers.get('x-forwarded-proto'));

  cookies.set('session', token, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    maxAge: SESSION_DURATION_MS / 1000,
    secure: false
  });

  return json({ ok: true });
};
