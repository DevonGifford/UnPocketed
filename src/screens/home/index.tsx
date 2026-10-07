import { Pressable, ScrollView, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { HudFrame } from "@/components/hud-frame";
import { Text } from "@/components/ui/text";
import { mockRecordings } from "@/mocks/recordings";
import { useLibrary } from "@/features/library";
import { formatDuration, formatRecordedAt } from "@/lib/format";

function HeroAction({
  title,
  description,
  glyph,
  glyphClassName = "text-primary",
  onPress,
  accessibilityLabel,
}: {
  title: string;
  description: string;
  glyph: string;
  glyphClassName?: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="active:opacity-70"
    >
      <HudFrame tone="accent" className="px-4 py-5">
        <View className="flex-row items-center gap-4">
          <View className="h-14 w-14 items-center justify-center rounded-md border border-border">
            <Text variant="title" className={glyphClassName}>
              {glyph}
            </Text>
          </View>
          <View className="flex-1 gap-1">
            <Text variant="headline" className="text-primary">
              {title}
            </Text>
            <Text variant="caption">{description}</Text>
          </View>
          <Text variant="headline" className="text-muted-foreground">
            ›
          </Text>
        </View>
      </HudFrame>
    </Pressable>
  );
}

function Tile({
  title,
  detail,
  glyph,
  onPress,
}: {
  title: string;
  detail: string;
  glyph: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      className="flex-1 gap-2 rounded-md border border-border p-4 active:opacity-70"
    >
      <View className="flex-row items-start justify-between">
        <Text variant="headline" className="text-primary">
          {glyph}
        </Text>
        <Text variant="caption" className="text-muted-foreground">
          ›
        </Text>
      </View>
      <Text variant="body">{title}</Text>
      <Text variant="caption">{detail}</Text>
    </Pressable>
  );
}

/** Home is a launcher; the full Library lives on Recordings (§29). */
export function HomeScreen() {
  const router = useRouter();
  const { recordings } = useLibrary();
  const recent = recordings.slice(0, 2);
  // Transcripts are PR7, so this still counts fixtures — deliberately, so the
  // tile agrees with the Transcripts screen, which is also still mocked. Both
  // stop reading mocks together.
  const transcriptCount = mockRecordings.reduce(
    (total, recording) => total + recording.transcripts.length,
    0,
  );

  return (
    <Screen>
      <AppHeader />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10">
        <HeroAction
          title="Start Recording"
          description="Capture audio, transcribe locally, and keep your data private."
          glyph="●"
          glyphClassName="text-record"
          accessibilityLabel="Start recording"
          onPress={() => router.push("/record")}
        />

        <HeroAction
          title="Connect Pocket Device"
          description="Sync recordings from your device over USB or Wi-Fi."
          glyph="▭"
          accessibilityLabel="Connect pocket device"
          onPress={() => router.push("/devices")}
        />

        <View className="flex-row gap-4">
          <Tile
            glyph="▤"
            title="Recordings"
            detail={
              recordings.length === 1 ? "1 recording" : `${recordings.length} recordings`
            }
            onPress={() => router.push("/recordings")}
          />
          <Tile
            glyph="▦"
            title="Transcripts"
            detail={`${transcriptCount} transcripts`}
            onPress={() => router.push("/transcripts")}
          />
        </View>

        <View className="flex-row gap-4">
          <Tile
            glyph="↥"
            title="Import"
            detail="From device or files"
            onPress={() => router.push("/import")}
          />
          <Tile
            glyph="◇"
            title="AI Provider"
            detail="Not configured"
            onPress={() => router.push("/settings")}
          />
        </View>

        <View className="mt-2 flex-row items-center justify-between border-t border-border pt-4">
          <Text variant="body">Recent recordings</Text>
          <Link href="/recordings" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all recordings"
              className="min-h-[44px] justify-center active:opacity-70"
            >
              <Text variant="caption" className="text-primary">
                View all →
              </Text>
            </Pressable>
          </Link>
        </View>

        {recent.map((recording) => (
          <Pressable
            key={recording.id}
            onPress={() => router.push(`/recordings/${recording.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${recording.title}, ${formatDuration(recording.durationMs)}`}
            className="flex-row items-center gap-3 rounded-md border border-border p-3 active:opacity-70"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full border border-border">
              <Text variant="caption" className="text-primary">
                ▶
              </Text>
            </View>
            <View className="flex-1">
              <Text variant="body" numberOfLines={1}>
                {recording.title}
              </Text>
              <Text variant="caption" className="tabular-nums">
                {formatRecordedAt(recording.createdAt)} · {formatDuration(recording.durationMs)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}
