import { getVisitor } from '@/db/visitor';
import { getWorkspace } from '@/db/workspace';
import { deskStore } from '@/db/desk';
import { deskContext } from '@/lib/desk-context';
import {
  commitHostedTurn,
  findHostedTurn,
  hostedAllowance,
  recoverHostedTurns,
  reserveHostedTurn,
  siteConfig,
  stopHostedTurn,
} from '@/db/hosted';
import {
  readBoundedJson,
  sameOrigin,
  validWorkspace,
  canonicalWorkspace,
} from '@/lib/validation';
import { digestToken, visitorHeaders } from '@/lib/visitor';
import { beginTurn, completeTurn, classifyFailure } from '@/lib/runtime';
import { hostedMessages, hostedResponse } from '@/lib/hosted-provider';
import { localModelReady } from '@/lib/local-provider';
import {
  HOSTED_MESSAGES,
  HostedError,
  nextReset,
  reserveMicros,
  usageMicros,
  type HostedCode,
} from '@/lib/hosted-config';

const validId = (id: unknown): id is string =>
  typeof id === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    id,
  );
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: visitorHeaders() });
const failure = (error: unknown) =>
  error instanceof HostedError ? error : new HostedError('storage', 503);

export async function GET(request: Request) {
  if (!sameOrigin(request))
    return json({ error: 'Open your space from this site.' }, 403);
  const visitor = await getVisitor(request);
  if (!visitor)
    return json(
      { error: 'Open your space before starting a conversation.' },
      401,
    );
  try {
    const config = siteConfig();
    if (!config)
      return json({
        enabled: false,
        model: null,
        remaining: null,
        resetAt: null,
      });
    await recoverHostedTurns(visitor.workspaceId);
    if (config.provider === 'ollama' && !(await localModelReady(config)))
      return json({
        enabled: false,
        provider: 'ollama',
        model: config.model,
        remaining: null,
        resetAt: null,
      });
    return json({
      enabled: true,
      provider: config.provider,
      model: config.model,
      remaining: await hostedAllowance(visitor.workspaceId, config),
      resetAt: nextReset(),
    });
  } catch {
    return json({ error: HOSTED_MESSAGES.storage }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return json({ error: 'Open your space from this site.' }, 403);
  const visitor = await getVisitor(request);
  if (!visitor)
    return json(
      { error: 'Open your space before starting a conversation.' },
      401,
    );
  try {
    const body = (await readBoundedJson(request, 16000)) as Record<
      string,
      unknown
    >;
    if (
      !body ||
      !validId(body.id) ||
      typeof body.message !== 'string' ||
      !body.message.trim() ||
      body.message.length > 3000 ||
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 0 ||
      Object.keys(body).some((k) => !['id', 'message', 'revision'].includes(k))
    )
      return json({ error: 'The conversation request is invalid.' }, 400);
    const scope = visitor.workspaceId,
      id = body.id,
      message = body.message.trim();
    const fingerprint = await digestToken(message);
    await recoverHostedTurns(scope);
    const previous = await findHostedTurn(scope, id);
    if (previous) {
      if (previous.fingerprint && previous.fingerprint !== fingerprint)
        throw new HostedError('conflict', 409);
      return json({
        id,
        status: previous.status,
        code: previous.failure,
        replay: true,
      });
    }
    const config = siteConfig();
    if (!config) throw new HostedError('unavailable', 503);
    if (config.provider === 'ollama' && !(await localModelReady(config)))
      throw new HostedError('local_unavailable', 503);
    const saved = await getWorkspace(scope);
    if (saved.revision !== body.revision)
      throw new HostedError('conflict', 409);
    const started = beginTurn(saved.workspace, message, {
      provider: config.provider === 'ollama' ? 'ollama' : 'site',
      model: config.model,
    });
    const expectedRun = canonicalWorkspace(started.workspace).runs!.find(
      (run) => run.id === started.run.id,
    );
    const selected = new Set(
      started.run.memory?.matches.map((match) => match.id),
    );
    const memorySnapshot = (workspace: typeof saved.workspace) =>
      JSON.stringify(
        workspace.memories
          .filter((memory) => selected.has(memory.id))
          .map(({ id, text, source, supersededBy }) => ({
            id,
            text,
            source,
            supersededBy,
          })),
      );
    const desk = deskContext((await deskStore().read(scope)).state);
    const messages = hostedMessages(started.workspace, message, desk);
    const reserved = reserveMicros(messages, config);
    request.signal.throwIfAborted();
    await reserveHostedTurn(
      scope,
      id,
      fingerprint,
      started.run.id,
      started.workspace,
      saved.revision,
      reserved,
      config,
    );
    const abort = new AbortController();
    const signal = AbortSignal.any([
      request.signal,
      abort.signal,
      AbortSignal.timeout(config.timeoutMs),
    ]);
    const encoder = new TextEncoder();
    let disconnected = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: unknown) => {
          if (!disconnected) {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              );
            } catch {
              disconnected = true;
              abort.abort();
            }
          }
        };
        let committed = false;
        try {
          emit({ type: 'start', id, runId: started.run.id });
          signal.throwIfAborted();
          const response = await hostedResponse(
            config,
            messages,
            signal,
            (text) => emit({ type: 'text', text }),
          );
          const actual = usageMicros(
            response.usage.input!,
            response.usage.output!,
            config,
          );
          for (let attempt = 0; attempt < 4; attempt++) {
            signal.throwIfAborted();
            const turn = await findHostedTurn(scope, id);
            if (!turn || turn.status !== 'running')
              throw new HostedError('cancelled');
            const current = await getWorkspace(scope);
            if (
              current.workspace.entity?.id !== saved.workspace.entity?.id ||
              JSON.stringify(
                current.workspace.runs?.find((r) => r.id === started.run.id),
              ) !== JSON.stringify(expectedRun) ||
              memorySnapshot(current.workspace) !==
                memorySnapshot(saved.workspace)
            )
              throw new HostedError('context_changed');
            let next;
            try {
              next = completeTurn(
                current.workspace,
                started.run.id,
                response,
                signal,
              );
            } catch (error) {
              const code = classifyFailure(error);
              throw new HostedError(
                code === 'context_changed' || code === 'permission'
                  ? code
                  : 'invalid_response',
              );
            }
            if (!validWorkspace(next))
              throw new HostedError('invalid_response');
            if (
              await commitHostedTurn(
                scope,
                turn,
                next,
                current.revision,
                'completed',
                null,
                actual,
              )
            ) {
              committed = true;
              break;
            }
          }
          if (!committed) throw new HostedError('conflict', 409);
          emit({
            type: 'done',
            id,
            status: 'completed',
            usage: response.usage,
          });
        } catch (error) {
          let code: HostedCode = signal.aborted
            ? request.signal.aborted || abort.signal.aborted
              ? 'cancelled'
              : 'timeout'
            : error instanceof HostedError
              ? error.code
              : 'provider';
          if (!committed) {
            try {
              const final = await stopHostedTurn(scope, id, code);
              if (final.status === 'completed') {
                committed = true;
                emit({ type: 'done', id, status: 'completed' });
              }
            } catch {
              code = 'storage';
            }
          }
          if (!committed)
            emit({ type: 'error', code, message: HOSTED_MESSAGES[code] });
        } finally {
          if (!disconnected) {
            try {
              controller.close();
            } catch {
              /* disconnected */
            }
          }
        }
      },
      cancel() {
        disconnected = true;
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        ...visitorHeaders(),
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error &&
        ['Request is too large.', 'Missing request body.'].includes(
          error.message,
        ))
    )
      return json({ error: 'The conversation request is invalid.' }, 400);
    const result = failure(error);
    return json({ error: result.message, code: result.code }, result.status);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return json({ error: 'Open your space from this site.' }, 403);
  const visitor = await getVisitor(request);
  if (!visitor) return json({ error: 'Your browser session expired.' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!validId(id))
    return json({ error: 'The response identifier is invalid.' }, 400);
  try {
    const turn = await stopHostedTurn(visitor.workspaceId, id);
    return json({ id, status: turn.status });
  } catch (error) {
    const result = failure(error);
    return json({ error: result.message, code: result.code }, result.status);
  }
}
