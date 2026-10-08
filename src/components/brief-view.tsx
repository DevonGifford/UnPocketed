import { View } from "react-native";

import { Text } from "@/components/ui/text";
import type { Brief } from "@/types";

/**
 * A Brief, as the transcript screen shows it (§23).
 *
 * **Every section is conditional, and that is the design rather than defensive
 * coding.** §3.7 forbids the appearance of substance where there is none, so a
 * model that could not draw a conclusion produces a Brief with no conclusion,
 * and this renders nothing at all — no heading, no placeholder, no "not
 * available". An empty heading would be the AI theatre the rule exists to stop.
 *
 * It sits **above** the transcript and never replaces it. The reader must
 * always be able to reach what the recogniser actually returned.
 */
export function BriefView({ brief }: { brief: Brief }) {
  const sections = [
    { label: "Summary", body: brief.summary },
    { label: "Overview", body: brief.overview },
    { label: "Conclusion", body: brief.conclusion },
  ].filter((section) => section.body);

  const speakers = Object.entries(brief.speakerNames ?? {});

  return (
    <View className="gap-4 rounded-md border border-border p-4">
      <View className="gap-1">
        {brief.title ? (
          <Text variant="headline" className="text-primary">
            {brief.title}
          </Text>
        ) : null}
        {brief.headline ? <Text variant="subhead">{brief.headline}</Text> : null}
        {/*
          §20, one layer down: a Brief must say which model wrote it, for the
          same reason a Transcript must. Two Briefs of one transcript are only
          comparable if you can tell them apart.
        */}
        <Text variant="caption">
          {brief.providerId} · {brief.modelId}
        </Text>
      </View>

      {sections.map((section) => (
        <View key={section.label} className="gap-1">
          <Text variant="caption" className="tracking-widest">
            {section.label.toUpperCase()}
          </Text>
          <Text variant="body" selectable>
            {section.body}
          </Text>
        </View>
      ))}

      {speakers.length > 0 ? (
        <View className="gap-1">
          <Text variant="caption" className="tracking-widest">
            SPEAKERS
          </Text>
          {speakers.map(([index, name]) => (
            <Text key={index} variant="body">
              {/*
                The recogniser separated the voices; the model only put a name
                to one. Showing both keeps that distinction visible rather than
                letting a guessed name replace the number it belongs to.
              */}
              {`Speaker ${Number(index) + 1} · ${name}`}
            </Text>
          ))}
          <Text variant="caption">
            Names were inferred by {brief.providerId} from what was said, not
            recognised from the voices.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
