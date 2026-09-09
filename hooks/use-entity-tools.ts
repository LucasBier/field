'use client';
import { useEffect, useRef } from 'react';
import { type Workspace } from '@/lib/field';
import { validEntityActions, type EntityAction } from '@/lib/entity';
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (v: unknown) => unknown;
};
export function useEntityTools(
  handlers: {
    read: () => Workspace;
    apply: (actions: EntityAction[]) => Promise<Workspace>;
  },
  ready: boolean,
) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  }, [handlers]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!ready || !context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: 'read_field_agent',
        description:
          'Read the current Field agent identity, virtual location, memories, relationships, tasks, notes, and action records. No changes.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw new Error('Expected an empty object.');
          const w = latest.current.read();
          return { profile: w.profile, entity: w.entity, memories: w.memories };
        },
      },
      {
        name: 'act_in_field_space',
        description:
          'Apply and save up to four permitted actions in Field’s virtual space: move, create a note, add a task, or mark an existing task complete. Creating a task only records a to-do; it does not perform external work.',
        inputSchema: {
          type: 'object',
          properties: {
            actions: {
              type: 'array',
              minItems: 1,
              maxItems: 4,
              items: {
                oneOf: [
                  {
                    type: 'object',
                    properties: {
                      type: { const: 'move' },
                      zone: { enum: ['center', 'desk', 'window'] },
                    },
                    required: ['type', 'zone'],
                    additionalProperties: false,
                  },
                  {
                    type: 'object',
                    properties: {
                      type: { const: 'note' },
                      text: { type: 'string', minLength: 1, maxLength: 1200 },
                      zone: { enum: ['center', 'desk', 'window'] },
                    },
                    required: ['type', 'text', 'zone'],
                    additionalProperties: false,
                  },
                  {
                    type: 'object',
                    properties: {
                      type: { const: 'task' },
                      title: { type: 'string', minLength: 1, maxLength: 240 },
                    },
                    required: ['type', 'title'],
                    additionalProperties: false,
                  },
                  {
                    type: 'object',
                    properties: {
                      type: { const: 'complete_task' },
                      taskId: { type: 'string', minLength: 1, maxLength: 80 },
                    },
                    required: ['type', 'taskId'],
                    additionalProperties: false,
                  },
                ],
              },
            },
          },
          required: ['actions'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          const data = input as { actions?: unknown };
          if (
            !data ||
            Object.keys(data).some((k) => k !== 'actions') ||
            !validEntityActions(data.actions) ||
            !data.actions.length
          )
            throw new Error('Expected one to four supported actions.');
          const w = await latest.current.apply(data.actions);
          return {
            identityId: w.entity?.id,
            zone: w.entity?.zone,
            tasks: w.entity?.tasks,
            notes: w.entity?.notes,
            latestReceipt: w.entity?.receipts.at(-1),
            saved: true,
          };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser integration. */
      }
    }
    return () => lifecycle.abort();
  }, [ready]);
}
