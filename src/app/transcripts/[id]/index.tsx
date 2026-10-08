import { useLocalSearchParams } from "expo-router";
import { TranscriptDetailScreen } from "@/screens/transcript-detail";

export default function TranscriptDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TranscriptDetailScreen transcriptId={id} />;
}
