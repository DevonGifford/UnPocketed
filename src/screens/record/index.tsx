import { Pressable, View } from "react-native";
import { Link } from "expo-router";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { useRecordingSession } from "@/features/recording";
import { formatDuration } from "@/lib/format";

/**
 * The record screen (§11). One obvious action, and enough information to be
 * certain recording is active. PR3 replaced PR1's mocked session with
 * `useRecordingSession`, so the timer, the audio and the saved file are all
 * real.
 */
export function RecordScreen() {
  const { status, elapsedMs, failure, lastSaved, toggle, dismissFailure } =
    useRecordingSession();

  const isRecording = status === "recording";
  // Preparing and saving both await native work. The control stays visible but
  // inert, so a second press cannot start a parallel transition.
  const isBusy = status === "preparing" || status === "saving";

  return (
    <Screen>
      <View className="flex-row justify-end px-4 py-2">
        <Link href="/settings" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            className="min-h-[44px] min-w-[44px] items-center justify-center"
          >
            <Text variant="subhead">Settings</Text>
          </Pressable>
        </Link>
      </View>

      <View className="flex-1 items-center justify-center gap-10">
        <Text variant="timer" accessibilityLabel={`Elapsed ${formatDuration(elapsedMs)}`}>
          {formatDuration(elapsedMs)}
        </Text>

        {/*
          Reserved height so the layout does not jump between states — §11
          forbids anything that creates uncertainty about whether recording is
          actually happening.
        */}
        <View className="h-6 items-center justify-center">
          {status === "preparing" ? <Text variant="subhead">preparing…</Text> : null}
          {status === "recording" ? <Text variant="subhead">recording…</Text> : null}
          {status === "saving" ? <Text variant="subhead">saving…</Text> : null}
          {status === "idle" && lastSaved && !failure ? (
            <Text variant="subhead">saved to your library</Text>
          ) : null}
        </View>

        {/*
          State is carried by shape (circle vs square), by the label, and only
          then by colour — §31 forbids relying on colour alone.
        */}
        <Pressable
          onPress={toggle}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
          accessibilityState={{ selected: isRecording, disabled: isBusy }}
          className={
            isBusy
              ? "items-center gap-3 opacity-50"
              : "items-center gap-3 active:opacity-70"
          }
        >
          <View
            className={
              isRecording
                ? "h-20 w-20 items-center justify-center rounded-md bg-record"
                : "h-20 w-20 items-center justify-center rounded-full bg-record"
            }
          >
            <View
              className={
                isRecording
                  ? "h-7 w-7 rounded-sm bg-primary-foreground"
                  : "h-7 w-7 rounded-full bg-primary-foreground"
              }
            />
          </View>
          <Text variant="headline" className="tracking-widest">
            {isRecording ? "STOP" : "RECORD"}
          </Text>
        </Pressable>
      </View>

      {/*
        §32: a technical failure becomes an explanation, and says whether the
        audio survived. `audioIntact` is stated rather than implied, because
        "your recording is safe" must only appear when it is true (§3.2).
      */}
      {failure ? (
        <View className="mx-4 mb-4 gap-2 rounded-md border border-border bg-card p-4">
          <Text variant="headline">{failure.title}</Text>
          <Text variant="body">{failure.detail}</Text>
          <Pressable
            onPress={dismissFailure}
            accessibilityRole="button"
            accessibilityLabel="Dismiss message"
            className="min-h-[44px] justify-center active:opacity-70"
          >
            <Text variant="subhead">Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="items-center pb-6">
        <Link href="/library" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open library"
            className="min-h-[44px] justify-center px-6"
          >
            <Text variant="subhead">Library</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}
