import { FlatList, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { Text } from "@/components/ui/text";
import { RecordingRow } from "@/components/recording-row";
import { useLibrary } from "@/features/library";

/** The recordings list (§15): every Recording, newest first, regardless of source. */
export function RecordingsScreen() {
  const router = useRouter();
  const { recordings, refresh } = useLibrary();

  return (
    <Screen>
      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecordingRow
            recording={item}
            onPress={() => router.push(`/recordings/${item.id}`)}
          />
        )}
        refreshControl={
          // Pull to refresh rescans the directory, which is the user-reachable
          // way to recover audio the index has never seen (§3.2).
          <RefreshControl
            refreshing={false}
            onRefresh={() => refresh({ rescan: true })}
          />
        }
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
