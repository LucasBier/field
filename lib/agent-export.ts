import { stamp, type Workspace } from './field';
import { canonicalWorkspace } from './validation';

export function downloadAgent(w: Workspace) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: 'field-agent',
          version: 2,
          exportedAt: stamp(),
          workspace: canonicalWorkspace(w),
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `${w.profile.name.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'field'}-agent.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
