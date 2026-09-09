import { env } from 'cloudflare:workers';
import { XConnection } from '@/db/x-connection';
import { xConfig, XError } from '@/lib/x-auth';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Set-Cookie':
      '__Host-field-x=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
  };
  try {
    const c = xConfig(env as unknown as Record<string, unknown>),
      url = new URL(request.url);
    if (url.origin !== c.origin) throw new XError('forbidden', 403);
    if (url.searchParams.has('error'))
      throw new XError('authorization_declined');
    const browser =
      request.headers
        .get('cookie')
        ?.split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith('__Host-field-x='))
        ?.slice('__Host-field-x='.length) || '';
    await new XConnection(env.DB, c).callback(
      url.searchParams.get('state') || '',
      browser,
      url.searchParams.get('code') || '',
    );
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: c.origin + '/admin/social?connection=ready',
      },
    });
  } catch (error) {
    return new Response(
      error instanceof XError
        ? `X connection failed: ${error.code}. Return to /admin/social and start again.`
        : 'X connection could not be confirmed. Return to /admin/social and start again.',
      {
        status: error instanceof XError ? error.status : 503,
        headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
      },
    );
  }
}
