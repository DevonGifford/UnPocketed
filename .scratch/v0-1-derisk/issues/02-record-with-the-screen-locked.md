# Can expo-audio record with the screen locked?

Type: research
Status: resolved
Map: [De-risk v0.1](../map.md)

## Question

§13 is unambiguous: a user must be able to start recording, then lock the device, turn off the screen, or switch apps, and come back to a still-running recording. §8 commits the stack to `expo-audio`.

**The spec sequences this wrong.** §38 defers the background-recording work to PR5, but the audio library is locked at §8 and gets wired in at PR3. If `expo-audio` cannot satisfy §13, the answer arrives two PRs after the dependent choice was already made and built on.

Find out, from current Expo documentation, the `expo-audio` changelog/source, and open issues:

1. Does `expo-audio` support **recording that continues** while the app is backgrounded or the screen is locked on Android? Distinguish clearly between *playback* in the background (well supported, and not what §13 asks for) and *recording* in the background.
2. What does it take to make it work — an Android **foreground service** with a `microphone` service type, `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_MICROPHONE` permissions, a config plugin, a custom `AndroidManifest` entry? Name the concrete configuration.
3. Does any of this need a **custom native module or a config plugin Expo does not ship**? Note `expo-audio`'s maturity relative to the older `expo-av` here — if `expo-av` can do something `expo-audio` cannot yet, that is directly relevant.
4. What Android version behaviour matters — API 34+ foreground service type enforcement, battery/doze restrictions, OEM process killing?
5. If `expo-audio` alone cannot do it: what are the real options, and what does each cost? (A community package, `expo-av` instead, a custom native module, a different library entirely.)

Answer the decision this blocks: **can PR3 proceed on `expo-audio` as §8 specifies, or does the audio layer need to change before a line of recording code is written?**

---

## Answer

**GO. PR3 can proceed on `expo-audio` as §8 specifies.** `expo-audio` has shipped first-party
Android background *recording* — not just playback — since 55.0.0 (2026-01-21, PR #41134). It
declares its own `microphone` foreground service and calls
`startForeground(..., FOREGROUND_SERVICE_TYPE_MICROPHONE)`. No custom native module, no
third-party config plugin, no manual manifest edits. `expo-av` is removed as of SDK 55 and never
supported this, so §8 picked the only viable option.

**Config required.** `app.json`: `["expo-audio", { "enableBackgroundRecording": true,
"microphonePermission": "..." }]`. The bundled plugin then adds `RECORD_AUDIO`,
`MODIFY_AUDIO_SETTINGS`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_MICROPHONE` and the `android:foregroundServiceType="microphone"` service.
At runtime: `setAudioModeAsync({ allowsRecording: true, allowsBackgroundRecording: true })` plus
`requestNotificationPermissionsAsync()`.

**The spec's sequencing fix:** set the *plugin* flag at **PR3** (it mutates AndroidManifest, so
flipping it later forces a native rebuild mid-roadmap); leave the *runtime*
`allowsBackgroundRecording` flag off until PR5. Dev build required (§7 is consistent).

**Three gotchas.** (1) Without `allowsBackgroundRecording`, `expo-audio` *actively pauses* the
recorder on background — §13's failure is the default, and a foreground-only PR3 test won't catch
it. (2) On SDK 57 (current stable), `prepareToRecordAsync` **throws** if `POST_NOTIFICATIONS` is
denied (#50705, fixed 58.0.5 only) and can **hang forever** if the service never binds (#50706).
(3) The recording notification is hardcoded and `VISIBILITY_SECRET` — **not shown on the lock
screen**, a partial §13 mismatch. Android also forbids *starting* a mic service from the
background, so PR5 "state restoration" means recover-and-finalise, never auto-resume.

Full findings, with primary-source citations:
[../research/02-expo-audio-background-recording.md](../research/02-expo-audio-background-recording.md)
