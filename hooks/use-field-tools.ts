'use client';
import { useEffect, useRef } from 'react';
import { validateActions, type Action } from '@/lib/agent';
import type { Workspace } from '@/lib/field';
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type ModelContext = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function useFieldTools(
  handlers: {
    read: () => Workspace;
    apply: (actions: Action[]) => Promise<unknown>;
    keep: (id: string) => Promise<unknown>;
  },
  ready: boolean,
) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  }, [handlers]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!ready || !context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: 'read_field_workspace',
        description:
          'Read the visible Field experiments, selected experiment, identity, and source-labeled memories. No changes.',
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
          return {
            profile: w.profile,
            experiments: w.experiments,
            selectedId: w.selectedId,
            memories: w.memories,
          };
        },
      },
      {
        name: 'change_field_experiments',
        description:
          'Create, branch, or update up to three Field experiments and save the changes. Branch preserves a frozen baseline. Only pendulum and spring models are supported.',
        inputSchema: {
          type: 'object',
          properties: {
            actions: {
              type: 'array',
              minItems: 1,
              maxItems: 3,
              items: {
                type: 'object',
                properties: {
                  type: { enum: ['create', 'update', 'branch'] },
                  experimentId: { type: 'string' },
                  kind: { enum: ['pendulum', 'spring'] },
                  title: { type: 'string', maxLength: 120 },
                  params: {
                    type: 'object',
                    properties: {
                      length: { type: 'number', minimum: 0.3, maximum: 2.6 },
                      gravity: { type: 'number', minimum: 0.5, maximum: 20 },
                      amplitude: { type: 'number', minimum: 1, maximum: 20 },
                      mass: { type: 'number', minimum: 0.2, maximum: 5 },
                      stiffness: { type: 'number', minimum: 2, maximum: 40 },
                    },
                    additionalProperties: false,
                  },
                },
                required: ['type'],
                additionalProperties: false,
              },
            },
          },
          required: ['actions'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          const value = input as { actions?: unknown };
          if (
            !value ||
            Object.keys(value).some((k) => k !== 'actions') ||
            !validateActions(value.actions) ||
            !value.actions.length
          )
            throw new Error('Expected one to three valid experiment actions.');
          return latest.current.apply(value.actions);
        },
      },
      {
        name: 'keep_field_finding',
        description:
          'Calculate and save an experiment finding, including an immutable parameter snapshot and formula, to the visible Memory shelf.',
        inputSchema: {
          type: 'object',
          properties: { experimentId: { type: 'string' } },
          required: ['experimentId'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          const value = input as { experimentId?: unknown };
          if (
            !value ||
            Object.keys(value).some((k) => k !== 'experimentId') ||
            typeof value.experimentId !== 'string'
          )
            throw new Error('Expected an experimentId.');
          return latest.current.keep(value.experimentId);
        },
      },
    ];
    tools.forEach((tool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Optional browser capability; regular controls remain available. */
      }
    });
    return () => lifecycle.abort();
  }, [ready]);
}
