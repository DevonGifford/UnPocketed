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

/**
 * Confirming the deletion of a transcript (§25).
 *
 * §25 asks that this be clearly distinguishable from deleting a recording, so
 * the wording leads with what is *kept*: the recording and its audio survive,
 * and the transcript can be produced again. That is the whole difference
 * between the two actions, and it is the reassurance §32 asks for wherever the
 * statement is true.
 */
export function DeleteTranscriptDialog({
  open,
  onOpenChange,
  modelId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Named so a recording with several transcripts says which one goes. */
  modelId: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this transcript</AlertDialogTitle>
          <AlertDialogDescription>
            {`The ${modelId} transcript will be deleted from this device. The recording and its audio are not affected, and it can be transcribed again.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          {/* Cancel is the easier target; §25 asks that deleting not be. */}
          <AlertDialogCancel>
            <Text>Keep transcript</Text>
          </AlertDialogCancel>
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
