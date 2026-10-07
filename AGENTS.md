# AGENTS.md

Unpocketed is a local-first Android app for recording, importing, transcribing and exporting spoken audio. No backend, no account, no subscription — users bring their own transcription provider and API key.

The app uses Expo SDK 57, Expo Router, Uniwind with Tailwind 4, and strict TypeScript. Recording and file persistence are implemented; the Library, playback, and transcription still use mock data or placeholders. The target UI is being built ahead of some v0.1 behavior, as recorded in the decision map.

## Read before changing anything

- **[docs/spec.md](docs/spec.md)** — the authority on product shape: scope, domain model, UI direction, the PR1–PR10 roadmap, and §6's explicit non-goals. Consult it before adding a feature, naming an entity, picking a dependency, or judging something out of scope. Sections are numbered; cite them (`§13`) when a decision traces back to one.
- **[.scratch/v0-1-derisk/map.md](.scratch/v0-1-derisk/map.md)** — what has been settled and what is still open. Consult it before any architectural choice: the answer may already exist under *Decisions so far*, or may be an open ticket that is deliberately someone else's to make.
- **[CONTEXT.md](CONTEXT.md)** — the domain glossary. Use its terms in code, types, comments and commit messages.

## Invariants

**The original audio is sacred.** A transcript, a summary, or any metadata can be regenerated; a lost recording cannot. Code that touches a stored audio file preserves it unless the user explicitly asked for deletion.

**Recordings stay on the device** until the user explicitly asks for cloud transcription. There is no Unpocketed server to send anything to, and §6 keeps it that way.

**Commit as the work completes.** Stage and commit each slice as it lands, with a short conventional subject and a body only where it earns its place. Devon reads history as a narrative, so frequent small commits beat one large one at the end. Branches are fine to open; **pull requests are Devon's alone** — never open one.

## Comments and commit messages

Keep source comments sparse. Explain non-obvious constraints, failure behavior, and decisions that code alone cannot show. Use JSDoc for public APIs when parameters, return values, or examples help a caller; do not restate TypeScript types or narrate JSX.

When drafting a commit message for Devon for Codex-assisted work, include this trailer so he can preserve the attribution if he chooses:

```text
Co-Authored-By: codex <codex@openai.com>
```

## Gotchas already paid for

Each of these cost research to establish and none is discoverable by reading the code.

- **`expo-audio` pauses an active recording the moment the app backgrounds**, unless `enableBackgroundRecording: true` is set in the `app.json` plugin config. The default is `false`, so a foreground-only test passes while §13 is broken. The plugin flag mutates the Android manifest, so it belongs at **PR3** even though background recording is PR5 work — setting it later forces a native rebuild mid-roadmap. The runtime flag (`setAudioModeAsync({ allowsBackgroundRecording: true })`) can wait for PR5.
- **A screen-owned recorder destroys the recording when the screen unmounts.** `useAudioRecorder` returns a shared object that `useReleasingSharedObject` releases on unmount, `AudioRecorder.sharedObjectDidRelease()` calls `reset()`, and `reset()` calls `MediaRecorder.release()` **without** `stop()` first — so the MP4 `moov` box is never written and the file will not play. With the session inside the Record screen, an ordinary Back press mid-recording therefore destroyed the recording, which is why `RecordingSessionProvider` sits above the navigator in `src/app/_layout.tsx`. Keep it there. §14 lists "UI remounts" for precisely this.

- **`expo-audio`'s audio-focus handling never touches recorders.** `AudioModule`'s `OnAudioFocusChangeListener` iterates `allPlayables` only, so losing focus — a phone call, an alarm — neither stops nor errors an active recorder. Android gives the lower-priority app silence instead, so an interruption costs a silent stretch of audio rather than the recording. Nothing needs handling for the recording to survive; do not add pause/resume logic expecting an event that never arrives. `MediaRecorder.onError` is a separate path, and it emits `isFinished: true` with **no url** and without resetting, leaving the part-written file in the capture directory for recovery to adopt.

- **`adb shell am force-stop` does not simulate a process kill for recording.** `MediaRecorder` runs in the media server, not the app process, so when the app's binder dies the media server still stops and finalises the file — the `moov` box gets written and the result is **fully playable**. Verified on device: a force-stopped 12-second capture came back intact, `ffprobe` reading 12.19s. So force-stop tests nothing about the interrupted path, and a green run there means only that recovery correctly classified a complete file. To exercise the real thing, build the artifact a kill leaves behind: take a real capture, overwrite the `moov` box type with `free`, zero the `mdat` 64-bit size, and `run-as` it into `files/Audio/`. (The same device trick — `adb shell input` is blocked by MIUI — is why that directory has to be written rather than recorded into.)

- **`setAudioModeAsync` does not merge — it overwrites every field.** The signature is `Partial<AudioMode>`, which reads like a patch, but `AudioModule.kt` assigns all five Android fields from the incoming record and the `AudioMode` record in `AudioRecords.kt` defaults a missing `allowsBackgroundRecording` to `false`. The module then writes that straight to `useForegroundService` on **every live recorder**, so one partial call from anywhere in the app silently turns background recording off — the §13 bug again, and again invisible to a foreground-only test. All mode changes therefore go through `updateAudioMode` in `src/lib/audio-mode.ts`, which merges in JS and sends the complete set. Found at PR4 when playback's audio-focus call would have clobbered PR5's flag.

