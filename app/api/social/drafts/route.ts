import { env } from 'cloudflare:workers';
import { NiaDrafts } from '@/db/nia-drafts';
import { XConnection } from '@/db/x-connection';
import { XClient, XError, xConfig, equalSecret } from '@/lib/x-auth';
import { X_HEADERS } from '../x/route';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const c = xConfig(env as unknown as Record<string, unknown>);
    if (
      request.headers.get('origin') !== c.origin ||
      new URL(request.url).origin !== c.origin
    )
      throw new XError('forbidden', 403);
    const credential = request.headers.get('authorization') || '';
    const workerKey = (env as unknown as Record<string, unknown>)
      .FIELD_NIA_WORKER_KEY;
    const owner =
      credential.length <= 128 &&
      (await equalSecret(credential, 'Bearer ' + c.ownerKey));
    const worker =
      typeof workerKey === 'string' &&
      /^[a-f0-9]{64}$/.test(workerKey) &&
      credential.length <= 128 &&
      (await equalSecret(credential, 'Bearer ' + workerKey));
    if (!owner && !worker) throw new XError('unauthorized', 401);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new XError('invalid_request');
    const body = await request.text();
    if (body.length > 18000) throw new XError('invalid_request');
    const v = JSON.parse(body),
      service = new NiaDrafts(env.DB);
    if (!owner && !['list', 'claim', 'complete', 'fail'].includes(v.action))
      throw new XError('worker_cannot_publish', 403);
    if (v.action === 'list')
      return Response.json(
        { drafts: await service.list() },
        { headers: X_HEADERS },
      );
    if (v.action === 'queue')
      return Response.json(await service.queue(v.brief), {
        headers: X_HEADERS,
      });
    if (
      typeof v.id !== 'string' ||
      v.id.length > 64 ||
      !Number.isInteger(v.revision) ||
      v.revision < 0
    )
      throw new XError('invalid_request');
    let result: unknown;
    if (v.action === 'claim')
      result = { job: await service.claim(v.id, v.revision) };
    else if (v.action === 'complete')
      result = await service.complete(v.id, v.revision, v.candidate);
    else if (v.action === 'fail') result = await service.fail(v.id, v.revision);
    else if (v.action === 'discard')
      result = await service.discard(v.id, v.revision);
    else if (v.action === 'edit')
      result = await service.edit(v.id, v.revision, v.text);
    else if (v.action === 'publish') {
      if (v.reviewed !== true) throw new XError('review_required', 409);
      const token = await new XConnection(env.DB, c).accessToken();
      result = await service.publish(v.id, v.revision, v.text, (text) =>
        new XClient(c).post(token, text),
      );
    } else throw new XError('invalid_request');
    return Response.json(result, { headers: X_HEADERS });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof XError
            ? error.code
            : error instanceof Error &&
                /^(invalid_|unverified_|event_source_|reply_target_|unexpected_|skip_)/.test(
                  error.message,
                )
              ? error.message
              : 'draft_unavailable',
      },
      {
        status: error instanceof XError ? error.status : 400,
        headers: X_HEADERS,
      },
    );
  }
}
