import { env } from 'cloudflare:workers';
import { XConnection } from '@/db/x-connection';
import { equalSecret, xConfig, XError } from '@/lib/x-auth';
export const dynamic = 'force-dynamic';
export const X_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
export async function POST(request: Request) {
  try {
    const c = xConfig(env as unknown as Record<string, unknown>);
    if (
      request.headers.get('origin') !== c.origin ||
      new URL(request.url).origin !== c.origin
    )
      throw new XError('forbidden', 403);
    const credential = request.headers.get('authorization') || '';
    if (
      credential.length > 128 ||
      !(await equalSecret(credential, 'Bearer ' + c.ownerKey))
    )
      throw new XError('unauthorized', 401);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new XError('invalid_request');
    const body = await request.text();
    if (body.length > 256) throw new XError('invalid_request');
    const { action } = JSON.parse(body);
    const service = new XConnection(env.DB, c);
    if (action === 'connect') {
      const result = await service.begin();
      return Response.json(
        { url: result.url },
        {
          headers: {
            ...X_HEADERS,
            'Set-Cookie': `__Host-field-x=${result.browser}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
          },
        },
      );
    }
    const result =
      action === 'status'
        ? await service.status()
        : action === 'verify'
          ? await service.verify()
          : action === 'disconnect'
            ? await service.disconnect()
            : null;
    if (!result) throw new XError('invalid_request');
    return Response.json(result, { headers: X_HEADERS });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof XError ? error.code : 'connection_unavailable',
      },
      {
        status: error instanceof XError ? error.status : 503,
        headers: X_HEADERS,
      },
    );
  }
}
