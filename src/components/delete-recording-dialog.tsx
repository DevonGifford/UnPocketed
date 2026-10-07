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
import { buttonTextVariants, buttonVariants } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { formatTranscriptCount } from "@/lib/format";

/**
 * Confirming the deletion of a recording (§25).
 *
 * The wording is deliberately the long form — "Delete recording and all
 * associated data" — because §25 asks that it be distinguishable from deleting
 * a transcript. The transcript warning appears only when there are transcripts
 * to lose; claiming otherwise would be a warning about nothing.
 */
export function DeleteRecordingDialog({
  open,
  onOpenChange,
  title,
  transcriptCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  transcriptCount: number;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete recording and all associated data
          </AlertDialogTitle>
          <AlertDialogDescription>
            {transcriptCount > 0
              ? `“${title}”, its audio and its ${formatTranscriptCount(transcriptCount).toLowerCase()} will be deleted from this device. This cannot be undone.`
              : `“${title}” and its audio will be deleted from this device. This cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          {/* Cancel is the easier target; §25 asks that deleting not be. */}
          <AlertDialogCancel>
            <Text>Keep recording</Text>
          </AlertDialogCancel>
          {/*
            AlertDialogAction hardcodes the default button variant, so the
            destructive one is merged over it — cn lets the later utility win.
          */}
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onPress={onConfirm}
          >
            <Text className={buttonTextVariants({ variant: "destructive" })}>
              Delete
            </Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
