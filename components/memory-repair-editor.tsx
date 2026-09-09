'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Workspace } from '@/lib/field';
import {
  applyMemoryRepair,
  previewMemoryRepair,
  type RepairDecision,
  type RepairPreview,
} from '@/lib/memory-repair';

export function MemoryRepairEditor({
  memoryId,
  workspace,
  setWorkspace,
  onCancel,
  onDone,
}: {
  memoryId: string;
  workspace: Workspace;
  setWorkspace: (fn: (w: Workspace) => Workspace) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const memory = workspace.memories.find((m) => m.id === memoryId);
  const [draft, setDraft] = useState(memory?.text || '');
  const [preview, setPreview] = useState<RepairPreview | null>(null);
  const [decisions, setDecisions] = useState<RepairDecision[]>([]);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [preview]);
  const review = () => {
    try {
      const next = previewMemoryRepair(workspace, memoryId, draft);
      setPreview(next);
      setDecisions(
        next.items.map((item) => ({
          key: item.key,
          action: 'keep',
          text: item.text,
        })),
      );
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const confirm = () => {
    try {
      setWorkspace((w) => applyMemoryRepair(w, preview!, decisions));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const update = (key: string, patch: Partial<RepairDecision>) =>
    setDecisions((items) =>
      items.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  return (
    <section className="memory-repair-editor">
      <Button
        variant="ghost"
        className="memory-repair-back"
        onClick={
          preview
            ? () => {
                setPreview(null);
                setError('');
              }
            : onCancel
        }
      >
        <ArrowLeft size={15} />{' '}
        {preview ? 'Edit your correction' : 'Back to memory'}
      </Button>
      <h3 ref={heading} tabIndex={-1}>
        {preview ? 'Review what changes.' : 'How should she understand it now?'}
      </h3>
      <div className="memory-repair-before">
        <span>EARLIER UNDERSTANDING</span>
        <p>
          {preview?.memory.text || memory?.text || 'This memory was removed.'}
        </p>
      </div>
      {!preview ? (
        <>
          <label htmlFor="memory-correction">Your current understanding</label>
          <Textarea
            id="memory-correction"
            value={draft}
            maxLength={3000}
            rows={4}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="memory-repair-help">
            Give it context, correct a detail, or say what has changed. The
            earlier version stays in History and stops being recalled.
          </p>
          <Button
            disabled={
              !draft.trim() ||
              draft.trim() === memory?.text.trim() ||
              !memory ||
              !!memory.supersededBy ||
              workspace.memories.length >= 200
            }
            onClick={review}
          >
            Preview correction
          </Button>
          {workspace.memories.length >= 200 && (
            <p className="memory-repair-help">
              Memory is full. Remove a record before keeping a revision.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="memory-repair-after">
            <span>CURRENT UNDERSTANDING</span>
            <p>{preview.replacement}</p>
          </div>
          <div className="memory-repair-review-heading">
            <h4>Plans & room notes</h4>
            <p>
              Keep, rewrite, or remove each item. Nothing changes automatically.
            </p>
          </div>
          {!preview.items.length ? (
            <p className="memory-repair-help">
              There are no open plans or room notes to review.
            </p>
          ) : (
            <div className="memory-repair-items">
              {preview.items.map((item) => {
                const decision = decisions.find((d) => d.key === item.key)!;
                return (
                  <article key={item.key} className="memory-repair-item">
                    <span>
                      {item.kind === 'task' ? 'OPEN PLAN' : 'ROOM NOTE'}
                      {item.contextMatch ? ' · CONTEXT MATCH' : ''}
                    </span>
                    <p>{item.text}</p>
                    {item.contextMatch && (
                      <small>
                        This memory or an earlier version was in context when
                        this item was created. That does not prove it caused the
                        plan.
                      </small>
                    )}
                    <Select
                      value={decision.action}
                      onValueChange={(value) =>
                        update(item.key, {
                          action: value as RepairDecision['action'],
                        })
                      }
                    >
                      <SelectTrigger
                        aria-label={`Review ${item.kind}: ${item.text.slice(0, 60)}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="keep">Keep as it is</SelectItem>
                        <SelectItem value="rewrite">Rewrite</SelectItem>
                        <SelectItem value="remove">
                          Remove from space
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {decision.action === 'rewrite' && (
                      <Textarea
                        aria-label={`New text for ${item.kind}`}
                        value={decision.text}
                        maxLength={item.kind === 'task' ? 240 : 1200}
                        onChange={(e) =>
                          update(item.key, { text: e.target.value })
                        }
                      />
                    )}
                    {decision.action === 'remove' && (
                      <small>
                        This removes the saved item. It does not cancel anything
                        outside Field.
                      </small>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          <p className="memory-repair-help">
            All open plans and room notes are listed. Items without a context
            match have no recorded link to this memory.
          </p>
          <div className="memory-repair-boundary">
            <strong>A fresh conversation context.</strong>
            <p>
              Earlier messages remain in your history, but will no longer be
              sent to a model. Your other memories, identity, and reviewed plans
              stay. This applies to both local and hosted models.
            </p>
          </div>
          <Button
            onClick={confirm}
            disabled={decisions.some(
              (d) => d.action === 'rewrite' && !d.text?.trim(),
            )}
          >
            Confirm correction
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="memory-repair-error">
          {error}
        </p>
      )}
    </section>
  );
}
