'use client';
import { useState } from 'react';
import {
  Brain,
  Download,
  Trash2,
  FileCheck2,
  MessageSquare,
  KeyRound,
  ArrowUpRight,
  Undo2,
  Pin,
  Search,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { stamp, uid, type Memory, type Workspace } from '@/lib/field';
import { activeMemories, retrieveMemories } from '@/lib/memory';
import { canonicalWorkspace } from '@/lib/validation';
import { MemoryRepairEditor } from '@/components/memory-repair-editor';
export type Connection = { key: string; model: string };
export function exportWorkspace(workspace: Workspace) {
  const file = new Blob(
    [
      JSON.stringify(
        {
          format: 'field-workspace',
          version: 1,
          exportedAt: stamp(),
          workspace: canonicalWorkspace(workspace),
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = `field-workspace-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function MemoryDialog({
  open,
  onOpenChange,
  workspace,
  setWorkspace,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspace: Workspace;
  setWorkspace: (fn: (w: Workspace) => Workspace) => void;
}) {
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const recalled = retrieveMemories(workspace.memories, query);
  const visible = history
    ? workspace.memories
        .filter((m) => m.supersededBy)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    : query.trim()
      ? recalled.memories.map((m) =>
          workspace.memories.find((original) => original.id === m.id)!,
        )
      : activeMemories(workspace.memories).sort(
          (a, b) =>
            Number(!!b.pinned) - Number(!!a.pinned) ||
            Date.parse(b.createdAt) - Date.parse(a.createdAt),
        );
  const [removed, setRemoved] = useState<Memory | null>(null);
  const addNote = () => {
    if (!note.trim()) return;
    setWorkspace((w) => ({
      ...w,
      memories: [
        ...w.memories,
        { id: uid(), text: note.trim(), createdAt: stamp(), source: 'user' },
      ],
    }));
    setNote('');
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setEditing(null);
          setNotice('');
        }
        onOpenChange(value);
      }}
    >
      <DialogContent className="field-dialog sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <Brain size={22} />
            Memory, with room to change
          </DialogTitle>
          <DialogDescription>
            Keep what matters. Correct what no longer fits.
          </DialogDescription>
        </DialogHeader>
        {editing ? (
          <MemoryRepairEditor
            key={editing}
            memoryId={editing}
            workspace={workspace}
            setWorkspace={setWorkspace}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              setHistory(false);
              setQuery('');
              setNotice('Memory updated. Earlier versions are in History.');
            }}
          />
        ) : (
          <>
            {notice && (
              <output className="memory-repair-notice">{notice}</output>
            )}
            <div className="memory-view-switch" aria-label="Memory view">
              <Button
                variant={history ? 'ghost' : 'secondary'}
                aria-pressed={!history}
                onClick={() => setHistory(false)}
              >
                Current · {activeMemories(workspace.memories).length}
              </Button>
              <Button
                variant={history ? 'secondary' : 'ghost'}
                aria-pressed={history}
                onClick={() => setHistory(true)}
              >
                History ·{' '}
                {workspace.memories.filter((m) => m.supersededBy).length}
              </Button>
            </div>
            {history ? (
              <p className="memory-repair-help">
                Earlier versions remain yours to inspect or remove. They are
                never selected for recall, even if pinned.
              </p>
            ) : (
              <div className="memory-search">
                <label htmlFor="memory-query">
                  <Search size={14} /> Preview recall
                </label>
                <Input
                  id="memory-query"
                  value={query}
                  maxLength={3000}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="What would you say to Zuri?"
                />
                <p>
                  {query.trim()
                    ? `${recalled.selection.matches.length} selected · ${recalled.selection.chars} / 6,000 memory characters. `
                    : ''}
                  Pinned first, then keyword relevance. Recent memories fill in
                  when nothing matches. Up to 8 fit in context.
                </p>
              </div>
            )}
            <div className="memory-list">
              {!visible.length && (
                <div className="empty-memory">
                  <Brain size={32} />
                  <h3>
                    {history
                      ? 'No earlier versions.'
                      : query.trim()
                        ? 'No current memories match.'
                        : 'A fresh page.'}
                  </h3>
                  <p>
                    {history
                      ? 'When you correct a memory, its earlier version appears here.'
                      : 'Leave a note below. Zuri can use the memories you choose to keep in future conversations.'}
                  </p>
                </div>
              )}
              {visible.map((m) => (
                <article className="memory-card" key={m.id}>
                  <div className="memory-meta">
                    <span>
                      {m.source === 'experiment' ? (
                        <FileCheck2 size={14} />
                      ) : (
                        <MessageSquare size={14} />
                      )}{' '}
                      {m.source === 'experiment'
                        ? 'Calculated finding'
                        : m.supersededBy
                          ? 'Earlier version · not recalled'
                          : m.supersedes
                            ? 'You corrected this'
                            : 'You told me'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!!m.supersededBy}
                      aria-label={`${m.pinned ? 'Unpin' : 'Pin'} memory: ${m.text.slice(0, 40)}`}
                      aria-pressed={!!m.pinned}
                      onClick={() =>
                        setWorkspace((w) => ({
                          ...w,
                          memories: w.memories.map((item) =>
                            item.id === m.id
                              ? { ...item, pinned: !item.pinned }
                              : item,
                          ),
                        }))
                      }
                    >
                      <Pin
                        size={15}
                        fill={m.pinned ? 'currentColor' : 'none'}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove memory: ${m.text.slice(0, 40)}`}
                      onClick={() => {
                        setRemoved(m);
                        setWorkspace((w) => ({
                          ...w,
                          memories: w.memories.filter(
                            (item) => item.id !== m.id,
                          ),
                        }));
                      }}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  <p>{m.text}</p>
                  {!history && query.trim() && (
                    <small className="memory-rank">
                      {
                        recalled.selection.matches.find(
                          (match) => match.id === m.id,
                        )?.reason
                      }{' '}
                      · selected for this query
                    </small>
                  )}
                  {m.evidence && (
                    <details>
                      <summary>Inspect evidence</summary>
                      <div className="evidence-detail">
                        <p>
                          {m.evidence.formula} ={' '}
                          <strong>{m.evidence.period.toFixed(6)} s</strong>
                        </p>
                        <dl>
                          {Object.entries(m.evidence.params)
                            .filter(([k]) =>
                              m.evidence!.kind === 'pendulum'
                                ? ['length', 'gravity', 'amplitude'].includes(k)
                                : ['mass', 'stiffness', 'amplitude'].includes(
                                    k,
                                  ),
                            )
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt>{k}</dt>
                                <dd>
                                  {v}{' '}
                                  {k === 'length'
                                    ? 'm'
                                    : k === 'gravity'
                                      ? 'm/s²'
                                      : k === 'mass'
                                        ? 'kg'
                                        : k === 'stiffness'
                                          ? 'N/m'
                                          : m.evidence!.kind === 'pendulum'
                                            ? '°'
                                            : 'cm'}
                                </dd>
                              </div>
                            ))}
                        </dl>
                        <p>
                          Snapshot saved with this finding. Later experiment
                          edits do not change it.
                        </p>
                        <p>
                          {m.evidence.kind === 'pendulum'
                            ? 'Ideal, undamped small-angle approximation.'
                            : 'Ideal, undamped linear spring.'}{' '}
                          Calculated, not physically measured.
                        </p>
                      </div>
                    </details>
                  )}
                  <time dateTime={m.createdAt}>
                    {new Date(m.createdAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                  {m.source === 'user' && !m.supersededBy && (
                    <Button
                      className="memory-correct-button"
                      variant="ghost"
                      onClick={() => {
                        setEditing(m.id);
                        setNotice('');
                      }}
                    >
                      Correct this understanding
                    </Button>
                  )}
                  {m.supersedes && (
                    <p className="memory-revision-link">
                      {workspace.memories.some((old) => old.id === m.supersedes)
                        ? 'Earlier wording is kept in History.'
                        : 'The earlier record was removed.'}
                    </p>
                  )}
                </article>
              ))}
            </div>
            {removed && (
              <div className="undo-strip">
                Memory removed
                <Button
                  variant="ghost"
                  disabled={workspace.memories.length >= 200}
                  onClick={() => {
                    setWorkspace((w) => ({
                      ...w,
                      memories: [...w.memories, removed],
                    }));
                    setRemoved(null);
                  }}
                >
                  <Undo2 size={14} />
                  Undo
                </Button>
              </div>
            )}
            <div className="note-form">
              <label htmlFor="memory-note">
                Something you want {workspace.profile.name} to remember
              </label>
              <Textarea
                id="memory-note"
                value={note}
                maxLength={3000}
                placeholder="I learn best by changing one variable at a time."
                onChange={(e) => setNote(e.target.value)}
              />
              <div>
                <span>{workspace.memories.length} / 200 memories</span>
                <Button
                  disabled={!note.trim() || workspace.memories.length >= 200}
                  onClick={addNote}
                >
                  Keep note
                </Button>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => exportWorkspace(workspace)}
            >
              <Download size={16} />
              Export workspace
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function SettingsDialog({
  open,
  onOpenChange,
  workspace,
  setWorkspace,
  connection,
  setConnection,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspace: Workspace;
  setWorkspace: (fn: (w: Workspace) => Workspace) => void;
  connection: Connection | null;
  setConnection: (v: Connection | null) => void;
}) {
  const [name, setName] = useState(workspace.profile.name);
  const [purpose, setPurpose] = useState(workspace.profile.purpose);
  const [key, setKey] = useState('');
  const [model, setModel] = useState(connection?.model || 'deepseek-v4-flash');
  const [notice, setNotice] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setName(workspace.profile.name);
          setPurpose(workspace.profile.purpose);
          setNotice('');
        } else setKey('');
        onOpenChange(v);
      }}
    >
      <DialogContent className="field-dialog sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <KeyRound size={22} />
            Identity & model
          </DialogTitle>
          <DialogDescription>
            A familiar collaborator, with a connection you control.
          </DialogDescription>
        </DialogHeader>
        <div className="settings-fields">
          <label htmlFor="agent-name">Name</label>
          <Input
            id="agent-name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
          <label htmlFor="agent-purpose">Purpose</label>
          <Textarea
            id="agent-purpose"
            value={purpose}
            maxLength={600}
            onChange={(e) => setPurpose(e.target.value)}
          />
          <Button
            variant="outline"
            disabled={!name.trim() || !purpose.trim()}
            onClick={() => {
              setWorkspace((w) => ({
                ...w,
                profile: { name: name.trim(), purpose: purpose.trim() },
              }));
              setNotice('Identity updated.');
            }}
          >
            Save identity
          </Button>
        </div>
        <div className="model-settings">
          <h3>Bring your model</h3>
          <p>
            Experiment controls work without a key. Add DeepSeek for open-ended
            conversation and natural-language experiment changes.
          </p>
          <label htmlFor="model-select">Model</label>
          <Select value={model} onValueChange={(v) => v && setModel(v)}>
            <SelectTrigger id="model-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepseek-v4-flash">
                DeepSeek V4 Flash
              </SelectItem>
              <SelectItem value="deepseek-v4-pro">DeepSeek V4 Pro</SelectItem>
            </SelectContent>
          </Select>
          <label htmlFor="model-key">API key</label>
          <Input
            id="model-key"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            maxLength={256}
            placeholder={
              connection
                ? 'A key is already active for this tab'
                : 'Paste your DeepSeek API key'
            }
          />
          <p className="connection-disclosure">
            Your key stays in this tab’s memory and is sent through Field’s
            server to DeepSeek only when you send a message. It is never saved
            to your workspace. Selected experiments, your last 12 messages, and
            your latest 12 memories accompany each request. Provider usage
            charges apply.
          </p>
          <div className="settings-actions">
            <Button
              disabled={!key.trim() && !connection}
              onClick={() => {
                const chosenKey = key.trim() || connection?.key;
                if (!chosenKey || !/^[-A-Za-z0-9_.]{10,256}$/.test(chosenKey)) {
                  setNotice('That key format does not look valid.');
                  return;
                }
                setConnection({ key: chosenKey, model });
                setKey('');
                setNotice(
                  'Model mode is ready. The key will be verified with your next message.',
                );
              }}
            >
              Use model for this session
            </Button>
            {connection && (
              <Button
                variant="ghost"
                onClick={() => {
                  setConnection(null);
                  setKey('');
                  setNotice('Conversation disconnected.');
                }}
              >
                Disconnect
              </Button>
            )}
          </div>
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noreferrer"
          >
            Get a DeepSeek key
            <ArrowUpRight size={14} />
          </a>
        </div>
        <output className="settings-notice">
          {notice ||
            (connection
              ? 'Model mode selected · Key is not stored'
              : 'No conversation service connected')}
        </output>
      </DialogContent>
    </Dialog>
  );
}
