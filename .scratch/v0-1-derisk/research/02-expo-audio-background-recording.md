# Can `expo-audio` record with the screen locked? (Android)

Research for ticket [02-record-with-the-screen-locked](../issues/02-record-with-the-screen-locked.md).
Researched 2026-10-04. Every claim below is sourced to official Expo documentation, the
`expo-audio` changelog, the published `expo-audio` npm tarball / `expo/expo` source tree,
`expo/expo` GitHub issues, or `developer.android.com`. Nothing here is from recall.

---

## 0. Verdict

**GO — `expo-audio` supports Android background and locked-screen *recording* natively. §8 does not
need to change.**

It is a *conditional* go, and the conditions are cheap:

1. The config plugin must be configured with `enableBackgroundRecording: true` in `app.json`.
   This is a **native manifest mutation**, so flipping it requires a new development build.
2. At runtime, `setAudioModeAsync({ allowsBackgroundRecording: true })` must be set — if it is
   *not*, `expo-audio` **actively pauses the recorder** when the activity backgrounds
   (source below). The §13 failure mode is the library's default behaviour.
3. On the current stable release (SDK 57 / `expo-audio@57.0.5`) the app **must request
   `POST_NOTIFICATIONS` at runtime and handle denial**, or background recording cannot even be
   prepared. This is a live bug, fixed only in `58.0.5` (SDK 58, currently the `next` tag).

### Sequencing recommendation (the thing the ticket actually blocks)

Set the **config plugin flag** (`enableBackgroundRecording: true`) in `app.json` at **PR3**, and
leave the **runtime** flag (`allowsBackgroundRecording`) off until PR5.

Rationale: the plugin flag is what writes `AndroidManifest.xml` and therefore what forces a native
rebuild. Deferring it wholesale to PR5 means a mid-roadmap manifest change and dev-build
regeneration. The runtime flag is pure JS and is exactly the behaviour PR5 is meant to deliver.
This decouples the native-config decision (which is what §8 locks in) from the behaviour work
(PR5), and it means PR3's recording code is written against the final native configuration.

§7's requirement of a development build is consistent with this — background recording cannot work
in Expo Go, because it needs a manifest-declared foreground service.

### One OS-level constraint that cannot be engineered around

Android forbids *starting* a `microphone` foreground service while the app is in the background
(while-in-use permission restriction, §4). So PR5's "state restoration" can only mean
*recover and finalise the partial file*; it can never mean *silently resume capture*. Decide this
before PR5 writes a promise it cannot keep. Full reasoning in §4 and §7.3.

---

## 1. Recording, not playback — the distinction is explicitly handled

The ticket is right to be suspicious: most "Expo background audio" material is about *playback*.
`expo-audio` handles both, as **two separate, independently-gated features**, and the source tree
has two distinct foreground services:

```ts
// expo-audio/plugin/src/withAudio.ts (v57.0.5, published tarball)
const PLAYBACK_SERVICE_NAME  = 'expo.modules.audio.service.AudioControlsService';
const RECORDING_SERVICE_NAME = 'expo.modules.audio.service.AudioRecordingService';
```

