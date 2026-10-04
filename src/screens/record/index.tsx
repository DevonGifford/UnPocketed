import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Link } from "expo-router";
import { Screen } from "@/components/screen";
import { Text } from "@/components/text";
import { formatDuration } from "@/lib/format";

/**
 * The record screen (§11). One obvious action, and enough information to be
 * certain recording is active. PR1 mocks the session: the timer is real, the
 * audio is not — PR3 replaces `useMockSession` with expo-audio.
 */
function useMockSession() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isRecording) return;
    startedAt.current = Date.now() - elapsedMs;
    const id = setInterval(() => {
      if (startedAt.current !== null) {
        setElapsedMs(Date.now() - startedAt.current);
      }
    }, 200);
    return () => clearInterval(id);
    // elapsedMs is seeded once per start; re-running on every tick would reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  return {
    isRecording,
    elapsedMs,
    toggle: () => {
      if (isRecording) {
        setIsRecording(false);
        setElapsedMs(0);
      } else {
        setIsRecording(true);
      }
    },
  };
}

export function RecordScreen() {
  const { isRecording, elapsedMs, toggle } = useMockSession();

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

        <View className="h-6 items-center justify-center">
          {isRecording ? <Text variant="subhead">recording…</Text> : null}
        </View>

        {/*
          State is carried by shape (circle vs square), by the label, and only
          then by colour — §31 forbids relying on colour alone.
        */}
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
          accessibilityState={{ selected: isRecording }}
          className="items-center gap-3 active:opacity-70"
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
                  ? "h-7 w-7 rounded-sm bg-onAccent"
                  : "h-7 w-7 rounded-full bg-onAccent"
              }
            />
          </View>
          <Text variant="headline" className="tracking-widest">
            {isRecording ? "STOP" : "RECORD"}
          </Text>
        </Pressable>
      </View>

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
