import { useLocalSearchParams } from "expo-router";
import { RecordingDetailScreen } from "@/screens/recording-detail";

export default function RecordingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordingDetailScreen id={id} />;
}
