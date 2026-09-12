'use client';
import Link from 'next/link';
import Image from 'next/image';
import ZuriPresence from '@/components/zuri-presence';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowUp,
  Square,
  RotateCcw,
  Play,
  Pause,
  Download,
  Plug,
  Check,
  Camera,
} from 'lucide-react';
import { FieldMark } from '@/components/field-brand';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import DeskScene from '@/components/desk-scene';
import { ZURI } from '@/lib/companion-character';
import {
  DESK_STAGES,
  pending,
  type DeskView,
  type TaskStatus,
} from '@/lib/desk';

const statusText: Record<TaskStatus, string> = {
  queued: 'Queued',
  running: 'In motion',
  awaiting_verification: 'Review placement',
  succeeded: 'Placed',
  failed: 'Not completed',
  stopping: 'Stopping requested',
  stopped: 'Stopped',
  needs_attention: 'Needs attention',
};
const clock = (n: number) =>
  new Date(n).toLocaleTimeString('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
export default function Desk() {
  const [desk, setDesk] = useState<DeskView | null>(null),
    [error, setError] = useState('');
  const [input, setInput] = useState(''),
    [saving, setSaving] = useState(false),
    [connection, setConnection] = useState(false),
    [key, setKey] = useState('');
  const [selected, setSelected] = useState<string | null>(null),
    [replay, setReplay] = useState<number | null>(null),
    [playing, setPlaying] = useState(false);
  const request = useRef<{ instruction: string; id: string } | null>(null),
    inFlight = useRef(false),
    version = useRef(0);
  const alive = useRef(true),
    polling = useRef(false);
  const [connectionError, setConnectionError] = useState('');
  const refresh = async () => {
    if (inFlight.current || polling.current) return;
    polling.current = true;
    const epoch = version.current;
    try {
      const r = await fetch('/api/desk', {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      const data = (await r.json()) as DeskView & { error?: string };
      if (!r.ok) throw new Error(data.error || 'The desk is unavailable.');
      if (alive.current && epoch === version.current) {
        setDesk(data);
        setConnectionError('');
      }
    } catch {
      if (alive.current && epoch === version.current)
        setConnectionError(
          'Connection interrupted. The last confirmed state is shown.',
        );
    } finally {
      polling.current = false;
    }
  };
  useEffect(() => {
    alive.current = true;
    queueMicrotask(() => {
      if (alive.current) void refresh();
    });
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 1200);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  const change = async (body: Record<string, unknown>) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    version.current++;
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/desk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const data = (await r.json()) as {
        desk: DeskView;
        error?: string;
        pairingKey?: string;
      };
      if (!r.ok)
        throw new Error(data.error || 'This change was not confirmed.');
      if (alive.current) {
        setDesk(data.desk);
        if (data.pairingKey) setKey(data.pairingKey);
      }
      return true;
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : 'This change was not confirmed.',
        );
      return false;
    } finally {
      inFlight.current = false;
      version.current++;
      if (alive.current) setSaving(false);
    }
  };
  const send = async () => {
    if (!input.trim() || saving) return;
    const instruction = input.trim();
    if (request.current?.instruction !== instruction)
      request.current = { id: crypto.randomUUID(), instruction };
    if (await change({ action: 'start', ...request.current })) {
      setSelected(request.current!.id);
      setInput('');
      setReplay(null);
      request.current = null;
    }
  };
  const active = desk?.tasks.find(pending);
  const task =
    desk?.tasks.find((t) => t.id === selected) || active || desk?.tasks.at(-1);
  const frames =
    task?.events.filter((e) => e.world || e.observation?.imageUrl) || [];
  useEffect(() => {
    if (!playing || !frames.length) return;
    const timer = setInterval(
      () =>
        setReplay((n) => {
          const next = (n ?? -1) + 1;
          if (next >= frames.length) {
            setPlaying(false);
            return frames.length - 1;
          }
          return next;
        }),
      900,
    );
    return () => clearInterval(timer);
  }, [playing, frames.length]);
  const evidence =
    replay === null ? null : frames[Math.min(replay, frames.length - 1)];
  const world = evidence?.world || desk?.world;
  const viewMode = evidence
    ? evidence.world
      ? 'virtual'
      : 'physical'
    : desk?.device.mode;
  const image = evidence
    ? evidence.observation?.imageUrl
    : desk?.device.mode === 'physical'
      ? desk.observation?.imageUrl
      : undefined;
  const exportRecord = () => {
    if (!task) return;
    const file = new Blob(
      [JSON.stringify({ character: ZURI.name, task }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(file),
      link = document.createElement('a');
    link.href = url;
    link.download = `field-task-${task.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main className="desk-page">
      <header className="desk-header">
        <Link href="/" className="desk-brand" aria-label="Field home">
          <FieldMark />
          <span>FIELD</span>
        </Link>
        <nav aria-label="Field navigation">
          <Link href="/space">Space</Link>
          <span aria-current="page">Desk</span>
          <Link href="/docs">
            Documentation <ArrowUpRight size={14} />
          </Link>
        </nav>
        <Button variant="ghost" onClick={() => setConnection(true)}>
          <Plug size={16} /> Connection
        </Button>
      </header>
      <div className="desk-heading">
        <div>
          <p className="desk-eyebrow">FIELD / DESK</p>
          <h1>
            Zuri’s desk<span>.</span>
          </h1>
        </div>
        <p>
          A thought, a small movement.
          <br />A place for things to happen.
        </p>
      </div>
      <div className="desk-workbench">
        <section className="desk-stage" aria-label="Desk workspace">
          <div className="desk-stage-bar">
            <span>{replay !== null ? 'Recorded view' : 'Workspace view'}</span>
            <span>{desk ? desk.device.name : 'Opening desk…'}</span>
          </div>
          <div className="desk-stage-view">
            {image ? (
              <Image
                fill
                style={{ objectFit: 'contain' }}
                unoptimized
                sizes="(max-width: 760px) 100vw, 65vw"
                className="desk-camera-frame"
                src={image}
                alt="Desk camera observation"
                referrerPolicy="no-referrer"
              />
            ) : viewMode === 'physical' ? (
              <div className="desk-camera-empty">
                <Camera size={32} />
                <p>Waiting for a camera frame</p>
                <span>The connected device supplies this view.</span>
              </div>
            ) : world ? (
              <DeskScene world={world} />
            ) : (
              <div className="desk-camera-empty">
                <p>Opening your desk…</p>
              </div>
            )}
            {evidence && (
              <span className="desk-frame-time">
                {clock(evidence.observation?.capturedAt ?? evidence.at)}
              </span>
            )}
          </div>
          <div className="desk-stage-controls">
            <Button
              variant="ghost"
              disabled={
                !desk ||
                saving ||
                desk.device.mode !== 'virtual' ||
                replay !== null
              }
              onClick={() => void change({ action: 'rearrange' })}
            >
              <RotateCcw size={15} /> Rearrange objects
            </Button>
            <span>
              {desk?.device.mode === 'virtual'
                ? 'Drag to look around'
                : desk?.observation
                  ? `Last frame ${clock(desk.observation.capturedAt)}`
                  : 'No camera connected'}
            </span>
          </div>
          <div className="desk-replay">
            <Button
              variant="ghost"
              aria-label={playing ? 'Pause replay' : 'Replay task'}
              disabled={!frames.length}
              onClick={() => {
                if (
                  !playing &&
                  (replay === null || replay >= frames.length - 1)
                )
                  setReplay(0);
                setPlaying((v) => !v);
              }}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </Button>
            <Slider
              aria-label="Recorded task frame"
              min={0}
              max={Math.max(1, frames.length - 1)}
              step={1}
              value={[replay ?? Math.max(0, frames.length - 1)]}
              disabled={!frames.length}
              onValueChange={(v) => {
                setReplay(Array.isArray(v) ? v[0] : v);
                setPlaying(false);
              }}
            />
            <Button
              variant="ghost"
              onClick={() => {
                setReplay(null);
                setPlaying(false);
              }}
            >
              Now
            </Button>
          </div>
        </section>
        <aside className="desk-conversation">
          <ZuriPresence
            compact
            status={
              active ? statusText[active.status] : 'What shall we put in place?'
            }
          />
          <label htmlFor="desk-request" className="sr-only">
            Your request to Zuri
          </label>
          <Textarea
            id="desk-request"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={240}
            placeholder="Zuri, put the green cup on the tray."
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
          <div className="desk-suggestions">
            {['green', 'violet', 'coral'].map((color) => (
              <button
                key={color}
                disabled={!!active || saving}
                onClick={() =>
                  setInput(`Zuri, put the ${color} cup on the tray.`)
                }
              >
                <span
                  style={{
                    background:
                      color === 'green'
                        ? '#6a997b'
                        : color === 'violet'
                          ? '#8758d6'
                          : '#c57661',
                  }}
                />
                {color} cup
              </button>
            ))}
          </div>
          <Button
            className="desk-send"
            disabled={
              !desk ||
              !desk.device.online ||
              saving ||
              !!active ||
              !input.trim()
            }
            onClick={() => void send()}
          >
            Send to Zuri <ArrowUp size={17} />
          </Button>
          {(error || connectionError) && (
            <p className="desk-error" role="alert">
              {error || connectionError}{' '}
              <button onClick={() => void refresh()}>Refresh</button>
            </p>
          )}
          <div className="desk-current" aria-live="polite">
            <div className="desk-section-label">
              {task ? 'THE CURRENT THREAD' : 'READY WHEN YOU ARE'}
              {task && <span>{statusText[task.status]}</span>}
            </div>
            {task ? (
              <>
                <h2>{task.instruction}</h2>
                <ol className="desk-steps">
                  {DESK_STAGES.map((label, i) => (
                    <li
                      key={label}
                      data-passed={
                        task.status === 'succeeded' ||
                        (task.mode === 'virtual' && task.stage > i)
                      }
                      data-current={
                        task.status === 'running' && task.stage === i
                      }
                    >
                      <span>
                        {task.status === 'succeeded' ||
                        (task.mode === 'virtual' && task.stage > i) ? (
                          <Check size={12} />
                        ) : (
                          String(i + 1).padStart(2, '0')
                        )}
                      </span>
                      {label}
                    </li>
                  ))}
                </ol>
                <p>{task.events.at(-1)?.text}</p>
                {pending(task) && (
                  <Button
                    variant="outline"
                    disabled={saving || task.status === 'stopping'}
                    onClick={() => void change({ action: 'stop', id: task.id })}
                  >
                    <Square size={13} />
                    {task.mode === 'physical' ? 'Request stop' : 'Stop task'}
                  </Button>
                )}
                {task.status === 'awaiting_verification' && (
                  <div className="desk-review">
                    <Button
                      disabled={saving}
                      onClick={() =>
                        void change({
                          action: 'review',
                          id: task.id,
                          accepted: true,
                        })
                      }
                    >
                      Confirm placement
                    </Button>
                    <Button
                      variant="outline"
                      disabled={saving}
                      onClick={() =>
                        void change({
                          action: 'review',
                          id: task.id,
                          accepted: false,
                        })
                      }
                    >
                      Reject placement
                    </Button>
                  </div>
                )}
                {['needs_attention', 'stopping'].includes(task.status) &&
                  task.mode === 'physical' && (
                    <Button
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        if (
                          window.confirm(
                            'Confirm that you have checked the physical device and it is stopped. This closes the task without certifying placement.',
                          )
                        )
                          void change({
                            action: 'resolve',
                            id: task.id,
                            deviceStopped: true,
                          });
                      }}
                    >
                      I have checked the device is stopped
                    </Button>
                  )}
              </>
            ) : (
              <p>
                Choose a cup above, or write where you want it to go. Every task
                keeps its own record.
              </p>
            )}
          </div>
        </aside>
      </div>
      <section className="desk-records">
        <div className="desk-record-heading">
          <div>
            <p className="desk-eyebrow">A TRACE OF WHAT HAPPENED</p>
            <h2>Nothing lost between moves.</h2>
          </div>
          <Button variant="outline" disabled={!task} onClick={exportRecord}>
            <Download size={15} /> Export record
          </Button>
        </div>
        <div className="desk-record-grid">
          <div className="desk-task-list">
            {desk?.tasks.length ? (
              [...desk.tasks].reverse().map((t) => (
                <button
                  key={t.id}
                  data-selected={task?.id === t.id}
                  onClick={() => {
                    setSelected(t.id);
                    setReplay(null);
                    setPlaying(false);
                  }}
                >
                  <span>{t.instruction}</span>
                  <small>
                    {new Date(t.createdAt).toLocaleDateString('en', {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    · {clock(t.createdAt)}
                  </small>
                  <em>{statusText[t.status]}</em>
                </button>
              ))
            ) : (
              <p>Your first task will appear here.</p>
            )}
          </div>
          <ol className="desk-event-list">
            {task?.events.map((e, i) => (
              <li key={`${task.id}-${i}`}>
                <time>{clock(e.at)}</time>
                <p>{e.text}</p>
                {e.observation?.recordingUrl && (
                  <a
                    href={e.observation.recordingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open recording <ArrowUpRight size={12} />
                  </a>
                )}
              </li>
            )) || (
              <li>
                <p>Instructions, observations and outcomes stay together.</p>
              </li>
            )}
          </ol>
        </div>
      </section>
      <footer className="desk-footer">
        <span>FIELD</span>
        <Link href="/space">
          Back to Zuri’s space <ArrowUpRight size={15} />
        </Link>
      </footer>
      <Dialog
        open={connection}
        onOpenChange={(v) => {
          setConnection(v);
          if (!v) setKey('');
        }}
      >
        <DialogContent className="desk-connection">
          <DialogHeader>
            <DialogTitle>Connect a desk</DialogTitle>
            <DialogDescription>
              Your workspace and a physical device have separate execution
              paths.
            </DialogDescription>
          </DialogHeader>
          <dl>
            <dt>Current workspace</dt>
            <dd>
              {desk?.device.mode === 'physical'
                ? 'Physical desk'
                : 'Virtual desk'}
            </dd>
            <dt>Connection</dt>
            <dd>
              {desk?.device.mode === 'physical'
                ? desk.device.online
                  ? 'Device connected'
                  : 'Waiting for the device'
                : 'Local workspace controller'}
            </dd>
          </dl>
          <p>
            A physical desk needs a local bridge connected to its cameras and
            robot controller. Pairing credentials stay private to this
            workspace.
          </p>
          <div className="desk-review">
            <Button
              disabled={saving || !!active}
              onClick={() => void change({ action: 'pair' })}
            >
              Pair a physical desk
            </Button>
            <Button
              variant="outline"
              disabled={saving || !!active}
              onClick={() => {
                setKey('');
                void change({ action: 'virtual' });
              }}
            >
              Use virtual desk
            </Button>
          </div>
          {key && (
            <div className="desk-pairing">
              <label htmlFor="desk-key">Bridge key · shown once</label>
              <input
                id="desk-key"
                type="password"
                value={key}
                readOnly
                autoComplete="off"
              />
              <Button
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(key)
                    .catch(() =>
                      setError(
                        'Copy is unavailable. Select the bridge key manually.',
                      ),
                    )
                }
              >
                Copy bridge key
              </Button>
            </div>
          )}
          <Link href="/docs#physical-desk">
            Connection guide <ArrowUpRight size={14} />
          </Link>
        </DialogContent>
      </Dialog>
    </main>
  );
}
