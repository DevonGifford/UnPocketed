# AGENT.md

Unpocketed is a local-first Android app for recording, importing, transcribing and exporting spoken audio. No backend, no account, no subscription — users bring their own transcription provider and API key.

**There is no application code yet.** The repo holds a spec, a decision map, and these files.

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
- **The Expo SDK version is undecided.** SDK 57 is stable but ships two live `expo-audio` recording-path bugs; SDK 58 fixes both and is pre-release. Settle that ticket before scaffolding the app.

## Naming

This file is `AGENT.md`. Tools that look for `AGENTS.md` or `CLAUDE.md` will not find it — symlink if you adopt one of those.
