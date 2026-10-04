import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalHost } from "@rn-primitives/portal";
import { navColors } from "@/theme/navigation";

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = navColors[scheme === "dark" ? "dark" : "light"];

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.foreground,
          headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="library" options={{ title: "Library" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
        <Stack.Screen name="recordings/[id]" options={{ title: "" }} />
      </Stack>
      {/*
        Overlay components from `components/ui` (AlertDialog, and anything else
        built on @rn-primitives' Portal) render into this host rather than in
        place, so they escape parent layout and stacking. Without it they mount
        but display nothing.
      */}
      <PortalHost />
    </SafeAreaProvider>
  );
}
