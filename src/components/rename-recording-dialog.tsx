import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/**
 * Renaming a recording (§15). The title is the only metadata a user authors, so
 * an empty one is refused rather than saved — the stored title is what the
 * library shows, and nothing else can reconstruct it.
 */
export function RenameRecordingDialog({
  open,
  onOpenChange,
  currentTitle,
  onRename,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  onRename: (title: string) => void;
}) {
  const [draft, setDraft] = useState(currentTitle);

  /*
   * Discard the edit as the dialog closes, so reopening offers the stored
   * title rather than an abandoned one. Done here rather than in an effect on
   * `open`: cancelling and dismissing both arrive through onOpenChange, and
   * resetting state from an effect is the pattern react-hooks rejects.
   */
  function handleOpenChange(next: boolean) {
    if (!next) setDraft(currentTitle);
    onOpenChange(next);
  }

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed !== currentTitle;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rename recording</AlertDialogTitle>
          <AlertDialogDescription>
            This changes the title only. The audio is untouched.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Input
          value={draft}
          onChangeText={setDraft}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => {
            if (canSave) onRename(trimmed);
          }}
          accessibilityLabel="Recording title"
          placeholder="Recording title"
        />

        <AlertDialogFooter>
          <AlertDialogCancel>
            <Text>Cancel</Text>
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSave}
            className={canSave ? undefined : "opacity-40"}
            onPress={() => onRename(trimmed)}
          >
            <Text>Save</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
