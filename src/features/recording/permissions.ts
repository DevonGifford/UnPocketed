import { Platform } from "react-native";
import {
  getRecordingPermissionsAsync,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";

import { recordingFailure, type RecordingFailure } from "./errors";

/**
 * Permission gathering for a recording session (§11: "verify microphone
 * permission").
 *
 * The order here is load-bearing, not stylistic. On SDK 57,
 * `prepareToRecordAsync` *throws* when `POST_NOTIFICATIONS` is denied on
 * Android 13+ (expo/expo#50705), so the notification permission has to be
 * settled before preparing rather than alongside it. §13 forces that request
 * anyway — a microphone foreground service must post a visible notification —
 * so this is correct sequencing rather than a workaround.
 *
 * `POST_NOTIFICATIONS` is only declared in the manifest because the
 * `expo-audio` plugin is configured with `enableBackgroundRecording: true`;
 * without that flag the request below could never be granted.
 */
export async function ensureRecordingPermissions(): Promise<RecordingFailure | null> {
  const existing = await getRecordingPermissionsAsync();
  if (!existing.granted) {
    const requested = await requestRecordingPermissionsAsync();
    if (!requested.granted) return recordingFailure("microphone-denied");
  }

  // Android-only: the function throws on other platforms by design.
  if (Platform.OS === "android") {
    const notifications = await requestNotificationPermissionsAsync();
    if (!notifications.granted) return recordingFailure("notifications-denied");
  }

  return null;
}
