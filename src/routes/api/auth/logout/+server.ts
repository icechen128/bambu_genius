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
