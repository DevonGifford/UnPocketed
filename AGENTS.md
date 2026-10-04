# AGENTS.md

Unpocketed is a local-first Android app for recording, importing, transcribing and exporting spoken audio. No backend, no account, no subscription — users bring their own transcription provider and API key.

The app is scaffolded (PR1): Expo SDK 57, Expo Router, Uniwind with Tailwind 4, TypeScript strict, four screens on mock data. Recording, storage and transcription are not built — PR3 onward.

## Read before changing anything

- **[docs/spec.md](docs/spec.md)** — the authority on product shape: scope, domain model, UI direction, the PR1–PR10 roadmap, and §6's explicit non-goals. Consult it before adding a feature, naming an entity, picking a dependency, or judging something out of scope. Sections are numbered; cite them (`§13`) when a decision traces back to one.
- **[.scratch/v0-1-derisk/map.md](.scratch/v0-1-derisk/map.md)** — what has been settled and what is still open. Consult it before any architectural choice: the answer may already exist under *Decisions so far*, or may be an open ticket that is deliberately someone else's to make.
- **[CONTEXT.md](CONTEXT.md)** — the domain glossary. Use its terms in code, types, comments and commit messages.

## Invariants

**The original audio is sacred.** A transcript, a summary, or any metadata can be regenerated; a lost recording cannot. Code that touches a stored audio file preserves it unless the user explicitly asked for deletion.

**Recordings stay on the device** until the user explicitly asks for cloud transcription. There is no Unpocketed server to send anything to, and §6 keeps it that way.

**Devon stages and commits.** Write files to the working tree and stop there; leave the git index and history to him.

## Gotchas already paid for

Each of these cost research to establish and none is discoverable by reading the code.

- **`expo-audio` pauses an active recording the moment the app backgrounds**, unless `enableBackgroundRecording: true` is set in the `app.json` plugin config. The default is `false`, so a foreground-only test passes while §13 is broken. The plugin flag mutates the Android manifest, so it belongs at **PR3** even though background recording is PR5 work — setting it later forces a native rebuild mid-roadmap. The runtime flag (`setAudioModeAsync({ allowsBackgroundRecording: true })`) can wait for PR5.
- **Android forbids *starting* a `microphone` foreground service from the background.** PR5's "state restoration" can therefore only mean recover-and-finalise a partial file, never auto-resume.
- **Groq and OpenAI cap a transcription request at 25 MB.** Two hours at `expo-audio`'s `HIGH_QUALITY` default (128 kbps AAC) is 115.2 MB. Deepgram's cap is 2 GB. Whether chunking enters v0.1 therefore follows from provider choice, which is still open.
- **The project is on Expo SDK 57**, chosen over the pre-release 58 deliberately. It ships two live `expo-audio` recording-path bugs, both of which PR3 must handle: `prepareToRecordAsync` throws if `POST_NOTIFICATIONS` is denied on Android 13+ ([#50705](https://github.com/expo/expo/issues/50705)), so request that permission before preparing and give refusal a real error message; and it can hang forever because `startBindingTimeout()` is never called ([#50706](https://github.com/expo/expo/issues/50706)), so wrap the call in a JS-side timeout. The SDK is frozen through PR2 and re-evaluated once at PR3.

## Toolchain traps

Both cost a debugging cycle to find, and neither is visible from the source.

- **pnpm needs a hoisted layout.** `pnpm-workspace.yaml` sets `nodeLinker: hoisted`, because React Native's Metro resolver does not follow pnpm's strict symlinked layout and bundling fails with "Unable to resolve module". It originally landed for NativeWind's `react-native-css-interop/jsx-runtime`; that dependency left with NativeWind, but hoisting is the documented setup for React Native under pnpm and **has not been retested since** — do not remove it casually. pnpm 11+ reads this from `pnpm-workspace.yaml`, **not** `.npmrc`. Packages with postinstall scripts additionally need naming under `allowBuilds:`; note that Tailwind 4's `@tailwindcss/oxide` and `lightningcss` do *not*, since they ship prebuilt per-platform binaries.
- **A regex character class containing a colon breaks the whole bundle.** Tailwind scans every file matched by its content glob (`./src/**/*.{js,jsx,ts,tsx}`, which includes tests) as plain text, with no notion of TypeScript syntax. A square-bracketed expression containing a colon is therefore read as Tailwind's arbitrary-property syntax, and a regex such as the one that strips ISO-8601 separators compiles to a real CSS rule with an empty property name. `cssToReactNativeRuntime` then fails with `SyntaxError: Unexpected token Semicolon` and *every* bundle fails — the error names `style.css` and a line number in generated CSS, never the `.ts` file responsible. Prefer `\D`, `\w` and friends over bracketed classes, and note that writing the offending pattern into a comment reintroduces the bug. Metro caches the bad transform, so the fix needs `expo start --clear`.

- **`flex-1` as a className on `SafeAreaView` collapses the subtree.** Under Uniwind, `<SafeAreaView className="flex-1">` makes descendant `<Text>` measure **zero height**, so text vanishes and siblings pile up at the top of the screen — while backgrounds, `flex-row`, arbitrary font sizes and `flex-1` on a plain `<View>` all keep working, which makes it look like a layout mistake rather than a library bug. Pass `style={{ flex: 1 }}` to `SafeAreaView` instead; `src/components/screen.tsx` does this and says why. Isolated on uniwind 1.12.1 / RN 0.86.3 by swapping one wrapper at a time. Upstream [uniwind#617](https://github.com/uni-stack/uniwind/issues/617) describes the same symptom but was closed as not reproducible against plain Views. **Nothing but a device render catches this** — typecheck, lint and a clean Metro bundle all pass.

- **Styling is Uniwind + Tailwind 4, not NativeWind.** Swapped at PR4 (2026-10-04) because NativeWind has no stable Tailwind 4 line — `nativewind@latest` is 4.2.7 against Tailwind 3, and its Tailwind 4 line is still `5.0.0-rc.0`. Uniwind needs **no Babel plugin**: it transforms CSS in Metro and augments React Native's own component types, so `className` works on stock components. `withUniwindConfig` must be the **outermost** wrapper in `metro.config.js`, and the location of the CSS entry (`src/global.css`) is what sets the root Tailwind scans for class names. `src/uniwind-types.d.ts` is generated by Metro, not hand-written.

Install packages with `npx expo install <pkg>` so versions stay matched to SDK 57.

## Layout

`src/app/` is routes only — each route renders a screen from `src/screens/`. Shared UI sits in `src/components/`, domain types in `src/types/`, mock fixtures in `src/mocks/`. §37 sketches `features/` folders; those get created when real code needs the boundary, per §37's own rule, not in advance.

Design tokens live in `src/global.css` as CSS variables and are the single source of truth. `src/theme/navigation.ts` mirrors three of them because React Navigation options cannot take utility class names — keep the two in step.

## Naming

This file is `AGENTS.md`, the cross-tool convention. Claude Code reads `CLAUDE.md` instead — symlink it if you want both.