- Playback: `enableBackgroundPlayback` (default `true`) → `mediaPlayback` FGS type +
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK`.
- **Recording: `enableBackgroundRecording` (default `false`) → `microphone` FGS type +
  `FOREGROUND_SERVICE_MICROPHONE`.**

So: **the docs do not only discuss playback.** The official docs explicitly document
Android background *recording*, and there is a dedicated native `AudioRecordingService` that
calls `startForeground(..., ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)`.

### Official documentation, verbatim

From the [Audio (`expo-audio`) docs](https://docs.expo.dev/versions/latest/sdk/audio/) and the
[SDK 57 versioned page](https://docs.expo.dev/versions/v57.0.0/sdk/audio/):

> `enableBackgroundRecording` — A boolean that determines whether to enable background audio
> recording. On Android, this adds a recording foreground service and permissions and displays a
> persistent notification during recording.

> `allowsBackgroundRecording` (optional) `boolean` — Supported platforms: Android, iOS. Whether
> audio recording should continue when the app moves to the background. Default: `false`

> On Android, background recording requires a foreground service, which displays a persistent
> notification with the text "Recording audio" and a stop button. This notification cannot be
> dismissed while recording is active and automatically disappears when recording stops.

> Background recording can significantly impact battery life. Only enable it when necessary for
> your app's functionality.

The SDK 57 versioned docs page carries **no** experimental / alpha / beta / deprecated banner.

### When it landed, and how mature it is

`expo-audio` [CHANGELOG](https://github.com/expo/expo/blob/main/packages/expo-audio/CHANGELOG.md):

> ## 55.0.0 — 2026-01-21
> ### 🎉 New features
> - [iOS/Android] Add support background recording.
>   ([#41134](https://github.com/expo/expo/pull/41134) by @alanjhughes)

So background recording has shipped since **expo-audio 55.0.0 (Expo SDK 55, 2026-01-21)** —
roughly nine months of release history across SDK 55, 56, 57 and 58, with Android bug fixes
landing continuously (see §6).

Version state at time of research ([registry.npmjs.org/expo-audio](https://registry.npmjs.org/expo-audio),
[registry.npmjs.org/expo](https://registry.npmjs.org/expo)):

| dist-tag | `expo-audio` | `expo` |
| --- | --- | --- |
| `latest` (stable) | `57.0.5` (2026-09-11) | `57.0.26` |
| `next` (beta) | `58.0.5` (2026-10-03) | `58.0.3` |

**SDK 57 is the current stable; SDK 58 is still `next`.** That matters for §6.

---

## 2. The concrete configuration required

### 2a. `app.json` — config plugin (ships with `expo-audio`, no third-party plugin needed)

```json
{
  "expo": {
    "plugins": [
      [
        "expo-audio",
        {
          "enableBackgroundRecording": true,
          "recordAudioAndroid": true,
          "microphonePermission": "Allow Unpocketed to record audio."
        }
      ]
    ]
  }
}
```

`microphonePermission` is iOS-only (`NSMicrophoneUsageDescription`) and harmless to set now for
the later iOS port. `recordAudioAndroid` defaults to `true`; listing it is optional.

### 2b. What the plugin writes — no manual `AndroidManifest.xml` edits needed

Verified by reading `plugin/src/withAudio.ts` in the
[`expo/expo` source](https://github.com/expo/expo/blob/main/packages/expo-audio/plugin/src/withAudio.ts)
and the compiled `plugin/build/withAudio.js` inside the published `expo-audio@57.0.5` tarball.

Permissions added when `enableBackgroundRecording: true`:

| Permission | Added because |
| --- | --- |
| `android.permission.RECORD_AUDIO` | `recordAudioAndroid !== false` |
| `android.permission.MODIFY_AUDIO_SETTINGS` | always (also in the package's own `AndroidManifest.xml`) |
| `android.permission.POST_NOTIFICATIONS` | `enableBackgroundRecording` |
| `android.permission.FOREGROUND_SERVICE` | `enableBackgroundPlayback \|\| enableBackgroundRecording` |
| `android.permission.FOREGROUND_SERVICE_MICROPHONE` | `enableBackgroundRecording` |
| `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK` | `enableBackgroundPlayback` (default `true`) |

Service declaration added when `enableBackgroundRecording: true`:

```xml
<service
  android:name="expo.modules.audio.service.AudioRecordingService"
  android:exported="false"
  android:foregroundServiceType="microphone" />
```

Note that `enableBackgroundPlayback` defaults to **`true`**, so unless Unpocketed passes
`enableBackgroundPlayback: false`, the manifest will also carry `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
and the `mediaPlayback` service. §16 wants playback, so leaving it on is probably correct — but it
is a declared permission that a Play Store listing has to justify, so it is a deliberate choice,
not an accident to discover later.

### 2c. Runtime JS — required, and the default is the §13 failure

