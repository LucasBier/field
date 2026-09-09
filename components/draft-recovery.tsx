'use client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { downloadAgent } from '@/lib/agent-export';
import type { WorkspaceDraft } from '@/lib/workspace-draft';

export function DraftRecovery({
  recovery,
  onRestore,
  onDiscard,
}: {
  recovery: { draft: WorkspaceDraft; conflict: boolean } | null;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={!!recovery}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Your unsaved draft is still here</AlertDialogTitle>
          <AlertDialogDescription>
            {recovery?.conflict
              ? 'Your saved space has changed since this draft was made. Export the draft to keep a copy, then continue with your saved space.'
              : 'This tab kept a recovery copy before saving finished. Restore it to continue, or use the version already saved to your space.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => recovery && downloadAgent(recovery.draft.workspace)}
          >
            Export draft
          </Button>
          <Button variant="outline" onClick={onDiscard}>
            Use saved version
          </Button>
          {!recovery?.conflict && (
            <Button onClick={onRestore}>Restore draft</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
