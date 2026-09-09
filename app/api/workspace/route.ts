import { getWorkspace, saveWorkspace } from '@/db/workspace';
import { recoverHostedTurns } from '@/db/hosted';
import { readBoundedJson, sameOrigin, validWorkspace } from '@/lib/validation';
import { getVisitor } from '@/db/visitor';
import { visitorHeaders, type Visitor } from '@/lib/visitor';
const json = (body: unknown, status = 200, visitor?: Visitor | null) =>
  Response.json(body, { status, headers: visitorHeaders(visitor) });
export async function GET(request: Request) {
  if (!sameOrigin(request))
    return json({ error: 'Open your space from this site.' }, 403);
  try {
    const visitor = await getVisitor(request, true);
    if (!visitor)
      return json(
        { error: 'A secure connection is required to open your space.' },
        401,
      );
    await recoverHostedTurns(visitor.workspaceId);
    return json(
      {
        ...(await getWorkspace(visitor.workspaceId)),
        scope: visitor.workspaceId,
        access: visitor.mode,
      },
      200,
      visitor,
    );
  } catch {
    return json(
      { error: 'The workspace could not be loaded. Please retry.' },
      503,
    );
  }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request))
    return json({ error: 'This request must come from your workspace.' }, 403);
  try {
    const visitor = await getVisitor(request);
    if (!visitor)
      return json(
        {
          error:
            'Your browser session expired. Export your draft before reloading.',
        },
        401,
      );
    const body = (await readBoundedJson(request, 1_000_000)) as Record<
      string,
      unknown
    >;
    if (body?.scope !== visitor.workspaceId)
      return json(
        {
          error:
            'This draft belongs to a different browser session. Export it before reloading.',
        },
        403,
      );
    if (
      !body ||
      !Number.isSafeInteger(body.revision) ||
      (body.revision as number) < 0 ||
      !validWorkspace(body.workspace)
    )
      return json(
        {
          error:
            'Invalid workspace. Check the experiment values or storage limits.',
        },
        400,
      );
    if (
      !(await saveWorkspace(
        body.workspace,
        body.revision as number,
        visitor.workspaceId,
      ))
    )
      return json(
        {
          error:
            'This workspace changed in another tab. Export your draft before reloading.',
        },
        409,
      );
    return json({ revision: (body.revision as number) + 1 });
  } catch (e) {
    if (
      e instanceof SyntaxError ||
      (e instanceof Error &&
        ['Request is too large.', 'Missing request body.'].includes(e.message))
    )
      return json({ error: 'The request body is invalid or too large.' }, 400);
    return json(
      {
        error: 'Could not save this workspace. Your draft is still open here.',
      },
      503,
    );
  }
}
