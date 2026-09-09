'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CircleDot,
  Cpu,
  Layers3,
  Brain,
  Plus,
  GitBranch,
  Pause,
  Play,
  RotateCcw,
  ArrowUp,
  ArrowUpRight,
  SlidersHorizontal,
  Orbit,
  Check,
  Settings2,
  Download,
  X,
  Maximize2,
  Pencil,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  MemoryDialog,
  SettingsDialog,
  exportWorkspace,
  type Connection,
} from '@/components/workspace-dialogs';
import ExperimentScene from '@/components/experiment-scene';
import {
  baselineOf,
  period,
  evidenceMemory,
  formula,
  uid,
  stamp,
  type Parameters,
  type Kind,
} from '@/lib/field';
import { applyActions, demoReply, type Action } from '@/lib/agent';
import { useWorkspace } from '@/hooks/use-workspace';
import { DraftRecovery } from '@/components/draft-recovery';
import { useFieldTools } from '@/hooks/use-field-tools';
export default function Home() {
  const {
    workspace,
    setWorkspace,
    current: workspaceRef,
    ready,
    status,
    error,
    flush,
    retry,
    recovery,
    restoreDraft,
    discardDraft,
    draftWarning,
  } = useWorkspace();
  const [playing, setPlaying] = useState(true),
    [resetKey, setResetKey] = useState(0),
    [comparison, setComparison] = useState(true);
  const [memoryOpen, setMemoryOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [createOpen, setCreateOpen] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [chatError, setChatError] = useState('');
  const [usage, setUsage] = useState<{
      input: number | null;
      output: number | null;
      total: number | null;
    } | null>(null),
    [notice, setNotice] = useState('');
  const [renaming, setRenaming] = useState(false),
    [title, setTitle] = useState('');
  const bottom = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLElement>(null);
  const busyRef = useRef(false);
  const current = workspace.experiments.find(
    (e) => e.id === workspace.selectedId,
  )!;
  const baseline = baselineOf(current);
  const scenes = baseline && comparison ? [baseline, current] : [current];
  const disabled = !ready || busy;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [workspace.messages.length, busy]);
  useEffect(() => {
    if (notice) {
      const timeout = setTimeout(() => setNotice(''), 4000);
      return () => clearTimeout(timeout);
    }
  }, [notice]);
  const change = (actions: Action[]) => {
    if (busyRef.current)
      throw new Error(
        'Wait for the current response before changing this experiment.',
      );
    setWorkspace((w) => applyActions(w, actions));
    setComparison(true);
    setResetKey((k) => k + 1);
  };
  const keep = (id: string) => {
    const w = workspaceRef.current;
    const e = w.experiments.find((item) => item.id === id);
    if (!e) throw new Error('Experiment not found.');
    if (w.memories.length >= 200)
      throw new Error(
        'Memory is full. Export or remove an older memory first.',
      );
    const memory = evidenceMemory(e);
    const existing = w.memories.find(
      (m) =>
        m.evidence?.experimentId === e.id &&
        JSON.stringify(m.evidence.params) === JSON.stringify(e.params),
    );
    if (existing) {
      setNotice('This finding is already in Memory.');
      return existing;
    }
    setWorkspace((state) => ({
      ...state,
      memories: [...state.memories, memory],
    }));
    setNotice('Finding kept with its evidence.');
    return memory;
  };
  useFieldTools(
    {
      read: () => workspaceRef.current,
      apply: async (actions) => {
        change(actions);
        await flush();
        const w = workspaceRef.current;
        return {
          selectedId: w.selectedId,
          experiment: w.experiments.find((e) => e.id === w.selectedId),
          saved: true,
        };
      },
      keep: async (id) => {
        if (busyRef.current) throw new Error('Wait for the current response.');
        const memory = keep(id);
        await flush();
        return { memory, saved: true };
      },
    },
    ready,
  );
  const update = (key: keyof Parameters, value: number) =>
    setWorkspace((w) => ({
      ...w,
      experiments: w.experiments.map((e) =>
        e.id === current.id
          ? { ...e, params: { ...e.params, [key]: value } }
          : e,
      ),
    }));
  const branch = () => {
    try {
      change([{ type: 'branch', experimentId: current.id }]);
    } catch (e) {
      setChatError((e as Error).message);
    }
  };
  const add = (kind: Kind) => {
    try {
      change([{ type: 'create', kind }]);
      setCreateOpen(false);
    } catch (e) {
      setChatError((e as Error).message);
    }
  };
  const send = async (value = message) => {
    if (!ready || busyRef.current || !value.trim()) return;
    const text = value.trim().slice(0, 3000);
    const memoryVersion = workspaceRef.current.memoryVersion || 0;
    const mode =
      connection && !/^remember\s*[: ,]/i.test(text) ? 'model' : 'demo';
    setMessage('');
    setChatError('');
    setBusy(true);
    busyRef.current = true;
    setWorkspace((w) => ({
      ...w,
      messages: [
        ...w.messages,
        {
          id: uid(),
          role: 'user',
          text,
          createdAt: stamp(),
          mode,
          memoryVersion,
        },
      ].slice(-250) as typeof w.messages,
    }));
    try {
      let reply: string;
      if (mode === 'model' && connection) {
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: connection.key,
            model: connection.model,
            workspace: workspaceRef.current,
            message: text,
          }),
          signal: AbortSignal.timeout(55000),
        });
        const data = (await response.json()) as {
          error?: string;
          reply: string;
          actions: Action[];
          usage: {
            input: number | null;
            output: number | null;
            total: number | null;
          };
        };
        if (!response.ok)
          throw new Error(data.error || 'Could not reach the model.');
        if ((workspaceRef.current.memoryVersion || 0) !== memoryVersion)
          throw new Error(
            'Memory context changed. Send your message again to use the current understanding.',
          );
        const next = applyActions(workspaceRef.current, data.actions);
        setWorkspace(next);
        reply = data.reply;
        setUsage(data.usage);
        if (data.actions.length) {
          setResetKey((k) => k + 1);
          setComparison(true);
        }
      } else {
        const result = demoReply(text, workspaceRef.current);
        setWorkspace(result.workspace);
        reply = result.reply;
        setUsage(null);
        setResetKey((k) => k + 1);
        setComparison(true);
      }
      setWorkspace((w) => ({
        ...w,
        messages: [
          ...w.messages,
          {
            id: uid(),
            role: 'assistant',
            text: reply,
            createdAt: stamp(),
            mode,
            memoryVersion,
          },
        ].slice(-250) as typeof w.messages,
      }));
    } catch (e) {
      setChatError(
        e instanceof Error ? e.message : 'Could not complete the request.',
      );
      setMessage(text);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };
  const controls: {
    key: keyof Parameters;
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
  }[] =
    current.kind === 'pendulum'
      ? [
          {
            key: 'length',
            label: 'Length',
            unit: 'm',
            min: 0.3,
            max: 2.6,
            step: 0.1,
          },
          {
            key: 'gravity',
            label: 'Gravity',
            unit: 'm/s²',
            min: 0.5,
            max: 20,
            step: 0.01,
          },
          {
            key: 'amplitude',
            label: 'Release angle',
            unit: '°',
            min: 1,
            max: 20,
            step: 1,
          },
        ]
      : [
          {
            key: 'mass',
            label: 'Mass',
            unit: 'kg',
            min: 0.2,
            max: 5,
            step: 0.1,
          },
          {
            key: 'stiffness',
            label: 'Stiffness',
            unit: 'N/m',
            min: 2,
            max: 40,
            step: 1,
          },
          {
            key: 'amplitude',
            label: 'Amplitude',
            unit: 'cm',
            min: 1,
            max: 20,
            step: 1,
          },
        ];
  return (
    <SidebarProvider
      className="field-shell"
      style={{ '--sidebar-width': '224px' } as React.CSSProperties}
    >
      <header className="topbar">
        <div className="brand">
          <CircleDot size={30} />
          <strong>
            field<span>.</span>
          </strong>
          <span className="lab-tag">LAB 01</span>
        </div>
        <div className="breadcrumb">
          Personal workspace <span>/</span>{' '}
          <Link href="/space">Back to your agent ↗</Link>
        </div>
        <div className="top-actions">
          <Link href="/space" className="back-to-agent">
            ← Agent
          </Link>
          <output className={`save-state ${error ? 'save-error' : ''}`}>
            <span />
            {status}
          </output>
          <Button
            className="connect-button"
            variant="outline"
            onClick={() => setSettingsOpen(true)}
            disabled={!ready}
          >
            <Cpu size={14} />
            {connection ? 'Model ready' : 'Connect model'}
          </Button>
          <span className="avatar">Y</span>
        </div>
      </header>
      <Sidebar className="field-sidebar">
        <SidebarHeader>
          <div className="agent-id">
            <div className="agent-mark">
              <span aria-hidden="true">
                {workspace.profile.name.slice(0, 1).toUpperCase()}
              </span>
            </div>
            <h2>{workspace.profile.name}</h2>
            <p>Your persistent collaborator</p>
            <span className="mode-tag">
              {connection ? 'Model mode' : 'Demo mode'}
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive
                onClick={() =>
                  stage.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  })
                }
              >
                <Layers3 />
                Spatial studio
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled={disabled}
                onClick={() => setMemoryOpen(true)}
              >
                <Brain />
                Memory{' '}
                <span className="nav-count">{workspace.memories.length}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="sidebar-label">
            EXPERIMENTS{' '}
            <button
              disabled={disabled || workspace.experiments.length >= 80}
              aria-label="New experiment"
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={16} />
            </button>
          </div>
          <SidebarMenu>
            {workspace.experiments.map((e) => (
              <SidebarMenuItem key={e.id}>
                <SidebarMenuButton
                  disabled={disabled}
                  isActive={e.id === current.id}
                  title={e.title}
                  onClick={() => {
                    setWorkspace((w) => ({ ...w, selectedId: e.id }));
                    setComparison(true);
                    setRenaming(false);
                    setResetKey((k) => k + 1);
                  }}
                >
                  <span className="color-dot" style={{ background: e.color }} />
                  <span>{e.title}</span>
                  {e.parentId && (
                    <GitBranch className="branch-mark" size={12} />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <p className="sidebar-note">
            A place for ideas
            <br />
            to become tangible.
          </p>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                disabled={disabled}
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 />
                Identity & model
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => exportWorkspace(workspace)}>
                <Download />
                Export workspace
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <span className="small-label release-label">
            FIELD / EXPERIMENTAL RELEASE
          </span>
        </SidebarFooter>
      </Sidebar>
      <main className="main-content">
        <DraftRecovery
          recovery={recovery}
          onRestore={restoreDraft}
          onDiscard={discardDraft}
        />
        <div className="studio">
          {(error || draftWarning) && (
            <div className="error-banner" role="alert">
              <p>{error || draftWarning}</p>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void retry().catch(() => {})}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => exportWorkspace(workspace)}
                >
                  Export draft
                </Button>
              </div>
            </div>
          )}
          <div className="studio-heading">
            <div>
              <p className="eyebrow">
                <SidebarTrigger /> YOUR EXPLORATION SPACE
              </p>
              {renaming ? (
                <form
                  className="rename-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (title.trim()) {
                      setWorkspace((w) => ({
                        ...w,
                        experiments: w.experiments.map((e) =>
                          e.id === current.id
                            ? { ...e, title: title.trim() }
                            : e,
                        ),
                      }));
                      setRenaming(false);
                    }
                  }}
                >
                  <Input
                    aria-label="Experiment title"
                    value={title}
                    maxLength={120}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="Save title"
                    disabled={!title.trim()}
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Cancel rename"
                    onClick={() => setRenaming(false)}
                  >
                    <X size={16} />
                  </Button>
                </form>
              ) : (
                <h1>
                  {current.title}
                  <button
                    disabled={disabled}
                    aria-label="Rename experiment"
                    onClick={() => {
                      setTitle(current.title);
                      setRenaming(true);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                </h1>
              )}
              <p>One question. A world of possibilities.</p>
            </div>
            <Button
              disabled={disabled || workspace.experiments.length >= 80}
              variant="outline"
              onClick={branch}
            >
              <GitBranch size={16} />
              Branch & compare
            </Button>
          </div>
          <section className="experiment-stage" ref={stage}>
            <div className="stage-top">
              <span className="live-tag">
                <span />
                {playing ? 'LIVE EXPERIMENT' : 'PAUSED'}
              </span>
              <span className="stage-model">
                {current.kind === 'pendulum'
                  ? 'Simple harmonic motion'
                  : 'Hooke’s law'}
              </span>
            </div>
            <ExperimentScene
              experiments={scenes}
              playing={playing}
              resetKey={resetKey}
            />
            <div className="experiment-labels">
              {scenes.map((e, i) => (
                <div key={e.id}>
                  <span className="color-dot" style={{ background: e.color }} />
                  <strong>
                    {scenes.length > 1
                      ? i === 0
                        ? 'Frozen baseline'
                        : 'Your variation'
                      : current.kind === 'pendulum'
                        ? 'Pendulum'
                        : 'Spring'}
                  </strong>
                  <span>{period(e).toFixed(2)} s / cycle</span>
                </div>
              ))}
            </div>
            <div className="stage-toolbar">
              <div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={playing ? 'Pause simulation' : 'Play simulation'}
                  onClick={() => setPlaying(!playing)}
                >
                  {playing ? <Pause /> : <Play />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Restart simulation"
                  onClick={() => setResetKey((k) => k + 1)}
                >
                  <RotateCcw />
                </Button>
                {baseline ? (
                  <button
                    className="comparison-toggle"
                    onClick={() => {
                      setComparison(!comparison);
                      setResetKey((k) => k + 1);
                    }}
                  >
                    {comparison ? 'Hide baseline' : 'Show baseline'}
                  </button>
                ) : (
                  <span>Real-time simulation</span>
                )}
              </div>
              <span>
                <Orbit size={15} /> Drag to orbit · Scroll to zoom
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Expand experiment"
                onClick={() => {
                  if (document.fullscreenElement)
                    void document.exitFullscreen();
                  else
                    void stage.current
                      ?.requestFullscreen?.()
                      .catch(() =>
                        setNotice('Fullscreen is unavailable in this view.'),
                      );
                }}
              >
                <Maximize2 size={15} />
              </Button>
            </div>
          </section>
          <section className="parameters">
            <div className="section-title">
              <SlidersHorizontal size={16} />
              <h2>Make it your experiment</h2>
              <span>
                {baseline
                  ? 'Only your variation changes'
                  : 'Try changing one variable'}
              </span>
            </div>
            <div className="parameter-grid">
              {controls.map((c) => (
                <div className="parameter" key={c.key}>
                  <div>
                    <label>{c.label}</label>
                    <output>
                      {current.params[c.key]} <span>{c.unit}</span>
                    </output>
                  </div>
                  <Slider
                    disabled={disabled}
                    aria-label={c.label}
                    value={[current.params[c.key]]}
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    onValueChange={(v) =>
                      update(c.key, Array.isArray(v) ? v[0] : (v as number))
                    }
                  />
                  <div className="range-label">
                    <span>
                      {c.min} {c.unit}
                    </span>
                    <span>
                      {c.max} {c.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="finding">
            <div className="finding-icon">
              <Orbit size={20} />
            </div>
            <div>
              <p className="eyebrow">FROM THIS EXPERIMENT</p>
              <h3>
                {baseline
                  ? `${(period(current) / period(baseline)).toFixed(2)}× the baseline period`
                  : 'Every cycle tells a story.'}
              </h3>
              <p>
                {formula(current.kind)} · Current period{' '}
                <strong>{period(current).toFixed(3)} seconds</strong>.
              </p>
              <span className="small-label">
                {current.kind === 'pendulum'
                  ? 'Ideal small-angle model'
                  : 'Ideal linear spring'}{' '}
                · Calculated, not measured
              </span>
            </div>
            <Button
              disabled={disabled || workspace.memories.length >= 200}
              variant="ghost"
              onClick={() => {
                try {
                  keep(current.id);
                } catch (e) {
                  setNotice((e as Error).message);
                }
              }}
            >
              <Brain size={16} />
              Keep finding <ArrowUpRight size={14} />
            </Button>
          </section>
          <footer className="studio-footer">
            <button disabled={disabled} onClick={() => setMemoryOpen(true)}>
              <Check size={14} />
              {workspace.memories.length} memories kept{' '}
              <ArrowUpRight size={12} />
            </button>
            <span>Curiosity is a good starting point.</span>
          </footer>
          <div className="mobile-tools">
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={16} />
              New experiment
            </Button>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => setMemoryOpen(true)}
            >
              <Brain size={16} />
              Memory
            </Button>
          </div>
        </div>
        <aside className="conversation">
          <div className="conversation-heading">
            <div>
              <h2>Think with {workspace.profile.name}</h2>
              <p>
                {connection
                  ? 'Model responses · Check the evidence'
                  : 'Demo mode · Guided exploration'}
              </p>
            </div>
            <span className="online-dot" />
          </div>
          <div className="chat-history">
            <div className="day-label">FOLLOW YOUR CURIOSITY</div>
            {workspace.messages.map((m) => (
              <div
                className={
                  m.role === 'assistant' ? 'assistant-message' : 'user-message'
                }
                key={m.id}
              >
                <span className="message-name">
                  {m.role === 'assistant' ? workspace.profile.name : 'You'}
                  {m.role === 'assistant' && (
                    <span>{m.mode === 'demo' ? 'DEMO' : 'MODEL'}</span>
                  )}
                </span>
                <p>{m.text}</p>
                {m.id === 'welcome' && (
                  <div className="context-card">
                    <span
                      className="color-dot"
                      style={{ background: '#baa8ff' }}
                    />
                    <div>
                      <strong>A pendulum, in motion</strong>
                      <p>Interactive · Ideal model</p>
                    </div>
                    <CircleDot size={20} />
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <output className="thinking">
                <Loader2 size={14} className="animate-spin" />
                {connection
                  ? 'Thinking with your experiment…'
                  : 'Working through the experiment…'}
              </output>
            )}
            <div ref={bottom} />
          </div>
          <div className="chat-bottom">
            {workspace.messages.length < 4 && (
              <>
                <p className="small-label">A LITTLE INSPIRATION</p>
                <button
                  disabled={disabled}
                  className="suggestion"
                  onClick={() =>
                    void send(
                      current.kind === 'pendulum'
                        ? 'Try Moon gravity'
                        : 'Set stiffness to 24',
                    )
                  }
                >
                  <GitBranch size={15} />
                  {current.kind === 'pendulum'
                    ? 'What if we tried Moon gravity?'
                    : 'What if the spring were stiffer?'}
                  <ArrowUpRight size={14} />
                </button>
                <button
                  disabled={disabled}
                  className="suggestion"
                  onClick={() => void send('Explain the result')}
                >
                  Help me understand this
                  <ArrowUpRight size={14} />
                </button>
              </>
            )}
            {chatError && (
              <p className="chat-error" role="alert">
                {chatError}
              </p>
            )}
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <Textarea
                aria-label={`Message ${workspace.profile.name}`}
                disabled={!ready}
                value={message}
                maxLength={3000}
                placeholder={`Ask, imagine, or say “Remember: …”`}
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
              <div>
                <span>
                  {connection
                    ? 'DeepSeek · Uses your API key'
                    : 'Demo · No model connected'}
                </span>
                <Button
                  type="submit"
                  disabled={disabled || !message.trim()}
                  aria-label="Send message"
                  size="icon"
                >
                  {busy ? (
                    <Loader2 className="animate-spin" size={17} />
                  ) : (
                    <ArrowUp size={17} />
                  )}
                </Button>
              </div>
            </form>
            {usage && usage.total !== null && (
              <p className="usage-note">
                Last request: {usage.input?.toLocaleString('en-US') ?? '—'}{' '}
                input + {usage.output?.toLocaleString('en-US') ?? '—'} output
                tokens
              </p>
            )}
            <div className="chat-footnote">
              <CircleDot size={12} />
              {connection
                ? 'One request per message. No background usage.'
                : 'Connect a model for open-ended conversation.'}
            </div>
          </div>
        </aside>
      </main>
      {notice && (
        <output className="toast-notice">
          <Check size={16} />
          {notice}
        </output>
      )}
      <MemoryDialog
        open={memoryOpen}
        onOpenChange={setMemoryOpen}
        workspace={workspace}
        setWorkspace={setWorkspace}
      />
      <SettingsDialog
        key={workspace.profile.name + workspace.profile.purpose}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        workspace={workspace}
        setWorkspace={setWorkspace}
        connection={connection}
        setConnection={setConnection}
      />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="field-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Start with a question</DialogTitle>
            <DialogDescription>
              Choose a model. Change its variables. See what follows.
            </DialogDescription>
          </DialogHeader>
          <button className="experiment-option" onClick={() => add('pendulum')}>
            <Orbit size={26} />
            <div>
              <h3>Pendulum</h3>
              <p>Explore length, gravity, and the rhythm of a swing.</p>
            </div>
            <ArrowUpRight size={18} />
          </button>
          <button className="experiment-option" onClick={() => add('spring')}>
            <Layers3 size={26} />
            <div>
              <h3>Spring</h3>
              <p>Explore mass, stiffness, and elastic motion.</p>
            </div>
            <ArrowUpRight size={18} />
          </button>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