- **Android forbids *starting* a `microphone` foreground service from the background.** PR5's recovery means adopting the file left by a stopped recorder, never auto-resuming or finalising an interrupted MP4; its missing index cannot be rebuilt on-device.
- **Provider choice is settled for v0.1:** AssemblyAI ships first and Deepgram second, so upload chunking is out of scope. Groq and OpenAI cap a transcription request at 25 MB, while both chosen providers accept the app's hour-long recordings without chunking. `HIGH_QUALITY` requests 128 kbps AAC, but Android negotiated about 96 kbps on the test device; the final encoding parameters still need a device quality test.
- **The project is on Expo SDK 57**, chosen over the pre-release 58 deliberately. It ships two live `expo-audio` recording-path bugs, both of which PR3 must handle: `prepareToRecordAsync` throws if `POST_NOTIFICATIONS` is denied on Android 13+ ([#50705](https://github.com/expo/expo/issues/50705)), so request that permission before preparing and give refusal a real error message; and it can hang forever because `startBindingTimeout()` is never called ([#50706](https://github.com/expo/expo/issues/50706)), so wrap the call in a JS-side timeout. The SDK stays on 57 for v0.1 and is **not** on a review schedule — it moves only if something blocks us on 57 or a serious security flaw makes staying untenable (decided 2026-10-07). Both workarounds are therefore permanent fixtures, not scaffolding to tidy away.

## Toolchain traps

Both cost a debugging cycle to find, and neither is visible from the source.

- **pnpm needs a hoisted layout.** `pnpm-workspace.yaml` sets `nodeLinker: hoisted`, because React Native's Metro resolver does not follow pnpm's strict symlinked layout and bundling fails with "Unable to resolve module". It originally landed for NativeWind's `react-native-css-interop/jsx-runtime`; that dependency left with NativeWind, but hoisting is the documented setup for React Native under pnpm and **has not been retested since** — do not remove it casually. pnpm 11+ reads this from `pnpm-workspace.yaml`, **not** `.npmrc`. Packages with postinstall scripts additionally need naming under `allowBuilds:`; note that Tailwind 4's `@tailwindcss/oxide` and `lightningcss` do *not*, since they ship prebuilt per-platform binaries.
- **A regex character class containing a colon breaks the whole bundle.** Tailwind scans every file matched by its content glob (`./src/**/*.{js,jsx,ts,tsx}`, which includes tests) as plain text, with no notion of TypeScript syntax. A square-bracketed expression containing a colon is therefore read as Tailwind's arbitrary-property syntax, and a regex such as the one that strips ISO-8601 separators compiles to a real CSS rule with an empty property name. `cssToReactNativeRuntime` then fails with `SyntaxError: Unexpected token Semicolon` and *every* bundle fails — the error names `style.css` and a line number in generated CSS, never the `.ts` file responsible. Prefer `\D`, `\w` and friends over bracketed classes, and note that writing the offending pattern into a comment reintroduces the bug. Metro caches the bad transform, so the fix needs `expo start --clear`.

- **Theme token values must use Uniwind's `@variant`, inside `@layer theme`.** The only form `Uniwind.setTheme()` can switch between is `@layer theme { :root { @variant light { … } @variant dark { … } } }`. Two plausible alternatives both fail, and both fail *quietly*: a `@media (prefers-color-scheme: dark)` block follows the device but never responds to an in-app control, and a `.dark` class block never matches at all — Uniwind's `@custom-variant dark` in `uniwind.css` exists for `dark:` *utility* variants, not for raw token blocks, so the app silently renders the base theme forever. Colours still need declaring in `@theme` as well, or Tailwind never generates `bg-background` and friends; the variants only swap values. Uniwind's own theming docs show the `dark:` usage but not this declaration form — it is on the *custom themes* page. Related trap: `setTheme` writes through to `Appearance.setColorScheme`, which Android persists across launches, so deriving a default from `useColorScheme()` and writing it back pins the app to whichever scheme it first started in.

- **`flex-1` as a className on `SafeAreaView` collapses the subtree.** Under Uniwind, `<SafeAreaView className="flex-1">` makes descendant `<Text>` measure **zero height**, so text vanishes and siblings pile up at the top of the screen — while backgrounds, `flex-row`, arbitrary font sizes and `flex-1` on a plain `<View>` all keep working, which makes it look like a layout mistake rather than a library bug. Pass `style={{ flex: 1 }}` to `SafeAreaView` instead; `src/components/screen.tsx` does this and says why. Isolated on uniwind 1.12.1 / RN 0.86.3 by swapping one wrapper at a time. Upstream [uniwind#617](https://github.com/uni-stack/uniwind/issues/617) describes the same symptom but was closed as not reproducible against plain Views. **Nothing but a device render catches this** — typecheck, lint and a clean Metro bundle all pass.

- **Styling is Uniwind + Tailwind 4, not NativeWind.** Swapped at PR4 (2026-10-04) because NativeWind has no stable Tailwind 4 line — `nativewind@latest` is 4.2.7 against Tailwind 3, and its Tailwind 4 line is still `5.0.0-rc.0`. Uniwind needs **no Babel plugin**: it transforms CSS in Metro and augments React Native's own component types, so `className` works on stock components. `withUniwindConfig` must be the **outermost** wrapper in `metro.config.js`, and the location of the CSS entry (`src/global.css`) is what sets the root Tailwind scans for class names. `src/uniwind-types.d.ts` is generated by Metro, not hand-written.

Install packages with `npx expo install <pkg>` so versions stay matched to SDK 57.

## Layout

`src/app/` is routes only — each route renders a screen from `src/screens/`. Shared UI sits in `src/components/`, domain types in `src/types/`, mock fixtures in `src/mocks/`. §37 sketches `features/` folders; those get created when real code needs the boundary, per §37's own rule, not in advance.

Design tokens live in `src/global.css` as CSS variables and are the single source of truth. `src/theme/navigation.ts` mirrors three of them because React Navigation options cannot take utility class names — keep the two in step.

## Naming

This file is `AGENTS.md`, the cross-tool convention. Claude Code reads `CLAUDE.md` instead — symlink it if you want both.
