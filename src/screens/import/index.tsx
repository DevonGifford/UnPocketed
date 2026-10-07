import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { AppHeader } from "@/components/app-header";
import { HudFrame } from "@/components/hud-frame";
import { Screen } from "@/components/screen";
import { Text } from "@/components/ui/text";
import { useImport } from "@/features/import";
import { formatDuration, formatRecordedAt } from "@/lib/format";

/** The formats §17 commits to, in the order a user would recognise them. */
// TODO(PR6 review): Derive this and the unsupported-format error copy from the
// accepted formats in formats.ts so adding a format cannot leave the UI stale.
const FORMATS = "M4A · MP3 · WAV · MP4 · WebM · AAC · 3GP · OGG · Opus · FLAC";

/**
 * Import (§17). Copies a recording the user already has into the library,
 * where it behaves like any other Recording.
 *
 * The screen says plainly that nothing leaves the device, because "import" is
 * the one action here that involves a file from outside the app and is the
 * easiest to mistake for an upload — a word CONTEXT.md rules out for exactly
 * that reason.
 */
export function ImportScreen() {
  const router = useRouter();
  const { status, failure, lastImported, start, dismissFailure } = useImport();
  const isImporting = status === "importing";

  return (
    <Screen>
      <AppHeader />

      <ScrollView contentContainerClassName="gap-4 px-4 pb-10">
        <HudFrame className="gap-2 px-5 py-6">
          <Text variant="title" className="text-primary">
            Import
          </Text>
          <Text variant="body">
            Bring audio you already have into Unpocketed — a recording exported
            from Pocket, or any file on this device.
          </Text>
          <Text variant="caption" className="mt-1">
            The file is copied into your library and stays on this device.
            Nothing is sent anywhere.
          </Text>
        </HudFrame>

        <Pressable
          onPress={start}
          disabled={isImporting}
          accessibilityRole="button"
          accessibilityLabel="Choose an audio file to import"
          accessibilityState={{ disabled: isImporting }}
          className={
            isImporting
              ? "min-h-[56px] items-center justify-center rounded-md bg-primary opacity-50"
              : "min-h-[56px] items-center justify-center rounded-md bg-primary active:opacity-70"
          }
        >
          <Text variant="headline" className="tracking-widest text-primary-foreground">
            {isImporting ? "IMPORTING…" : "CHOOSE A FILE"}
          </Text>
        </Pressable>

        <Text variant="caption" className="text-center">
          {FORMATS}
        </Text>

        {/*
          §32: a technical failure becomes an explanation. Import never says
          "your audio is safe" — the file it read is the user's own and is
          untouched either way, so there is nothing to reassure them about.
        */}
        {failure ? (
          <View className="gap-2 rounded-md border border-border bg-card p-4">
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

        {lastImported && !failure ? (
          <View className="gap-2 rounded-md border border-border p-4">
            <Text variant="caption">Imported to your library</Text>
            <Text variant="headline" numberOfLines={2}>
              {lastImported.title}
            </Text>
            <Text variant="caption" className="tabular-nums">
              {/*
                A probe that could not decode the file stores 0. Saying
                "duration not read" is honest; "0:00" would claim the file is
                empty, which reads as a bug rather than as a measurement that
                failed.
              */}
              {lastImported.durationMs > 0
                ? formatDuration(lastImported.durationMs)
                : "Duration not read"}
              {" · "}
              {formatRecordedAt(lastImported.createdAt)}
            </Text>
            <Pressable
              onPress={() => router.push(`/recordings/${lastImported.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${lastImported.title}`}
              className="min-h-[44px] justify-center active:opacity-70"
            >
              <Text variant="subhead" className="text-primary">
                Open recording →
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
