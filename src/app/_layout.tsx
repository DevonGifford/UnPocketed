import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { navColors } from "@/theme/navigation";

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = navColors[scheme === "dark" ? "dark" : "light"];

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.canvas },
          headerTintColor: c.ink,
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.canvas },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="library" options={{ title: "Library" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
        <Stack.Screen name="recordings/[id]" options={{ title: "" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
