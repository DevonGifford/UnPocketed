import { FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { Text } from "@/components/ui/text";
import { RecordingRow } from "@/components/recording-row";
import { mockRecordings } from "@/mocks/recordings";

/** The library (§15): every Recording, newest first, regardless of source. */
export function LibraryScreen() {
  const router = useRouter();
  const data = [...mockRecordings].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <Screen>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecordingRow
            recording={item}
            onPress={() => router.push(`/recordings/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <View className="items-center gap-2 px-8 py-24">
            <Text variant="headline">No recordings yet</Text>
            <Text variant="subhead" className="text-center">
              Recordings you make or import will appear here.
            </Text>
          </View>
        }
      />
    </Screen>
  );
}
