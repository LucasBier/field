'use client';
import {
  Activity,
  ArrowDown,
  Check,
  Clock3,
  Database,
  ShieldCheck,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import type { Workspace } from '@/lib/field';
import { RUN_FAILURES } from '@/lib/runtime-schema';

export function RuntimeInspector({
  open,
  onOpenChange,
  workspace,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  busy: boolean;
}) {
  const runs = [...(workspace.runs || [])].reverse();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="agent-sheet runtime-sheet sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            <Activity size={20} /> Behind each response
          </SheetTitle>
          <SheetDescription>
            The last 40 requests. Inspect context selection, model usage, and
            committed actions.
          </SheetDescription>
        </SheetHeader>
        <div className="agent-panel-body">
          <div className="runtime-contract">
            <ShieldCheck size={18} />
            <p>
              Actions are validated together. A rejected or cancelled response
              applies no model actions. The save indicator confirms persistence.
            </p>
          </div>
          {!runs.length && (
            <div className="runtime-empty">
              <Activity size={32} />
              <h3>A clear record, from the first turn.</h3>
              <p>
                Send Zuri a message. Its path through memory, response, and
                actions will appear here.
              </p>
            </div>
          )}
          {runs.map((run, index) => {
            const request = workspace.messages.find(
              (m) => m.id === run.requestId,
            );
            return (
              <details key={run.id} className="runtime-run" open={index === 0}>
                <summary>
                  <span className={`runtime-status is-${run.status}`}>
                    {run.status === 'running'
                      ? busy && index === 0
                        ? 'Running'
                        : 'Unfinished'
                      : run.status}
                  </span>
                  <span>
                    {run.provider === 'demo'
                      ? 'Room controls · no inference'
                      : run.provider === 'ollama'
                        ? 'Zuri · Local connection'
                        : 'Zuri · Connected'}
                  </span>
                  <ArrowDown size={14} />
                </summary>
                <p className="runtime-request">
                  {request?.text ||
                    'The original message is no longer in this workspace.'}
                </p>
                <div className="runtime-metrics">
                  <span>
                    <Clock3 size={13} />
                    {run.latencyMs !== undefined
                      ? `${(run.latencyMs / 1000).toFixed(2)} s`
                      : 'No terminal result'}
                  </span>
                  <span>
                    {run.usage?.total != null
                      ? `${run.usage.total.toLocaleString('en-US')} tokens`
                      : run.provider === 'demo'
                        ? '0 model tokens'
                        : 'Usage unavailable'}
                  </span>
                </div>
                {run.failure && (
                  <p className="runtime-failure">{RUN_FAILURES[run.failure]}</p>
                )}
                <ol className="runtime-steps">
                  <li>
                    <Database size={15} />
                    <div>
                      <strong>Context selected</strong>
                      {run.memory ? (
                        <>
                          <p>
                            BM25 · {run.memory.matches.length} memories ·{' '}
                            {run.memory.chars.toLocaleString('en-US')} /{' '}
                            {run.memory.budget.toLocaleString('en-US')} text
                            characters
                          </p>
                          <p>
                            ~
                            {run.memory.estimatedTokens.toLocaleString('en-US')}{' '}
                            memory tokens, estimated. Full provider usage
                            includes instructions and other context.
                          </p>
                          {run.memory.matches.map((match) => {
                            const memory = workspace.memories.find(
                              (m) => m.id === match.id,
                            );
                            return (
                              <div className="runtime-memory" key={match.id}>
                                <span>
                                  {match.reason} · score{' '}
                                  {match.score.toFixed(2)}
                                  {match.truncated ? ' · excerpt' : ''}
                                  {memory?.supersededBy
                                    ? ' · earlier version'
                                    : ''}
                                </span>
                                <p>
                                  {memory
                                    ? memory.text.slice(0, match.chars)
                                    : 'Memory removed. Its text is not kept in this trace.'}
                                </p>
                              </div>
                            );
                          })}
                          <small>
                            Memory text is read from the saved version.
                            Selection metadata reflects this request.
                          </small>
                        </>
                      ) : (
                        <p>Direct room command. No model context was sent.</p>
                      )}
                    </div>
                  </li>
                  <li>
                    <Activity size={15} />
                    <div>
                      <strong>
                        {run.status === 'completed'
                          ? 'Response validated'
                          : run.status === 'running'
                            ? 'Awaiting a terminal result'
                            : 'Response not committed'}
                      </strong>
                      <p>
                        {run.status === 'running'
                          ? 'An unfinished run may come from an interrupted tab or another active session. It is not proof of success.'
                          : run.status === 'completed'
                            ? 'Structured response accepted by the runtime.'
                            : 'Failed or cancelled. Retry manually when ready; Field does not silently retry a model call.'}
                      </p>
                    </div>
                  </li>
                  <li>
                    <Check size={15} />
                    <div>
                      <strong>{run.receiptIds.length} committed actions</strong>
                      {run.receiptIds.length ? (
                        run.receiptIds.map((id) => {
                          const record = workspace.entity?.receipts.find(
                            (r) => r.id === id,
                          );
                          return (
                            <p key={id}>
                              {record?.detail ||
                                'Action receipt no longer retained.'}
                            </p>
                          );
                        })
                      ) : (
                        <p>
                          No spatial changes were committed by this request.
                        </p>
                      )}
                    </div>
                  </li>
                </ol>
                <time dateTime={run.startedAt}>
                  {new Date(run.startedAt).toLocaleString('en-US')}
                </time>
              </details>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
