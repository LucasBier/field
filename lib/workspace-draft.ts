import type { Workspace } from './field';
import { canonicalWorkspace, validWorkspace } from './validation';

// This is a tab-local recovery copy, never a replacement for server storage.
export type WorkspaceDraft = {
  format: 'field-draft';
  version: 1;
  scope: string;
  revision: number;
  savedAt: number;
  workspace: Workspace;
};
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const MAX_BYTES = 2_000_000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const validScope = (scope: string) =>
  /^(workspace|guest:[a-f0-9]{64})$/.test(scope);
const validRevision = (revision: number) =>
  Number.isSafeInteger(revision) && revision >= 0;
const key = (scope: string) => `field:unsaved:v1:${scope}`;
export const DRAFT_WARNING =
  'A recovery copy could not be kept in this tab. Keep it open and export your draft if saving fails.';

export function createDraft(
  scope: string,
  revision: number,
  workspace: Workspace,
): WorkspaceDraft {
  if (
    !validScope(scope) ||
    !validRevision(revision) ||
    !validWorkspace(workspace)
  )
    throw new Error('Invalid recovery draft.');
  return {
    format: 'field-draft',
    version: 1,
    scope,
    revision,
    savedAt: Date.now(),
    workspace: canonicalWorkspace(workspace),
  };
}

export function draftDisposition(
  draft: WorkspaceDraft,
  saved: { scope: string; revision: number; workspace: Workspace },
) {
  if (draft.scope !== saved.scope) return 'foreign' as const;
  if (
    JSON.stringify(canonicalWorkspace(draft.workspace)) ===
    JSON.stringify(canonicalWorkspace(saved.workspace))
  )
    return 'saved' as const;
  return draft.revision === saved.revision
    ? ('restorable' as const)
    : ('conflict' as const);
}

export function draftStore(storage: () => DraftStorage) {
  return {
    read(scope: string): { draft: WorkspaceDraft | null; warning: string } {
      if (!validScope(scope)) return { draft: null, warning: '' };
      try {
        const raw = storage().getItem(key(scope));
        if (!raw) return { draft: null, warning: '' };
        let value: WorkspaceDraft | undefined;
        try {
          if (raw.length <= MAX_BYTES) value = JSON.parse(raw);
        } catch {
          /* Invalid local data is not restorable. */
        }
        if (
          !value ||
          value.format !== 'field-draft' ||
          value.version !== 1 ||
          value.scope !== scope ||
          !validRevision(value.revision) ||
          !Number.isFinite(value.savedAt) ||
          value.savedAt > Date.now() + 60000 ||
          Date.now() - value.savedAt > MAX_AGE ||
          !validWorkspace(value.workspace)
        ) {
          storage().removeItem(key(scope));
          return { draft: null, warning: '' };
        }
        return {
          draft: { ...value, workspace: canonicalWorkspace(value.workspace) },
          warning: '',
        };
      } catch {
        return { draft: null, warning: DRAFT_WARNING };
      }
    },
    write(draft: WorkspaceDraft) {
      try {
        const raw = JSON.stringify(
          createDraft(draft.scope, draft.revision, draft.workspace),
        );
        if (new TextEncoder().encode(raw).byteLength > MAX_BYTES)
          return DRAFT_WARNING;
        storage().setItem(key(draft.scope), raw);
        return '';
      } catch {
        return DRAFT_WARNING;
      }
    },
    remove(scope: string) {
      if (!validScope(scope)) return '';
      try {
        storage().removeItem(key(scope));
        return '';
      } catch {
        return 'This tab could not clear its recovery copy. Clear site data after exporting any unsaved work.';
      }
    },
  };
}
