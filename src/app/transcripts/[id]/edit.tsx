import { useLocalSearchParams } from "expo-router";
import { TranscriptEditScreen } from "@/screens/transcript-edit";

export default function TranscriptEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TranscriptEditScreen transcriptId={id} />;
}
