import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { readingViewFor } from "@/features/transcription/reading";
import { speakerCount } from "@/providers/transcription/speakers";
import { formatDuration } from "@/lib/format";
import type { Transcript } from "@/types";

/**
 * A Transcript's words, speaker-attributed where the Provider said who spoke.
 *
 * Carries no rules of its own: `readingViewFor` decides whether turns can stand
 * in for the text, and this renders whichever answer it gives. That split is
 * deliberate — the decision has consequences (turns that do not cover the text
 * would hide words the user paid for) and belongs somewhere it can be tested.
 *
 * Speaker labels are `Speaker 1`, `Speaker 2` — never names. §10 makes the
 * index a label inside this Transcript only, and a name would claim an identity
 * the Provider never established.
 */
export function TranscriptBody({ transcript }: { transcript: Transcript }) {
  const view = readingViewFor(transcript);

  if (view.kind === "text") {
    return (
      <Text variant="body" selectable>
        {view.text}
      </Text>
    );
  }

  return (
    <View className="gap-4">
      {view.segments.map((segment, index) => {
        /*
         * Consecutive turns by one speaker are grouped under a single heading,
         * which is how a conversation reads rather than how a provider chunks
         * it — Deepgram emits several turns per sentence where AssemblyAI emits
         * one per speaker change.
         *
         * An unattributed turn never continues the previous speaker, however
         * closely it follows: that would attribute it to them.
         */
        const previous = index > 0 ? view.segments[index - 1] : null;
        const continues =
          previous !== null &&
          segment.speaker !== null &&
          previous.speaker === segment.speaker;

        return (
          <View
            key={`${segment.startMs}-${index}`}
            className={continues ? "-mt-3 gap-1" : "gap-1"}
          >
            {continues ? null : (
              <View className="flex-row items-baseline gap-2">
                <Text
                  variant="caption"
                  className={segment.speaker === null ? "" : "text-primary"}
                >
                  {/*
                    Not "Speaker 3". The provider did not say who spoke this
                    turn, and inventing one more person in the room is the
                    claim §10 forbids. Saying so plainly costs a longer label.
                  */}
                  {segment.speaker === null
                    ? "Speaker not identified"
                    : `Speaker ${segment.speaker + 1}`}
                </Text>
                <Text variant="caption" className="tabular-nums">
                  {formatDuration(segment.startMs)}
                </Text>
              </View>
            )}
            <Text variant="body" selectable>
              {segment.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * A one-line summary of who is in a Transcript, for a header.
 *
 * @returns Text such as "2 speakers", or null where there is nothing to say —
 * which includes the single-speaker case, since labelling one speaker adds no
 * information, and the case where the turns were not trusted to stand in for
 * the text.
 */
export function speakerSummary(transcript: Transcript): string | null {
  if (readingViewFor(transcript).kind !== "turns") return null;
  const count = speakerCount(transcript.segments);
  return count >= 2 ? `${count} speakers` : null;
}
