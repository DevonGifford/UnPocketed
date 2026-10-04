import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
  useFonts,
} from "@expo-google-fonts/jetbrains-mono";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalHost } from "@rn-primitives/portal";
import { navColors } from "@/theme/navigation";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // The designs are monospace throughout, so the interface is wrong until the
  // typeface is in. Holding the splash avoids a visible reflow from the system
  // font to JetBrains Mono on launch.
  const [fontsLoaded] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  const scheme = useColorScheme();
  const c = navColors[scheme === "dark" ? "dark" : "light"];

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.background },
          headerTintColor: c.foreground,
          headerTitleStyle: { fontSize: 17, fontFamily: "JetBrainsMono_500Medium" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.background },
        }}
      >
        {/*
          Home, and the screens that carry their own AppHeader, hide the
          navigator header so the wordmark is not doubled up. Pushed detail
          screens keep it, because that is where Back lives.
        */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="record" options={{ title: "Record" }} />
        <Stack.Screen name="recordings/index" options={{ title: "Recordings" }} />
        <Stack.Screen name="recordings/[id]" options={{ title: "" }} />
        <Stack.Screen name="transcripts/index" options={{ headerShown: false }} />
        <Stack.Screen name="transcripts/[id]" options={{ title: "" }} />
        <Stack.Screen name="import" options={{ headerShown: false }} />
        <Stack.Screen name="devices" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
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
