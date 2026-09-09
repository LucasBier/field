import { initialWorkspace, type Workspace } from './field';

/** Only the public walkthrough uses this data. Never seed a user's workspace. */
export function storySample(): Workspace {
  return {
    ...initialWorkspace(),
    entity: {
      id: 'nia-sample-01',
      bornAt: '2026-09-01T08:00:00Z',
      zone: 'center',
      tasks: [],
      notes: [],
      relationships: [],
      receipts: [],
      permissions: { move: true, notes: true, tasks: true },
    },
    memories: [
      {
        id: 'sample-morning',
        text: 'I love quiet mornings, coffee, and a little jazz.',
        source: 'user',
        createdAt: '2026-09-01T08:00:00Z',
      },
      {
        id: 'sample-garden',
        text: 'Our weekend plan is a walk through the botanical garden.',
        source: 'user',
        createdAt: '2026-09-02T08:00:00Z',
      },
      {
        id: 'sample-project',
        text: 'I am building an interactive sculpture for the gallery.',
        source: 'user',
        createdAt: '2026-09-03T08:00:00Z',
      },
      {
        id: 'sample-name',
        text: 'Call me Alex. I prefer one thoughtful question at a time.',
        source: 'user',
        createdAt: '2026-09-04T08:00:00Z',
        pinned: true,
      },
    ],
  };
}

export function repairSample(): Workspace {
  const sample = storySample();
  sample.memories = [
    {
      id: 'sample-social',
      text: 'I do not like parties.',
      source: 'user',
      createdAt: '2026-09-01T08:00:00Z',
    },
    sample.memories[0],
  ];
  sample.entity!.tasks = [
    {
      id: 'sample-weekend',
      title: 'Plan a quiet weekend at home.',
      state: 'open',
      createdAt: '2026-09-02T08:00:00Z',
      origin: { runId: 'sample-context', memoryIds: ['sample-social'] },
    },
  ];
  return sample;
}
