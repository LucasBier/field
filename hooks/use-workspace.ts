'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { initialWorkspace, type Workspace } from '@/lib/field';
import { validWorkspace } from '@/lib/validation';
import {
  createDraft,
  draftDisposition,
  draftStore,
  type WorkspaceDraft,
} from '@/lib/workspace-draft';
const drafts = draftStore(() => window.sessionStorage);
type Recovery = { draft: WorkspaceDraft; conflict: boolean };
export function useWorkspace() {
  const [workspace, render] = useState(initialWorkspace);
  const current = useRef(workspace);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);
  const revision = useRef(0);
  const scope = useRef('');
  const [access, setAccess] = useState<'guest' | 'local'>('guest');
  const [status, setStatus] = useState('Loading workspace…');
  const [error, setError] = useState('');
  const [draftWarning, setDraftWarning] = useState('');
  const [recovery, showRecovery] = useState<Recovery | null>(null);
  const pendingRecovery = useRef<Recovery | null>(null);
  const version = useRef(0),
    savedVersion = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = useRef<Promise<void> | null>(null);
  const conflicted = useRef(false);
  const remoteActive = useRef(false);
  const reconcileNeeded = useRef(false);
  const flush = useCallback((): Promise<void> => {
    if (pendingRecovery.current)
      return Promise.reject(
        new Error('Choose how to recover your draft before continuing.'),
      );
    if (running.current) return running.current;
    if (!loaded.current || version.current === savedVersion.current)
      return Promise.resolve();
    if (conflicted.current)
      return Promise.reject(new Error('Export your draft before reloading.'));
    const save = async () => {
      try {
        while (savedVersion.current < version.current) {
          const target = version.current;
          const snapshot = current.current;
          setStatus('Saving…');
          const response = await fetch('/api/workspace', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace: snapshot,
              revision: revision.current,
              scope: scope.current,
            }),
          });
          const data = (await response.json()) as {
            revision: number;
            error?: string;
          };
          if (!response.ok) {
            if ([401, 403, 409].includes(response.status))
              conflicted.current = true;
            throw new Error(data.error || 'Could not save. Please retry.');
          }
          if (
            !Number.isSafeInteger(data.revision) ||
            data.revision !== revision.current + 1
          )
            throw new Error(
              'The save could not be confirmed. Please reload after exporting your draft.',
            );
          revision.current = data.revision;
          savedVersion.current = target;
          // A newer edit may have arrived while this request was in flight.
          // Rebase its recovery copy on the acknowledged revision, not the old one.
          setDraftWarning(
            savedVersion.current < version.current
              ? drafts.write(
                  createDraft(scope.current, revision.current, current.current),
                )
              : drafts.remove(scope.current),
          );
        }
        setStatus('All changes saved');
        setError('');
      } catch (e) {
        setStatus('Unsaved changes');
        setError(e instanceof Error ? e.message : 'Could not save.');
        throw e;
      } finally {
        running.current = null;
      }
    };
    running.current = save();
    return running.current;
  }, []);
  const load = useCallback(async (strict = false, signal?: AbortSignal) => {
    try {
      const r = await fetch('/api/workspace', { cache: 'no-store', signal });
      const data = (await r.json()) as {
        workspace: Workspace;
        revision: number;
        scope: string;
        access: 'guest' | 'local';
        error?: string;
      };
      if (
        !r.ok ||
        !validWorkspace(data.workspace) ||
        !Number.isSafeInteger(data.revision) ||
        data.revision < 0 ||
        typeof data.scope !== 'string' ||
        !data.scope ||
        !['guest', 'local'].includes(data.access)
      )
        throw new Error(data.error || 'Could not load the workspace.');
      if (strict && data.scope !== scope.current)
        throw new Error(
          'Your browser session changed. Export your draft before reloading.',
        );
      signal?.throwIfAborted();
      if (!loaded.current) {
        const recovered = drafts.read(data.scope);
        setDraftWarning(recovered.warning);
        if (recovered.draft) {
          const disposition = draftDisposition(recovered.draft, data);
          if (disposition === 'saved')
            setDraftWarning(drafts.remove(data.scope));
          else if (disposition !== 'foreign') {
            pendingRecovery.current = {
              draft: recovered.draft,
              conflict: disposition === 'conflict',
            };
            showRecovery(pendingRecovery.current);
          }
        }
      }
      current.current = data.workspace;
      render(data.workspace);
      revision.current = data.revision;
      scope.current = data.scope;
      setAccess(data.access);
      loaded.current = true;
      setReady(!pendingRecovery.current);
      setStatus('All changes saved');
      setError('');
    } catch (e) {
      if (signal?.aborted) return;
      setStatus('Connection needed');
      setError(e instanceof Error ? e.message : 'Could not load.');
      if (strict) throw e;
    }
  }, []);
  // The initial load synchronizes React with the remote workspace; updates happen after the network response.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react/react-compiler
    void load(false, controller.signal);
    const leave = (e: BeforeUnloadEvent) => {
      if (version.current > savedVersion.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => {
      controller.abort();
      window.removeEventListener('beforeunload', leave);
      clearTimeout(timer.current);
    };
  }, [load]);
  const setWorkspace = useCallback(
    (update: Workspace | ((w: Workspace) => Workspace)) => {
      if (!loaded.current) throw new Error('The workspace is still loading.');
      if (pendingRecovery.current)
        throw new Error('Choose how to recover your draft before continuing.');
      if (reconcileNeeded.current)
        throw new Error(
          'Use Retry in the save indicator to load the latest response before editing.',
        );
      if (remoteActive.current)
        throw new Error('Wait for this response before editing your space.');
      if (conflicted.current)
        throw new Error(
          'The workspace changed in another tab. Export your draft before reloading.',
        );
      const next =
        typeof update === 'function' ? update(current.current) : update;
      if (!validWorkspace(next)) {
        setError(
          'This change is invalid or exceeds a workspace limit. Check the entered values or remove an older item.',
        );
        throw new Error('This change is invalid or exceeds a workspace limit.');
      }
      current.current = next;
      render(next);
      version.current++;
      setDraftWarning(
        drafts.write(createDraft(scope.current, revision.current, next)),
      );
      setStatus('Saving…');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush().catch(() => {});
      }, 200);
    },
    [flush],
  );
  const remoteUpdate = async (action: (revision: number) => Promise<void>) => {
    if (remoteActive.current || !loaded.current || pendingRecovery.current)
      throw new Error('A response is already being saved.');
    remoteActive.current = true;
    let flushed = false;
    try {
      if (reconcileNeeded.current) {
        await load(true);
        reconcileNeeded.current = false;
      }
      await flush();
      flushed = true;
      setStatus('Nia is responding…');
      await action(revision.current);
    } finally {
      try {
        if (flushed) {
          reconcileNeeded.current = true;
          await load(true);
          reconcileNeeded.current = false;
        }
      } finally {
        remoteActive.current = false;
      }
    }
  };
  return {
    workspace,
    setWorkspace,
    current,
    ready,
    access,
    status,
    error,
    draftWarning,
    recovery,
    restoreDraft: () => {
      const pending = pendingRecovery.current;
      if (!pending || pending.conflict) return;
      pendingRecovery.current = null;
      showRecovery(null);
      setReady(true);
      setWorkspace(pending.draft.workspace);
    },
    discardDraft: () => {
      setDraftWarning(drafts.remove(scope.current));
      pendingRecovery.current = null;
      showRecovery(null);
      setReady(true);
    },
    flush,
    remoteUpdate,
    retry: async () => {
      if (remoteActive.current) return;
      if (reconcileNeeded.current) {
        await load(true);
        reconcileNeeded.current = false;
      } else if (loaded.current) await flush();
      else await load();
    },
  };
}
