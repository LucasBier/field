import { getVisitor } from '@/db/visitor';
import { deskMedia, mediaPath } from '@/db/desk-media';
import { visitorHeaders } from '@/lib/visitor';
export async function GET(request: Request) {
  const headers = { ...visitorHeaders(), 'X-Content-Type-Options': 'nosniff' };
  try {
    const visitor = await getVisitor(request),
      path = mediaPath(new URL(request.url).pathname);
    if (!visitor || !path)
      return new Response('Not found', { status: 404, headers });
    const file = await deskMedia().get(`${visitor.workspaceId}/${path}`);
    if (!file) return new Response('Not found', { status: 404, headers });
    return new Response(file.body, {
      headers: {
        ...headers,
        'Content-Type':
          file.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Length': String(file.size),
      },
    });
  } catch {
    return new Response('Camera storage is unavailable.', {
      status: 503,
      headers,
    });
  }
}
