'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  CircleDot,
  Brain,
  Settings2,
  ListTodo,
  History,
  ArrowUp,
  MessageCircle,
  Move,
  Boxes,
  Users,
  StickyNote,
  Cpu,
  Cloud,
  Square,
  ArrowUpRight,
  X,
  Hand,
  Activity,
} from 'lucide-react';
import AgentScene from '@/components/agent-scene';
import AgentPanels, { type Panel } from '@/components/agent-panels';
import { downloadAgent } from '@/lib/agent-export';
import AgentConnectionDialog from '@/components/agent-connection';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MemoryDialog } from '@/components/workspace-dialogs';
import { useWorkspace } from '@/hooks/use-workspace';
import { DraftRecovery } from '@/components/draft-recovery';
import { applyEntityActions } from '@/lib/entity';
import { useCompanion } from '@/hooks/use-companion';

import { activeMemories } from '@/lib/memory';

import type { Zone } from '@/lib/entity-schema';
import { useEntityTools } from '@/hooks/use-entity-tools';

import { RuntimeInspector } from '@/components/runtime-inspector';

export default function Space() {
  const session = useWorkspace();
  const {
    workspace,
    setWorkspace,
    current,
    ready,
    access,
    status,
    error,
    flush,
    retry,
    recovery,
    restoreDraft,
    discardDraft,
    draftWarning,
  } = session;
  const [memory, setMemory] = useState(false),
    [runtimeOpen, setRuntimeOpen] = useState(false),
    [panel, setPanel] = useState<Panel>(null),
    [connectionOpen, setConnectionOpen] = useState(false);
  const [greeting, setGreeting] = useState(0);
  const composer = useRef<HTMLTextAreaElement>(null);
  const {
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
    stop,
    importAgent,
    modelLabel,
    localConnection,
  } = useCompanion(session);
  const move = (zone: Zone) => {
    if (disabled) return;
    try {
      setWorkspace((w) =>
        applyEntityActions(w, [{ type: 'move', zone }], 'you'),
      );
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  useEntityTools(
    {
      read: () => current.current,
      apply: async (actions) => {
        if (busy) throw new Error('Wait for the current response.');
        setWorkspace((w) => applyEntityActions(w, actions, 'agent', 'WebMCP'));
        await flush();
        return current.current;
      },
    },
    ready,
  );
  const last = workspace.messages
    .filter(
      (m) =>
        m.role === 'assistant' &&
        m.id !== 'welcome' &&
        (m.memoryVersion || 0) === (workspace.memoryVersion || 0),
    )
    .at(-1);
  const recentNote = workspace.entity?.notes
    .filter((n) => n.zone === workspace.entity?.zone)
    .at(-1);
  return (
    <main className="spatial-home">
      <DraftRecovery
        recovery={recovery}
        onRestore={restoreDraft}
        onDiscard={discardDraft}
      />
      <AgentScene
        zone={workspace.entity?.zone}
        busy={busy}
        greeting={greeting}
        onMove={move}
      />
      <header className="space-header">
        <Link href="/" className="home-brand">
          <CircleDot size={27} />
          field<span>/ space</span>
        </Link>
        <div className="space-agent-title">
          <span />
          {workspace.profile.name}
          <small>{busy ? 'Thinking…' : modelLabel}</small>
        </div>
        <nav>
          <Button
            variant="ghost"
            disabled={disabled}
            title="Memory"
            aria-label="Open memory"
            onClick={() => setMemory(true)}
          >
            <Brain size={18} />
            <span>Memory</span>
          </Button>
          <Button
            variant="ghost"
            disabled={disabled}
            title="People and relationships"
            aria-label="People and relationships"
            onClick={() => setPanel('people')}
          >
            <Users size={18} />
          </Button>
          <Button
            variant="ghost"
            disabled={disabled}
            title="Agent settings"
            aria-label="Agent settings"
            onClick={() => setPanel('identity')}
          >
            <Settings2 size={18} />
          </Button>
          <Button
            className="space-connection-button"
            variant="outline"
            disabled={disabled}
            onClick={() => setConnectionOpen(true)}
          >
            {localConnection ? <Cpu size={15} /> : <Cloud size={15} />}
            <span>
              {connection.provider === 'demo'
                ? 'Connect model'
                : localConnection
                  ? 'Local model'
                  : 'Hosted model'}
            </span>
          </Button>
        </nav>
      </header>
      <div className="space-introduction">
        <p>YOUR COMPANION · YOUR SHARED SPACE</p>
        <h1>{workspace.profile.name} is here.</h1>
        <p>
          {workspace.entity
            ? `${activeMemories(workspace.memories).length} current memories. ${workspace.entity.tasks.filter((t) => t.state === 'open').length} little plans.`
            : 'Finding where we left off…'}
        </p>
        <div className="location-buttons">
          {(['center', 'desk', 'window'] as Zone[]).map((z) => (
            <button
              key={z}
              disabled={disabled}
              aria-pressed={workspace.entity?.zone === z}
              onClick={() => move(z)}
            >
              <Move size={13} />
              {z}
            </button>
          ))}
        </div>
        <button
          className="companion-greeting"
          disabled={disabled}
          onClick={() => setGreeting((n) => n + 1)}
        >
          <Hand size={15} /> Wave hello
        </button>
        <button
          className="identity-hint"
          disabled={disabled}
          onClick={() => setPanel('identity')}
        >
          She / her · AI companion · Make her your own
          <ArrowUpRight size={12} />
        </button>
      </div>
      <div className="space-tool-dock">
        <button disabled={disabled} onClick={() => setPanel('tasks')}>
          <ListTodo size={19} />
          <span>Tasks</span>
          {!!workspace.entity?.tasks.filter((t) => t.state === 'open')
            .length && (
            <b>
              {workspace.entity.tasks.filter((t) => t.state === 'open').length}
            </b>
          )}
        </button>
        <button disabled={disabled} onClick={() => setPanel('notes')}>
          <StickyNote size={19} />
          <span>Notes</span>
        </button>
        <button disabled={disabled} onClick={() => setPanel('activity')}>
          <History size={19} />
          <span>Activity</span>
        </button>
        <button disabled={!ready} onClick={() => setRuntimeOpen(true)}>
          <Activity size={19} />
          <span>Runtime</span>
        </button>
        <button onClick={() => setPanel('conversation')}>
          <MessageCircle size={19} />
          <span>Conversation</span>
        </button>
        <Link href="/lab">
          <Boxes size={19} />
          <span>Experiments</span>
        </Link>
      </div>
      {recentNote && (
        <button className="world-note-peek" onClick={() => setPanel('notes')}>
          <span>
            <StickyNote size={13} />
            LEFT AT {recentNote.zone.toUpperCase()}
          </span>
          <p>{recentNote.text}</p>
          <small>
            Open notes
            <ArrowUpRight size={12} />
          </small>
        </button>
      )}
      <div className="space-composer">
        {busy && connection.provider === 'site' ? (
          <div className="agent-speech site-streaming-speech">
            <span>
              {workspace.profile.name} ·{' '}
              {streamingText ? 'Responding' : 'Thinking…'}
            </span>
            <p>{streamingText || 'Taking a moment with your story.'}</p>
            <small>Changes are pending until the response is complete.</small>
          </div>
        ) : !dismissed && last ? (
          <div className="agent-speech">
            <div>
              <span>
                {workspace.profile.name} ·{' '}
                {last.mode === 'demo' ? 'Demo reply' : 'Model reply'}
              </span>
              <button
                aria-label="Dismiss reply"
                onClick={() => setDismissed(true)}
              >
                <X size={14} />
              </button>
            </div>
            <p>{last.text}</p>
            <button onClick={() => setPanel('conversation')}>
              Open conversation
              <ArrowUpRight size={12} />
            </button>
          </div>
        ) : (
          <p className="space-welcome">
            {busy
              ? 'Thinking about what you said…'
              : 'Hi, you. Tell me about your day.'}
          </p>
        )}
        {!last && !busy && (
          <div className="companion-prompts" aria-label="Conversation starters">
            {['I’m home', 'Keep me company', 'Let’s plan our evening'].map(
              (prompt) => (
                <button
                  key={prompt}
                  disabled={disabled}
                  onClick={() => {
                    setMessage(prompt);
                    composer.current?.focus();
                  }}
                >
                  {prompt}
                </button>
              ),
            )}
          </div>
        )}
        {notice && (
          <div className="space-notice" role="alert">
            <p>{notice}</p>
            <button aria-label="Dismiss notice" onClick={() => setNotice('')}>
              <X size={14} />
            </button>
          </div>
        )}
        <form
          className="space-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            ref={composer}
            aria-label={`Message ${workspace.profile.name}`}
            disabled={!ready}
            maxLength={3000}
            placeholder={
              connection.provider === 'demo'
                ? 'Say “I’m home” or “Remember: …”'
                : `Talk to ${workspace.profile.name}…`
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {busy ? (
            <Button type="button" aria-label="Stop response" onClick={stop}>
              <Square size={16} />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={disabled || !message.trim()}
              aria-label="Send message"
            >
              <ArrowUp size={18} />
            </Button>
          )}
        </form>
        <div className="space-composer-meta">
          <button disabled={disabled} onClick={() => setConnectionOpen(true)}>
            {modelLabel}
            {connection.provider !== 'demo' &&
            connection.provider !== 'site' &&
            !verified
              ? ' · Unverified key/model'
              : ''}
          </button>
          <span>
            {connection.provider === 'site' &&
            site?.remaining !== null &&
            site?.remaining !== undefined
              ? `${site.remaining} messages left today`
              : usage !== null
                ? `${usage.toLocaleString('en-US')} tokens · last request`
                : 'No background inference'}
          </span>
        </div>
      </div>
      <output
        className={`space-save ${error || draftWarning ? 'has-error' : ''}`}
      >
        <span />
        {error || draftWarning || status}
        {(error || draftWarning) && (
          <>
            <button
              onClick={() => void retry().catch((e) => setNotice(e.message))}
            >
              Retry
            </button>
            <button onClick={() => downloadAgent(workspace)}>
              Export draft
            </button>
          </>
        )}
      </output>
      <div className="space-surface-label">VIRTUAL DESKTOP · DRAG TO ORBIT</div>
      <MemoryDialog
        open={memory}
        onOpenChange={setMemory}
        workspace={workspace}
        setWorkspace={setWorkspace}
      />
      <RuntimeInspector
        open={runtimeOpen}
        onOpenChange={setRuntimeOpen}
        workspace={workspace}
        busy={busy}
      />
      <AgentPanels
        access={access}
        panel={panel}
        onClose={() => setPanel(null)}
        workspace={workspace}
        setWorkspace={setWorkspace}
        onError={setNotice}
        onImport={importAgent}
      />
      <AgentConnectionDialog
        open={connectionOpen}
        onOpenChange={setConnectionOpen}
        connection={connection}
        onConnect={connect}
        site={site}
      />
    </main>
  );
}
