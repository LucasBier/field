'use client';
import { useEffect, useRef, useState } from 'react';
import type { useWorkspace } from './use-workspace';
import { receipt, entityDemo } from '@/lib/entity';
import { demoReply } from '@/lib/agent';
import { uid, type Memory, type Workspace } from '@/lib/field';
import { siteConversation } from '@/lib/site-conversation';
import type { SiteAccess } from '@/lib/hosted-config';
import {
  runAgent,
  type AgentConnection,
  type AgentResponse,
} from '@/lib/inference';
import {
  beginTurn,
  completeTurn,
  stopTurn,
  classifyFailure,
} from '@/lib/runtime';
import type { AgentRun } from '@/lib/runtime-schema';
const latestUsage = (w: Workspace) => w.runs?.at(-1)?.usage?.total ?? null;

// Owns connection selection and one conversation lifecycle. Scene, panels and
// layout stay in the route; persistence remains in useWorkspace.
export function useCompanion(session: ReturnType<typeof useWorkspace>) {
  const { workspace, current, ready, setWorkspace, flush, remoteUpdate } =
    session;
  const [message, setMessage] = useState(''),
    [connection, setConnection] = useState<AgentConnection>({
      provider: 'demo',
    }),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [dismissed, setDismissed] = useState(false),
    [verified, setVerified] = useState(false),
    [usage, setUsage] = useState<number | null>(null);
  const active = useRef<AbortController | null>(null);
  const chosenConnection = useRef(false);
  const [site, setSite] = useState<SiteAccess | null>(null);
  const [streamingText, setStreamingText] = useState('');
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    void fetch('/api/companion')
      .then(async (r) => {
        if (!r.ok) return;
        const value = (await r.json()) as SiteAccess;
        if (disposed || typeof value.enabled !== 'boolean') return;
        setSite(value);
        if (value.enabled && value.model && !chosenConnection.current)
          setConnection({ provider: 'site', model: value.model });
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [ready]);
  const disabled = !ready || busy || !workspace.entity;
  const connect = (next: AgentConnection) => {
    setWorkspace((w) =>
      receipt(
        w,
        'connection_selected',
        next.provider === 'demo'
          ? 'Selected demo mode. No model requests.'
          : `Selected ${next.provider === 'site' ? 'site-managed' : next.provider === 'ollama' ? 'local Ollama' : 'hosted DeepSeek'} model ${next.model}. Identity unchanged.`,
        'you',
        next.provider === 'demo' ? 'Demo' : next.model,
      ),
    );
    chosenConnection.current = true;
    setConnection(next);
    setVerified(false);
    setUsage(null);
    setNotice(
      'Connection changed. Your agent’s identity and saved context stay.',
    );
  };
  const send = async () => {
    if (disabled || !message.trim() || active.current) return;
    const text = message.trim();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setNotice('');
    setMessage('');
    setDismissed(false);
    const remembering = /^remember\s*[: ,]/i.test(text);
    if (connection.provider === 'site' && !remembering) {
      setStreamingText('');
      try {
        await remoteUpdate((revision) =>
          siteConversation(
            uid(),
            text,
            revision,
            AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(site?.provider === 'ollama' ? 140000 : 65000),
            ]),
            setStreamingText,
          ),
        );
        setVerified(true);
        setUsage(latestUsage(current.current));
      } catch (e) {
        setNotice((e as Error).message);
        if (!controller.signal.aborted) setMessage(text);
      } finally {
        setStreamingText('');
        setBusy(false);
        active.current = null;
        void fetch('/api/companion')
          .then(async (r) => {
            if (r.ok) setSite((await r.json()) as SiteAccess);
          })
          .catch(() => {});
      }
      return;
    }
    let run: AgentRun | undefined;
    let committed = false;
    let timedOut = false;
    const timeout = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      connection.provider === 'ollama' ? 120000 : 55000,
    );
    try {
      const started = beginTurn(
        current.current,
        text,
        remembering ? { provider: 'demo' } : connection,
      );
      run = started.run;
      setWorkspace(started.workspace);
      // Persist the request before inference, so an interrupted tab leaves a trace.
      await flush();
      controller.signal.throwIfAborted();
      const snapshot = started.workspace;
      const remembered = remembering ? demoReply(text, snapshot) : null;
      if (connection.provider === 'site' && !remembered)
        throw new Error(
          'Use the shared conversation connection for this response.',
        );
      const result: AgentResponse & { memory?: Memory } = remembered
        ? {
            reply: remembered.reply,
            actions: [],
            memory: remembered.workspace.memories.find(
              (m) => !snapshot.memories.some((old) => old.id === m.id),
            ),
          }
        : connection.provider === 'demo'
          ? entityDemo(text, snapshot)
          : await runAgent(
              connection as Exclude<
                AgentConnection,
                { provider: 'demo' | 'site' }
              >,
              snapshot,
              text,
              controller.signal,
            );
      controller.signal.throwIfAborted();
      setWorkspace((w) =>
        completeTurn(w, started.run.id, result, controller.signal),
      );
      committed = true;
      if (!remembering && connection.provider !== 'demo') setVerified(true);
      setUsage(result.usage?.total ?? null);
      await flush();
    } catch (e) {
      let detail = committed
        ? 'The response is complete, but storage has not confirmed it. Use Retry in the save indicator; do not resend the message.'
        : timedOut
          ? 'The request timed out. No model actions were applied.'
          : controller.signal.aborted
            ? 'Response stopped. No pending model actions were applied.'
            : (e as Error).message;
      if (run && !committed) {
        try {
          setWorkspace((w) =>
            stopTurn(
              w,
              run!.id,
              controller.signal.aborted && !timedOut ? 'cancelled' : 'failed',
              timedOut
                ? 'timeout'
                : controller.signal.aborted
                  ? 'cancelled'
                  : classifyFailure(e),
            ),
          );
          await flush();
        } catch {
          detail +=
            ' The run record is not saved yet. Check the save indicator.';
        }
      }
      setNotice(detail);
      if (!committed) setMessage(text);
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      active.current = null;
    }
  };
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );
  const modelLabel =
    connection.provider === 'demo'
      ? 'Demo mode'
      : connection.provider === 'site'
        ? site?.provider === 'ollama'
          ? 'Local · ' + connection.model
          : 'Nia · Field connection'
        : connection.provider === 'ollama'
          ? 'Local · ' + connection.model
          : 'Hosted · ' + connection.model;
  const localConnection =
    connection.provider === 'ollama' ||
    (connection.provider === 'site' && site?.provider === 'ollama');
  const importAgent = async (w: Workspace) => {
    if (busy) throw new Error('Stop the current response before importing.');
    await flush();
    setWorkspace(
      receipt(
        w,
        'agent_imported',
        'Imported this agent’s saved identity and context.',
        'you',
      ),
    );
    await flush();
    chosenConnection.current = true;
    setConnection({ provider: 'demo' });
    setVerified(false);
    setNotice('Agent imported. Same identity, new session.');
  };
  return {
    message,
    setMessage,
    connection,
    busy,
    notice,
    setNotice,
    dismissed,
    setDismissed,
    verified,
    usage,
    site,
    streamingText,
    disabled,
    connect,
    send,
    stop: () => active.current?.abort(),
    importAgent,
    modelLabel,
    localConnection,
  };
}