```ts
import {
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  requestNotificationPermissionsAsync,
} from 'expo-audio';

await requestRecordingPermissionsAsync();      // RECORD_AUDIO
await requestNotificationPermissionsAsync();   // POST_NOTIFICATIONS — Android only; see §6
await setAudioModeAsync({
  allowsRecording: true,            // iOS-ONLY (`@platform ios` in Audio.types.ts); no Android effect
  allowsBackgroundRecording: true,  // THE flag that keeps Android recording alive
});
```

`requestNotificationPermissionsAsync` is a real, exported `expo-audio` API — confirmed present in
`expo-audio@57.0.5` (`src/ExpoAudio.ts:557`, `src/index.ts` re-exports `./ExpoAudio`,
`build/ExpoAudio.d.ts:327`). It throws if called on a non-Android platform. **No extra dependency
is needed outside §8's stack.**

**Why the runtime flag is mandatory.** From `AudioModule.kt` on the `sdk-57` branch
([source](https://github.com/expo/expo/blob/sdk-57/packages/expo-audio/android/src/main/java/expo/modules/audio/AudioModule.kt)):

```kotlin
OnActivityEntersBackground {
  if (!shouldPlayInBackground) { /* ...pause players... */ }
  if (!allowsBackgroundRecording) {
    recorders.values.forEach { recorder ->
      if (recorder.isRecording) {
        recorder.pauseRecording()
      }
    }
  }
}
```

Without `allowsBackgroundRecording: true`, `expo-audio` **deliberately pauses every active
recorder** the moment the activity backgrounds, and resumes it in `OnActivityEntersForeground`.
That is precisely the "recording silently stopped while the screen was off" bug §13 forbids, and
it is the library's out-of-the-box behaviour. Any PR3 smoke test that only exercises
foreground recording will pass while §13 is broken.

`setAudioModeAsync` wires the flag straight into the recorder
(`AudioModule.kt`, `sdk-57`, lines 211–220):

```kotlin
AsyncFunction("setAudioModeAsync") { mode: AudioMode ->
  ...
  allowsBackgroundRecording = mode.allowsBackgroundRecording
  recorders.values.forEach { recorder ->
    recorder.useForegroundService = allowsBackgroundRecording
  }
```

**Historical gotcha, now fixed — do not copy old blog posts.** In the SDK 54 line
(`expo-audio@1.1.x`) the recorder pause was gated on the *playback* flag `shouldPlayInBackground`,
so background recording also required `shouldPlayInBackground: true`. See
[issue #46731 — "allowsBackgroundRecording starts the foreground service but recording still
pauses on background"](https://github.com/expo/expo/issues/46731) (2026-06-10, SDK 54 /
`expo-audio@1.1.1`), fixed by
[PR #42134 "removed requiring shouldPlayInBackground for background recording"](https://github.com/expo/expo/pull/42134).
I verified against the `sdk-57` source above that the gating is now correctly on
`allowsBackgroundRecording`, so **`shouldPlayInBackground` is not required for recording** on
SDK 55+. Much of the community writing on this is pre-fix and will tell you otherwise.

---

## 3. Custom native module or unshipped plugin? No.

**No custom native module is required. No third-party config plugin is required.** Everything is
first-party, in-tree, and shipped inside the `expo-audio` npm package.

Confirmed by unpacking the published `expo-audio@57.0.5` tarball
(`https://registry.npmjs.org/expo-audio/-/expo-audio-57.0.5.tgz`), which contains both the
compiled config plugin (`plugin/build/withAudio.js`) and the Kotlin sources
(`android/src/main/java/expo/modules/audio/service/AudioRecordingService.kt`, etc.).

### The native implementation, for reference

`AudioRecordingService.kt` is a bound `Service` that `expo-audio` starts and binds to when
`useForegroundService` is set. Key excerpts (identical in `sdk-57` and `main`):

```kotlin
private fun startForegroundWithNotification() {
  val notification = buildNotification()
  try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      startForeground(
        notificationId,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      )
    } else {
      startForeground(notificationId, notification)
    }
```

This is exactly the configuration Android requires (§4). It also reference-counts recorders
(`registerRecorder` / `unregisterRecorder`) and calls `stopForeground(STOP_FOREGROUND_REMOVE)` +
`stopSelf()` when the last recorder stops — so the notification is correctly torn down.

### `expo-av` comparison — there is nothing to compare against

**`expo-av` is gone.** From the
[SDK 54 `expo-av` docs page](https://docs.expo.dev/versions/v54.0.0/sdk/av/):

> **Deprecated:** The `Video` and `Audio` APIs from `expo-av` have now been deprecated and replaced
> by improved versions in `expo-video` and `expo-audio`. We recommend using those libraries
> instead. `expo-av` is not receiving patches and will be removed in SDK 55.

Corroborated by npm: `expo-av` dist-tags are `latest: 16.0.8` (published 2025-12-05, the SDK 54
line) with no `sdk-55`/`sdk-56`/`sdk-57` tags at all
([registry.npmjs.org/expo-av](https://registry.npmjs.org/expo-av)).

And `expo-av` was *worse* at this, not better. Background recording was a long-standing unfixed
`expo-av` complaint:
[#14573 "[expo-av] Cannot record in the background on Android"](https://github.com/expo/expo/issues/14573),
[#30371 "Expo-av do not record in background for Android"](https://github.com/expo/expo/issues/30371),
[#10501 "[expo-av] Audio recording input stops on (newer) Android devices when in App Standby"](https://github.com/expo/expo/issues/10501),
[#25977 "Expo AV Android Recording In Background Muted After 1 Minute"](https://github.com/expo/expo/issues/25977).
`expo-av` never shipped a microphone foreground service. **`expo-audio` is strictly the more
capable choice here** — §8 is correct, and `expo-av` is not even an available fallback.

### Maturity assessment

- Background recording shipped SDK 55 (2026-01-21), continuously patched through 58.0.5 (2026-10-03).
- The SDK 57 docs page carries no experimental/alpha banner.
- A GitHub search of `expo/expo` for open issues mentioning `expo-audio` + background + recording
  returned **0 open issues** (33 total, all closed). The bugs are being closed, not accumulating.
- Fixes are coming from Expo staff (`@alanjhughes`, `@behenate`) as well as outside contributors.

Conclusion: **production-usable, actively maintained, with sharp edges listed in §6.** This is a
normal "read the issues before you ship" situation, not an "unbuilt feature" situation.

---

## 4. Android platform behaviour that matters

### API 34+ (Android 14) foreground service type enforcement — satisfied

From [Foreground service types are required](https://developer.android.com/develop/background-work/services/fgs/service-types):

> Beginning with Android 14 (API level 34), you must declare an appropriate service type for each
> foreground service. That means you must declare the service type in your app manifest, and also
> request the appropriate foreground service permission for that type (in addition to requesting
> the `FOREGROUND_SERVICE` permission).

For the `microphone` type specifically:

> Foreground service type to declare in manifest under `android:foregroundServiceType`: `microphone`
> Permission to declare in your manifest: `FOREGROUND_SERVICE_MICROPHONE`
> Constant to pass to `startForeground()`: `FOREGROUND_SERVICE_TYPE_MICROPHONE`
> Request and be granted the `RECORD_AUDIO` runtime permission.

`expo-audio`'s plugin + service satisfy all four (§2b, §3). Any Expo SDK 57 app targets well
above API 34, so this enforcement definitely applies to Unpocketed.

### The "while-in-use" restriction — the one real architectural constraint

From the same page:

> **Note:** The `RECORD_AUDIO` runtime permission is subject to while-in-use restrictions. For this
> reason, you cannot create a `microphone` foreground service while your app is in the background
> and you cannot launch a `microphone` foreground service from a `BOOT_COMPLETED` receiver, with a
> few exceptions.

And from [Restrictions on starting a foreground service from the background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start):

> If your app has a while-in-use permission, it only has that permission *while it's in the
> foreground*. This means if your app is in the background, and it tries to create a foreground
> service of type camera, location, or microphone, the system sees that your app doesn't
> *currently* have the required permissions, and it throws a `SecurityException`.

> For this reason, if your foreground service needs a while-in-use permission, you must call
> `Context.startForegroundService()` or `Context.bindService()` while your app has a visible
> activity, unless the service falls into one of the defined exemptions.

> Apps that target Android 12 (API level 31) or higher can't start foreground services while the
> app is running in the background […] the system throws `ForegroundServiceStartNotAllowedException`.

**Implication for Unpocketed, and it matches §13's wording exactly.** Recording must be *started*
from the foreground. §13 says "begin recording and subsequently lock the device" — begin first,
lock second. That is legal and supported. What is *not* possible on any Android stack (not an
`expo-audio` limitation — an OS one) is starting a recording from the background: no scheduled
recording, no voice-trigger wake, no "resume the interrupted recording automatically after the
process was killed while the screen was off". PR5's "state restoration" must therefore mean
*recover and finalise the partial file*, not *silently resume capture*. §14's "unexpected
application termination where recovery is technically possible" is the right framing; auto-resume
is not technically possible.

Exemptions exist (system component starts the service, widget interaction, notification
interaction, `PendingIntent` from a visible app, device-policy-controller, `VoiceInteractionService`,
`START_ACTIVITIES_FROM_BACKGROUND`). The notification-interaction exemption is the only plausible
one for a consumer app, and it is not worth designing around for v0.1.

### Android 15 (API 35) FGS timeouts — `microphone` is NOT affected

From [Android 15 behavior changes](https://developer.android.com/about/versions/15/behavior-changes-15):
the new 6-hours-in-24 FGS timeout (`Service.onTimeout()`) applies to **`dataSync`** and
**`mediaProcessing`** only. The `microphone` type is **not** in the timeout list. It *is* in the
list of types a `BOOT_COMPLETED` receiver may not launch — "(this restriction has been in place
for `microphone` since Android 14)" — which only re-confirms the while-in-use point above.

**So there is no OS-imposed wall-clock cap on a `microphone` FGS.** §38 PR5's exit condition ("an
hour-long real-world recording can be trusted") is not fighting a documented OS timeout.

### Doze / App Standby — not the threat

From [Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby),
the restrictions Doze actually applies are:

> * Suspends network access.
> * Ignores wake locks.
> * Defers standard `AlarmManager` alarms […] to the next maintenance window.
> * Doesn't perform Wi-Fi scans.
> * Doesn't let sync adapters run.
> * Doesn't let `JobScheduler` run.

None of those stop an already-running `microphone` foreground service capturing to a local file —
and Google prescribes the `microphone` FGS type for exactly this use case. The relevant Doze
restriction for Unpocketed is **suspended network access**, which affects §18/§21 *transcription
uploads* (a job that must tolerate being deferred), not §13 *capture*.

Note the policy constraint if anyone proposes a battery-optimisation whitelist prompt:

> Google Play policies prohibit apps from requesting direct exemption from Power Management
> features—Doze and App Standby—in Android 6.0 and above unless the core function of the app is
> adversely affected.

A long-running recorder arguably qualifies, but the FGS already covers the need, so
`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` should not be shipped in v0.1.

### OEM process killing — the actual undocumented risk

This is the part with no authoritative primary source, because vendors do not document it. The
evidence that it bites `expo-audio` users is in the issue tracker:
[#40626 "expo-audio: Once started the recording and put app in background app gets auto killed
after few seconds"](https://github.com/expo/expo/issues/40626) (2025-10-26, closed). Aggressive
OEM memory managers (Xiaomi/MIUI, Samsung, Huawei, OnePlus, Oppo) kill background processes
regardless of FGS status.

Mitigation is a §14 problem, not a §13 one: the recording must be written incrementally to disk
so a killed process leaves a recoverable file, and startup must detect and finalise an orphaned
recording. §12/§14 already lean this way ("prefer preserving recoverable audio over producing
perfectly tidy metadata"). **§36's manual recording test matrix should name specific OEM devices.**

---

## 5. Fallbacks

Not needed, and mostly unavailable:

- **`expo-av`** — removed in SDK 55, unmaintained, and never supported background recording
  anyway (§3). Not an option.
- **Community recorders** (`react-native-audio-recorder-player`,
  `@dr.pogodin/react-native-audio-recorder`, `react-native-audio-api`, etc.) — would each need
  their own foreground-service wiring and would duplicate what `expo-audio` already ships, in
  violation of §3.6 ("simple before clever") and §8's single-audio-stack commitment.
- **Custom native module / custom config plugin** — unnecessary; `expo-audio` already ships the
  `microphone` foreground service.

The only genuine decision is **which SDK line to build on** (§6), not which library.

---

## 6. Live bugs and friction to plan around

### 6a. `POST_NOTIFICATIONS` is a hard requirement on SDK 57 — plan for it in PR3

Verified in the published `expo-audio@57.0.5` tarball, `android/src/main/java/expo/modules/audio/AudioRecorder.kt:88-89`:

```kotlin
suspend fun prepareRecording(options: RecordingOptions?) {
  ...
  if (useForegroundService && !hasNotificationPermissions()) {
    throw NotificationPermissionsException()
  }
```

and `AudioExceptions.kt:17`:

```kotlin
internal class NotificationPermissionsException :
  CodedException(
    "POST_NOTIFICATIONS permission has not been granted. This permission is required when using background recording (allowsBackgroundRecording: true). " +
      "Request notification permissions using AudioModule.requestNotificationPermissionsAsync() before calling prepareRecording()."
  )
```

`hasNotificationPermissions()` returns `true` below API 33, so this only bites **Android 13+**.

Expo considers this behaviour a bug:
[#50705 "[expo-audio][android] prepareToRecordAsync throws when notifications are denied and
allowsBackgroundRecording is on, though Android doesn't need POST_NOTIFICATIONS for a foreground
service"](https://github.com/expo/expo/issues/50705) (2026-09-28, affecting `expo-audio@57.0.5`),
fixed by [PR #50968](https://github.com/expo/expo/pull/50968):

> ## 58.0.5
> - [Android] Fixed `prepareToRecordAsync` rejecting when `allowsBackgroundRecording` is `true`
>   and the notification permission is not granted (#50705).

**The fix is 58.0.5-only.** The `sdk-57` branch CHANGELOG's `Unpublished` section is empty, so
there is no backport pending. On SDK 57 a user who taps "Don't allow" on the notification prompt
gets a recorder that **cannot prepare at all** — a total feature failure, not a degraded one, and
the reporter observed real users hitting it.

Action for PR3: call `requestNotificationPermissionsAsync()` alongside
`requestRecordingPermissionsAsync()`, and build a §32 error path for denial that explains the
recording notification is required. Do not treat notification permission as optional polish.

### 6b. `prepareToRecordAsync` can hang forever on SDK 57

Verified in the published `expo-audio@57.0.5` tarball: `AudioRecordingServiceConnection.kt`
*defines* `startBindingTimeout()` (line 39) but **never calls it** — `grep -rn startBindingTimeout
android/src/` returns the definition only. `bindWithService()` stores the continuation and returns:

```kotlin
transitionToState(ServiceBindingState.BINDING)
bindingContinuation = continuation
// (no startBindingTimeout() call in 57.0.5)
```

If the system never delivers `onServiceConnected`, the `prepareToRecordAsync` promise never
settles. On `main`/58.0.5 the call is present with a comment saying as much:

> // Without a timeout, the promise would never settle if the system never calls back.

See [#50706 "AudioRecordingServiceConnection.bindWithService can suspend forever"](https://github.com/expo/expo/issues/50706)
and [PR #50883](https://github.com/expo/expo/pull/50883):

> ## 58.0.5
> - [Android] Fix `prepareToRecordAsync()` hanging forever when background recording is enabled and
>   the recording service never connects. The binding timeout is now started, and the promise also
>   rejects when the React context is lost.

Action: on SDK 57, wrap `prepareToRecordAsync` in a JS-side timeout — ~6s, i.e. just above the
5000ms native bind timeout that 58.0.5 uses, so the JS guard fires only when the native one would
have — so the §32 UI can
surface "couldn't start recording" instead of hanging on a spinner forever. §14 lists "audio API
errors" — this is one.

### 6c. The recording notification is not customisable, and is hidden from the lock screen

From `AudioRecordingService.kt` (identical in `57.0.5` and `main`):

```kotlin
return NotificationCompat.Builder(this, CHANNEL_ID)
  .setContentTitle("Recording audio")
  .setContentText("Tap to return to app")
  .setSmallIcon(android.R.drawable.ic_btn_speak_now)
  .setOngoing(true)
  ...
  .setVisibility(NotificationCompat.VISIBILITY_SECRET) // Hide from lock screen on secure devices
  .build()
```

Three consequences:

1. **`VISIBILITY_SECRET` means the recording notification is not shown on the lock screen** of a
   secured device. §13 says "A persistent system indication that recording is active is acceptable
   and desirable" — it is present in the shade and in the status bar (and Android 12+ shows the
   green microphone privacy indicator regardless), but **not on the lock screen itself**. This is a
   partial mismatch with §13's intent and there is no plugin prop to change it. Worth a decision:
   accept it, or note it as a known deviation. It does not break recording.
2. Title, body and icon are **hardcoded English strings** with a stock Android icon
   (`android.R.drawable.ic_btn_speak_now`). Not brandable, not localisable, no config prop exists.
   §30/§28 should not promise a branded recording notification for v0.1.
3. The notification's **Stop** action fires `ACTION_STOP_RECORDING`, which calls `stopRecording()`
   on the native recorder directly:

   ```kotlin
   private fun stopRecordingAndService() {
     synchronized(recorderLock) {
       activeRecorders.forEach { weakRef -> weakRef.get()?.stopRecording() }
       activeRecorders.clear()
     }
     stopForegroundWithNotification()
     stopSelf()
   }
   ```

   This is a **user-reachable path that ends a recording without going through JS**. §14's
   "interruption handling" and PR5's "state restoration" must cover it: the JS layer has to
   reconcile its state on next foreground rather than assume it owns every stop. §11's recording
   workflow should account for a recording that ended while the UI was not running.

### 6d. SDK 57 vs SDK 58

- **SDK 57 (`latest`)**: stable; needs the 6a workaround (request `POST_NOTIFICATIONS`, handle
  denial) and the 6b workaround (JS-side timeout). Both are small and both are things a careful
  app wants anyway.
- **SDK 58 (`next`, `expo-audio@58.0.5`)**: both fixed, plus `fileSize` on `RecorderState`
  (useful for §32 low-storage handling) and a `fileName` option on `RecordingOptions`. Still beta.

Recommendation: **start on SDK 57 with both workarounds**, and plan to pick up SDK 58 before the
PR10 release when it goes stable. The workarounds are not throwaway — they are legitimate §32
error handling.

---

## 7. Contradictions / tensions with the spec

1. **§38's sequencing is wrong in a specific, fixable way.** The `enableBackgroundRecording`
   config-plugin flag is a native manifest change requiring a dev-build regeneration. Set it at
   PR3; gate the behaviour with the runtime `allowsBackgroundRecording` flag at PR5. See §0.
2. **§13's "persistent system indication" is not on the lock screen.** `expo-audio` hardcodes
   `VISIBILITY_SECRET`. Not changeable without forking. (§6c)
3. **§13 + §14 cannot mean auto-resume after a kill.** Android's while-in-use restriction forbids
   *starting* a `microphone` foreground service from the background. "State restoration" must mean
   recover-and-finalise the partial file, with the user re-starting capture. (§4)
4. **§8's choice of `expo-audio` is not just viable, it is the only viable choice** — `expo-av` is
   removed as of SDK 55 and never supported this. The spec is right; it just didn't know why.
5. **`enableBackgroundPlayback` defaults to `true`**, so the manifest will carry
   `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and a `mediaPlayback` service even if nobody asks for it.
   Decide deliberately (§16 wants playback, so probably keep it) rather than discovering it in a
   Play Store review. (§2b)
6. **§36's test matrix needs named OEM devices.** The only real residual risk is vendor process
   killing, and it is device-specific. (§4)
7. **§12's recording-quality work should write incrementally to disk.** The mitigation for OEM
   kills is file recoverability, which is a PR3-era architectural choice, not a PR5 one. (§4, §14)

---

## Sources

Official documentation:
- [Audio (`expo-audio`) — Expo docs, latest](https://docs.expo.dev/versions/latest/sdk/audio/)
- [Audio (`expo-audio`) — Expo docs, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)
- [AV (`expo-av`) — Expo docs, SDK 54 (deprecation banner)](https://docs.expo.dev/versions/v54.0.0/sdk/av/)

`expo-audio` source and releases:
- [`expo-audio` CHANGELOG](https://github.com/expo/expo/blob/main/packages/expo-audio/CHANGELOG.md)
- [`expo-audio` CHANGELOG, `sdk-57` branch](https://github.com/expo/expo/blob/sdk-57/packages/expo-audio/CHANGELOG.md)
- [`plugin/src/withAudio.ts`](https://github.com/expo/expo/blob/main/packages/expo-audio/plugin/src/withAudio.ts)
- [`AudioRecordingService.kt`](https://github.com/expo/expo/blob/main/packages/expo-audio/android/src/main/java/expo/modules/audio/service/AudioRecordingService.kt)
- [`AudioRecordingServiceConnection.kt`](https://github.com/expo/expo/blob/main/packages/expo-audio/android/src/main/java/expo/modules/audio/service/AudioRecordingServiceConnection.kt)
- [`AudioModule.kt` (`sdk-57`)](https://github.com/expo/expo/blob/sdk-57/packages/expo-audio/android/src/main/java/expo/modules/audio/AudioModule.kt)
- [`AudioRecorder.kt` (`sdk-57`)](https://github.com/expo/expo/blob/sdk-57/packages/expo-audio/android/src/main/java/expo/modules/audio/AudioRecorder.kt)
- Published tarball inspected directly: `https://registry.npmjs.org/expo-audio/-/expo-audio-57.0.5.tgz`
- [`registry.npmjs.org/expo-audio`](https://registry.npmjs.org/expo-audio) · [`registry.npmjs.org/expo`](https://registry.npmjs.org/expo) · [`registry.npmjs.org/expo-av`](https://registry.npmjs.org/expo-av)

`expo/expo` issues and PRs:
- [#41134 — Add support background recording (PR)](https://github.com/expo/expo/pull/41134)
- [#42134 — removed requiring shouldPlayInBackground for background recording (PR)](https://github.com/expo/expo/pull/42134)
- [#46731 — allowsBackgroundRecording starts the FGS but recording still pauses](https://github.com/expo/expo/issues/46731)
- [#50705 — prepareToRecordAsync throws when notifications are denied](https://github.com/expo/expo/issues/50705) · [PR #50968](https://github.com/expo/expo/pull/50968)
- [#50706 — bindWithService can suspend forever](https://github.com/expo/expo/issues/50706) · [PR #50883](https://github.com/expo/expo/pull/50883)
- [#40945 / #40944 — Support for background recording on Android with expo-audio](https://github.com/expo/expo/issues/40945)
- [#40626 — app auto-killed in background during recording](https://github.com/expo/expo/issues/40626)
- [#14573 — [expo-av] Cannot record in the background on Android](https://github.com/expo/expo/issues/14573)
- [#30371 — Expo-av do not record in background for Android](https://github.com/expo/expo/issues/30371)
- [#10501 — [expo-av] recording input stops in App Standby](https://github.com/expo/expo/issues/10501)
- [#25977 — Expo AV Android recording in background muted after 1 minute](https://github.com/expo/expo/issues/25977)

Android platform documentation:
- [Foreground service types are required](https://developer.android.com/develop/background-work/services/fgs/service-types)
- [Restrictions on starting a foreground service from the background](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [Behavior changes: Android 15](https://developer.android.com/about/versions/15/behavior-changes-15)
- [Optimize for Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)
