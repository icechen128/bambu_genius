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
