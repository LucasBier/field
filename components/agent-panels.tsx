'use client';
import { useState, useRef } from 'react';
import Image from 'next/image';
import { NIA } from '@/lib/companion-character';
import {
  Check,
  Download,
  Upload,
  Plus,
  Trash2,
  ShieldCheck,
  Fingerprint,
  Undo2,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { type Workspace, stamp, uid } from '@/lib/field';
import { applyEntityActions, ensureEntity, receipt } from '@/lib/entity';
import { canonicalWorkspace, validWorkspace } from '@/lib/validation';
import { downloadAgent } from '@/lib/agent-export';
export type Panel =
  | 'tasks'
  | 'notes'
  | 'people'
  | 'activity'
  | 'identity'
  | 'conversation'
  | null;
export default function AgentPanels({
  panel,
  onClose,
  workspace,
  setWorkspace,
  onError,
  onImport,
  access = 'local',
}: {
  panel: Panel;
  onClose: () => void;
  workspace: Workspace;
  setWorkspace: (update: (w: Workspace) => Workspace) => void;
  onError: (s: string) => void;
  onImport: (w: Workspace) => Promise<void>;
  access?: 'guest' | 'local';
}) {
  const [text, setText] = useState(''),
    [person, setPerson] = useState(''),
    [role, setRole] = useState(''),
    [context, setContext] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const [panelError, setPanelError] = useState('');
  const [imported, setImported] = useState<Workspace | null>(null),
    [importing, setImporting] = useState(false),
    [undo, setUndo] = useState<(() => void) | null>(null);
  const names: Record<Exclude<Panel, null>, [string, string]> = {
    tasks: ['Unfinished work', 'Little plans to pick up together.'],
    notes: [
      'Notes in your space',
      'Words left in a place. User and agent actions appear in Activity.',
    ],
    people: [
      'People & relationships',
      'Context you share about the people in your world.',
    ],
    activity: [
      'What actually changed',
      'Saved spatial action records, separate from model prose.',
    ],
    identity: [
      'Your companion',
      'Give her a name and shape the way you spend time together.',
    ],
    conversation: [
      'Your conversation',
      'Your most recent 250 messages, across model connections.',
    ],
  };
  const act = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setPanelError((e as Error).message);
      onError((e as Error).message);
    }
  };
  const readImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    try {
      if (chosen.size > 1_000_000)
        throw new Error('The file is too large. Limit: 1 MB.');
      const data = JSON.parse(await chosen.text());
      if (
        !['field-agent', 'field-workspace'].includes(data.format) ||
        !validWorkspace(data.workspace)
      )
        throw new Error('This is not a valid Field agent export.');
      setImported(ensureEntity(canonicalWorkspace(data.workspace)));
    } catch (e) {
      setPanelError((e as Error).message);
      onError((e as Error).message);
    }
  };
  return (
    <>
      <Sheet
        open={panel !== null}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <SheetContent className="agent-sheet sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{panel ? names[panel][0] : ''}</SheetTitle>
            <SheetDescription>{panel ? names[panel][1] : ''}</SheetDescription>
          </SheetHeader>
          <div className="agent-panel-body">
            {panelError && (
              <p className="panel-error" role="alert">
                {panelError}
              </p>
            )}
            {panel === 'tasks' && (
              <>
                <form
                  className="panel-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(() => {
                      setWorkspace((w) =>
                        applyEntityActions(
                          w,
                          [{ type: 'task', title: text }],
                          'you',
                        ),
                      );
                      setText('');
                    });
                  }}
                >
                  <Input
                    aria-label="New task"
                    value={text}
                    maxLength={240}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Something to return to…"
                  />
                  <Button
                    aria-label="Add task"
                    disabled={
                      !text.trim() ||
                      !workspace.entity ||
                      workspace.entity.tasks.length >= 100
                    }
                  >
                    <Plus size={17} />
                  </Button>
                </form>
                <p className="panel-help">
                  A task is a saved intention. Creating one does not execute
                  work outside Field.
                </p>
                {!workspace.entity?.tasks.length && (
                  <p className="panel-empty">
                    No plans yet. Leave something to look forward to together.
                  </p>
                )}
                {[...(workspace.entity?.tasks || [])].reverse().map((t) => (
                  <article
                    className={`task-row ${t.state === 'done' ? 'done' : ''}`}
                    key={t.id}
                  >
                    <button
                      aria-label={
                        t.state === 'done'
                          ? `Reopen ${t.title}`
                          : `Complete ${t.title}`
                      }
                      className="task-check"
                      aria-pressed={t.state === 'done'}
                      onClick={() =>
                        act(() =>
                          setWorkspace((w) => {
                            if (t.state === 'open')
                              return applyEntityActions(
                                w,
                                [{ type: 'complete_task', taskId: t.id }],
                                'you',
                              );
                            const next = {
                              ...w,
                              entity: {
                                ...w.entity!,
                                tasks: w.entity!.tasks.map((x) =>
                                  x.id === t.id
                                    ? {
                                        id: x.id,
                                        title: x.title,
                                        state: 'open' as const,
                                        createdAt: x.createdAt,
                                      }
                                    : x,
                                ),
                              },
                            };
                            return receipt(
                              next,
                              'reopen_task',
                              `Reopened: ${t.title}`,
                            );
                          }),
                        )
                      }
                    >
                      {t.state === 'done' && <Check size={14} />}
                    </button>
                    <div>
                      <p>{t.title}</p>
                      <small>
                        {t.state === 'done' ? 'Completed' : 'Open'} ·{' '}
                        {new Date(t.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </small>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${t.title}`}
                      onClick={() =>
                        act(() => {
                          setWorkspace((w) =>
                            receipt(
                              {
                                ...w,
                                entity: {
                                  ...w.entity!,
                                  tasks: w.entity!.tasks.filter(
                                    (x) => x.id !== t.id,
                                  ),
                                },
                              },
                              'remove_task',
                              `Removed: ${t.title}`,
                            ),
                          );
                          setUndo(
                            () => () =>
                              setWorkspace((w) => ({
                                ...w,
                                entity: {
                                  ...w.entity!,
                                  tasks: [...w.entity!.tasks, t],
                                },
                              })),
                          );
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </Button>
                  </article>
                ))}
              </>
            )}
            {panel === 'notes' && (
              <>
                <form
                  className="panel-note-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(() => {
                      setWorkspace((w) =>
                        applyEntityActions(
                          w,
                          [{ type: 'note', text, zone: w.entity!.zone }],
                          'you',
                        ),
                      );
                      setText('');
                    });
                  }}
                >
                  <Textarea
                    aria-label="New spatial note"
                    maxLength={1200}
                    placeholder="Leave a thought in this space…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <Button
                    disabled={
                      !text.trim() ||
                      !workspace.entity ||
                      workspace.entity.notes.length >= 40
                    }
                  >
                    Place at {workspace.entity?.zone || 'center'}
                  </Button>
                </form>
                {!workspace.entity?.notes.length && (
                  <p className="panel-empty">Your space is a fresh page.</p>
                )}
                {[...(workspace.entity?.notes || [])].reverse().map((n) => (
                  <article className="spatial-note-card" key={n.id}>
                    <div>
                      <span>{n.zone}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove note"
                        onClick={() =>
                          act(() => {
                            setWorkspace((w) =>
                              receipt(
                                {
                                  ...w,
                                  entity: {
                                    ...w.entity!,
                                    notes: w.entity!.notes.filter(
                                      (x) => x.id !== n.id,
                                    ),
                                  },
                                },
                                'remove_note',
                                `Removed note from ${n.zone}.`,
                              ),
                            );
                            setUndo(
                              () => () =>
                                setWorkspace((w) => ({
                                  ...w,
                                  entity: {
                                    ...w.entity!,
                                    notes: [...w.entity!.notes, n],
                                  },
                                })),
                            );
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <p>{n.text}</p>
                  </article>
                ))}
              </>
            )}
            {panel === 'people' && (
              <>
                <p className="panel-help">
                  These are descriptions you provide, not contacts Field can
                  message. Only add context you want your connected model to
                  receive.
                </p>
                <form
                  className="person-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(() => {
                      setWorkspace((w) =>
                        receipt(
                          {
                            ...w,
                            entity: {
                              ...w.entity!,
                              relationships: [
                                ...w.entity!.relationships,
                                {
                                  id: uid(),
                                  name: person.trim(),
                                  role: role.trim(),
                                  context: context.trim(),
                                  createdAt: stamp(),
                                },
                              ],
                            },
                          },
                          'add_relationship',
                          `Added context about ${person.trim()}.`,
                        ),
                      );
                      setPerson('');
                      setRole('');
                      setContext('');
                    });
                  }}
                >
                  <Input
                    aria-label="Person's name"
                    maxLength={80}
                    placeholder="Name"
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                  />
                  <Input
                    aria-label="Relationship"
                    maxLength={80}
                    placeholder="Relationship, e.g. collaborator"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                  <Textarea
                    aria-label="Relationship context"
                    maxLength={1200}
                    placeholder="What would you like your agent to know?"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                  />
                  <Button
                    disabled={
                      !person.trim() ||
                      !role.trim() ||
                      !workspace.entity ||
                      workspace.entity.relationships.length >= 50
                    }
                  >
                    Keep this relationship
                  </Button>
                </form>
                {workspace.entity?.relationships.map((r) => (
                  <article className="relationship-card" key={r.id}>
                    <div>
                      <strong>{r.name}</strong>
                      <span>{r.role}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${r.name}`}
                        onClick={() =>
                          act(() => {
                            setWorkspace((w) =>
                              receipt(
                                {
                                  ...w,
                                  entity: {
                                    ...w.entity!,
                                    relationships:
                                      w.entity!.relationships.filter(
                                        (x) => x.id !== r.id,
                                      ),
                                  },
                                },
                                'remove_relationship',
                                `Removed context about ${r.name}.`,
                              ),
                            );
                            setUndo(
                              () => () =>
                                setWorkspace((w) => ({
                                  ...w,
                                  entity: {
                                    ...w.entity!,
                                    relationships: [
                                      ...w.entity!.relationships,
                                      r,
                                    ],
                                  },
                                })),
                            );
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <p>{r.context}</p>
                    <small>You told me</small>
                  </article>
                ))}
              </>
            )}
            {panel === 'activity' && (
              <>
                {!workspace.entity?.receipts.length && (
                  <p className="panel-empty">
                    Your first action starts the record. Move your agent or
                    leave a note.
                  </p>
                )}
                {[...(workspace.entity?.receipts || [])].reverse().map((r) => (
                  <article className="receipt-row" key={r.id}>
                    <div className="receipt-dot" />
                    <div>
                      <span>
                        {r.actor === 'you'
                          ? 'You'
                          : r.actor === 'agent'
                            ? workspace.profile.name
                            : 'System'}{' '}
                        · {r.action.replaceAll('_', ' ')}
                      </span>
                      <p>{r.detail}</p>
                      <small>
                        {r.model} ·{' '}
                        {new Date(r.at).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </div>
                  </article>
                ))}
                <p className="panel-help">
                  These records describe saved workspace changes. They do not
                  prove physical events or external task completion. The latest
                  200 are retained.
                </p>
              </>
            )}
            {panel === 'identity' && (
              <>
                {access === 'guest' && (
                  <p className="panel-help">
                    This space belongs to this browser session. Keep an agent
                    export to move devices or restore your history. Clearing
                    this site’s cookies starts a new space.
                  </p>
                )}
                <figure className="companion-portrait-card">
                  <Image
                    src={NIA.appearance.portrait}
                    width={1254}
                    height={1254}
                    alt={NIA.appearance.alt}
                    loading="lazy"
                    unoptimized
                  />
                  <figcaption>Nia · NEE-uh · she/her</figcaption>
                </figure>
                <p className="panel-help">{NIA.introduction}</p>
                <p className="panel-help">
                  A Black woman, character age 28. Warm, candid, and quietly
                  funny.
                </p>
                <div className="identity-card">
                  <Fingerprint size={30} />
                  <div>
                    <h3>{workspace.profile.name}</h3>
                    <p>
                      Identity {workspace.entity?.id.slice(0, 8) || 'loading'}
                    </p>
                  </div>
                </div>
                <form
                  className="identity-form"
                  key={workspace.entity?.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    act(() =>
                      setWorkspace((w) =>
                        receipt(
                          {
                            ...w,
                            profile: {
                              name: (typeof data.get('name') === 'string'
                                ? (data.get('name') as string)
                                : ''
                              ).trim(),
                              purpose: (typeof data.get('purpose') === 'string'
                                ? (data.get('purpose') as string)
                                : ''
                              ).trim(),
                            },
                          },
                          'identity_updated',
                          'Updated name or purpose.',
                        ),
                      ),
                    );
                  }}
                >
                  <label htmlFor="identity-name">Name</label>
                  <Input
                    id="identity-name"
                    name="name"
                    required
                    maxLength={40}
                    defaultValue={workspace.profile.name}
                  />
                  <label htmlFor="identity-purpose">
                    Our story & her personality
                  </label>
                  <Textarea
                    id="identity-purpose"
                    name="purpose"
                    required
                    maxLength={600}
                    defaultValue={workspace.profile.purpose}
                  />
                  <Button type="submit">Save identity</Button>
                </form>
                <div className="agent-permissions">
                  <h3>
                    <ShieldCheck size={18} />
                    What she can do in your space
                  </h3>
                  {(
                    [
                      ['move', 'Move through the space'],
                      ['notes', 'Create spatial notes'],
                      ['tasks', 'Create and complete tasks'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label htmlFor={`permission-${key}`}>{label}</label>
                      <Switch
                        id={`permission-${key}`}
                        checked={workspace.entity?.permissions[key] ?? false}
                        onCheckedChange={(checked) =>
                          act(() =>
                            setWorkspace((w) =>
                              receipt(
                                {
                                  ...w,
                                  entity: {
                                    ...w.entity!,
                                    permissions: {
                                      ...w.entity!.permissions,
                                      [key]: checked,
                                    },
                                  },
                                },
                                'permission_changed',
                                `${label}: ${checked ? 'allowed' : 'off'}.`,
                              ),
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                  <p>
                    You can always use the controls directly. No physical-device
                    or external messaging access is enabled.
                  </p>
                </div>
                <div className="agent-portability">
                  <h3>Carry your agent with you</h3>
                  <p>
                    Export identity, history, memories, relationships, tasks,
                    notes, and permissions. Model keys are excluded. The file
                    contains your private context.
                  </p>
                  <div>
                    <Button
                      variant="outline"
                      onClick={() => downloadAgent(workspace)}
                    >
                      <Download size={16} />
                      Export agent
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => file.current?.click()}
                    >
                      <Upload size={16} />
                      Import agent
                    </Button>
                    <input
                      className="sr-only"
                      ref={file}
                      type="file"
                      accept=".json,application/json"
                      onChange={(e) => void readImport(e)}
                    />
                  </div>
                </div>
              </>
            )}
            {panel === 'conversation' && (
              <>
                {!!workspace.memoryVersion && (
                  <p className="memory-repair-help">
                    Messages from before your latest correction stay here as
                    history. They are no longer sent to a model.
                  </p>
                )}
                {workspace.messages.map((m) => (
                  <article
                    className={`conversation-entry ${m.role}`}
                    key={m.id}
                  >
                    <span>
                      {m.role === 'user' ? 'You' : workspace.profile.name} ·{' '}
                      {m.mode === 'demo' ? 'Demo' : 'Model'}
                      {(m.memoryVersion || 0) < (workspace.memoryVersion || 0)
                        ? ' · Before correction'
                        : ''}
                    </span>
                    <p>{m.text}</p>
                  </article>
                ))}
                {!workspace.messages.length && (
                  <p className="panel-empty">Your conversation starts here.</p>
                )}
              </>
            )}
            {undo && (
              <div className="panel-undo">
                <span>Item removed.</span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    act(() => {
                      undo();
                      setWorkspace((w) =>
                        receipt(w, 'undo', 'Restored the last removed item.'),
                      );
                      setUndo(null);
                    })
                  }
                >
                  <Undo2 size={14} />
                  Undo
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!imported}
        onOpenChange={(v) => {
          if (!v && !importing) setImported(null);
        }}
      >
        <AlertDialogContent className="agent-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Continue as {imported?.profile.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the current workspace with the imported agent,
              including its permissions. A backup of your current agent will
              download first. Model connections will be disconnected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>
              Keep current agent
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={importing}
              onClick={async (event) => {
                event.preventDefault();
                if (!imported) return;
                setImporting(true);
                try {
                  downloadAgent(workspace);
                  await onImport(imported);
                  setImported(null);
                  onClose();
                } catch (e) {
                  setPanelError((e as Error).message);
                  onError((e as Error).message);
                } finally {
                  setImporting(false);
                }
              }}
            >
              {importing ? 'Importing…' : 'Back up & import'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
