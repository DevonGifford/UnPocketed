import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useNavigation, useRouter } from "expo-router";

import { Screen } from "@/components/screen";
import { Text } from "@/components/ui/text";
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
import {
  editableTurnsFor,
  editedTranscript,
  saveTranscript,
  turnsChanged,
  useTranscript,
  type EditableTurn,
} from "@/features/transcription";
import { formatDuration } from "@/lib/format";

/**
 * Editing a Transcript (§23, ticket 03).
 *
 * Saving never changes the Provider's transcript: it writes a separate one
 * recording that the user wrote these words, so §20 stays answerable and §22's
 * comparison keeps meaning what it says. `editedTranscript` holds that rule;
 * this screen only collects the text.
 *
 * Editing is **per turn** where the transcript has them. Speaker attribution
 * and timings are shown but not editable — naming a voice is a claim about who
 * someone is, which §10 keeps out of transcription entirely.
 */
export function TranscriptEditScreen({ transcriptId }: { transcriptId: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const { transcript } = useTranscript(transcriptId);

  const [turns, setTurns] = useState<EditableTurn[] | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The turns as they were last saved, for comparison.
   *
   * State rather than a ref, because `dirty` is derived from it during render
   * and the React Compiler forbids reading a ref there — rightly, since a ref
   * changing would not re-render and the Save button would go stale.
   */
  const [baseline, setBaseline] = useState<EditableTurn[] | null>(null);

  /*
   * Loaded once per transcript, during render rather than in an effect.
   *
   * This is React's own pattern for deriving state from a prop, and with the
   * React Compiler enabled `react-hooks/set-state-in-effect` rejects the effect
   * form outright — `components/api-key-dialog.tsx` does the same thing for the
   * same reason. Keying on the id matters beyond lint: `useTranscript` re-reads
   * on focus and hands back a new object each time, so loading on every change
   * would wipe out whatever the user had typed every time the screen refocused.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (transcript && loadedFor !== transcript.id) {
    const loaded = editableTurnsFor(transcript);
    setLoadedFor(transcript.id);
    setBaseline(loaded);
    setTurns(loaded.map((turn) => ({ ...turn })));
  }

  const dirty =
    turns !== null && baseline !== null && turnsChanged(baseline, turns);

  /*
   * Catches the hardware back button and the header's, which is the whole
   * point: §3.2's instinct about not losing work is not written down for text
   * the user typed, but losing it would feel the same.
   *
   * `pendingLeave` holds the action so confirming can replay it, rather than
   * guessing which way the user was going.
   */
  const pendingLeave = useRef<(() => void) | null>(null);

  /** Lets go of the edit and continues wherever the user was heading. */
  const discardAndLeave = useCallback(() => {
    setConfirmingDiscard(false);
    const leave = pendingLeave.current;
    pendingLeave.current = null;
    // Marked clean first, so replaying the navigation does not re-trigger the
    // guard and ask the same question again.
    setBaseline(turns);
    leave?.();
  }, [turns]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (!dirty) return;
      event.preventDefault();
      // The action is replayed rather than guessed at, so confirming takes the
      // user wherever they were actually going.
      pendingLeave.current = () => navigation.dispatch(event.data.action);
      setConfirmingDiscard(true);
    });
    return unsubscribe;
  }, [navigation, dirty]);

  const updateTurn = useCallback((index: number, text: string) => {
    setTurns((current) =>
      current === null
        ? current
        : current.map((turn, i) => (i === index ? { ...turn, text } : turn)),
    );
  }, []);

  const save = () => {
    if (!transcript || !turns) return;
    try {
      const saved = saveTranscript(editedTranscript(transcript, turns, new Date()));
      // Marked clean before navigating, so the guard does not fire on the way
      // out and ask the user to discard what was just written.
      setBaseline(turns);
      router.replace(`/transcripts/${saved.id}`);
    } catch {
      setError(
        "Your edit could not be saved to this device. It is still here — try again, or copy the text somewhere safe.",
      );
    }
  };

  if (!transcript) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-2 px-8">
          <Text variant="headline">Transcript not found</Text>
          <Text variant="subhead" className="text-center">
            It may have been deleted. The recording it came from is unaffected.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 px-4 pb-10 pt-4">
        <Text variant="caption">
          {/*
            §20, stated before they type rather than after: editing produces a
            separate transcript, and the one the provider made stays as it is.
          */}
          Saving keeps the original {transcript.providerId} transcript and stores
          your version alongside it.
        </Text>

        {error ? (
          <View className="rounded-md border border-border bg-card p-3">
            <Text variant="body">{error}</Text>
          </View>
        ) : null}

        {(turns ?? []).map((turn, index) => (
          <View key={`${turn.startMs}-${index}`} className="gap-2">
            {/* Read-only: §10 keeps speaker identity out of transcription. */}
            {turn.speaker !== null ? (
              <View className="flex-row items-baseline gap-2">
                <Text variant="caption" className="text-primary">
                  {`Speaker ${turn.speaker + 1}`}
                </Text>
                <Text variant="caption" className="tabular-nums">
                  {formatDuration(turn.startMs)}
                </Text>
              </View>
            ) : null}

            <TextInput
              value={turn.text}
              onChangeText={(text) => updateTurn(index, text)}
              multiline
              textAlignVertical="top"
              accessibilityLabel={
                turn.speaker === null
                  ? "Transcript text"
                  : `Speaker ${turn.speaker + 1} text`
              }
              /*
                `font-mono` explicitly: the app's typeface is set in the `Text`
                component's base styles, and a raw TextInput inherits none of
                it — so an editor without this renders the system font and the
                text visibly changes shape the moment you start editing it.
              */
              className="min-h-[72px] rounded-md border border-border bg-card p-3 font-mono text-[16px] leading-6 text-foreground"
            />
          </View>
        ))}
      </ScrollView>

      <View className="flex-row justify-end gap-2 border-t border-border px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel editing"
          className="min-h-[44px] justify-center rounded-md border border-border px-4 active:opacity-60"
        >
          <Text variant="body">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={dirty ? save : () => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Save transcript"
          className={`min-h-[44px] justify-center rounded-md border px-4 active:opacity-60 ${
            dirty ? "border-foreground bg-card" : "border-border"
          }`}
        >
          <Text variant="body">{dirty ? "Save" : "Done"}</Text>
        </Pressable>
      </View>

      <AlertDialog open={confirmingDiscard} onOpenChange={setConfirmingDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have edited this transcript without saving. Leaving now throws
              those changes away. The original transcript is unaffected either
              way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>Keep editing</Text>
            </AlertDialogCancel>
            <AlertDialogAction onPress={discardAndLeave}>
              <Text>Discard</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
