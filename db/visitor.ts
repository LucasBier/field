import { env } from 'cloudflare:workers';
import { resolveVisitor } from '../lib/visitor';

export function getVisitor(request: Request, create = false) {
  return resolveVisitor(request, {
    create,
    development: import.meta.env.DEV,
    localWorkspace:
      (env as unknown as { FIELD_LOCAL_WORKSPACE?: string })
        .FIELD_LOCAL_WORKSPACE === 'true',
  });
}
