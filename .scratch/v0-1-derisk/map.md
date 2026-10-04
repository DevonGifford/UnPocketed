# De-risk v0.1

Label: `wayfinder:map`
Spec: [docs/spec.md](../../docs/spec.md)

## Destination

Every decision that [docs/spec.md](../../docs/spec.md) defers or leaves implicit is resolved, so the PR1–PR10 roadmap in §38 can be executed end-to-end without stopping to decide — and nothing surfaces mid-build that invalidates the architecture the spec already committed to.

Reaching the destination does **not** mean v0.1 is built. §39's "Definition of done" is a *build* completion test, not this map's destination.

## Notes

**Domain.** Unpocketed: an open-source, local-first Android app for recording, importing, transcribing and exporting spoken audio. Backendless — no account, no Unpocketed server. Users bring their own transcription provider and API key. Core domain entities are **Recording** (the original audio; §3.2 "original audio is sacred") and **Transcript** (many per Recording, each attributed to a provider+model; §10). Stack is Expo + React Native + TypeScript, expo-audio, expo-sqlite, expo-secure-store, NativeWind, Expo Router.

**Skills every session should consult.** `mattpocock-skills:grilling` and `mattpocock-skills:domain-modeling` by default. Research tickets additionally use `mattpocock-skills:research`.

**Standing preferences for this effort.**

- **Repo scaffolding is done** (2026-10-04, at Devon's request): `README.md`, `LICENSE` (MIT), `AGENT.md`, `CONTEXT.md`, `.gitignore`, `.editorconfig`. A deliberate, scoped exception to *plan, don't do* below — it stopped short of anything SDK-dependent so that [Which Expo SDK ships v0.1?](issues/00-which-expo-sdk-ships-v0-1.md) stays open rather than being settled by accident. No `package.json`, no `app/`, nothing installed.
- **Nothing is ever staged or committed.** Devon owns the git index and history. Write files and stop.
- **Plan, don't do.** This map resolves *decisions*. The build roadmap already exists in §38 — do not duplicate PR1–PR10 as tickets, and do not start building. The pull to write app code is the signal the map is done.
- The spec is the authority on **product shape**. This map does not relitigate settled product decisions; it resolves what the spec leaves open or contradicts itself on.
- A ticket earns its place by being able to **invalidate something the spec already assumes**. If resolving it changes nothing, it is not a ticket.
- Findings land as files under `.scratch/v0-1-derisk/research/`. The repo currently has **zero commits**, so there is no ref to branch from — skip the `research/<name>` branch convention until there is an initial commit.

## Take order

[Which Expo SDK ships v0.1?](issues/00-which-expo-sdk-ships-v0-1.md) first — it gates PR1 and nothing can be built without it. Then [Which provider ships first?](issues/04-which-provider-ships-first.md), which unblocks the two tickets behind it. [What is an edited transcript?](issues/03-what-is-an-edited-transcript.md) is unblocked and cheap, takeable any time.

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [Does two hours of audio fit through the provider?](issues/01-two-hours-through-the-provider.md): **No — not at the quality §12 demands, so chunking is in v0.1 unless Deepgram ships first.** `expo-audio`'s `HIGH_QUALITY` preset is 128 kbps AAC, making two hours **115.2 MB** against a hard **25 MB** cap at both Groq and OpenAI (5 chunks); Deepgram's cap is 2 GB (17.8x headroom). No provider offers resumable or chunked upload, and every documented workaround — Groq's `url` param and Batch API, Deepgram's callback — requires publicly-reachable audio, which §3.1 forbids. Fitting two hours into 25 MB needs 27.8 kbps, below AMR-NB. This turns chunking into a **consequence of provider choice**, not an encoding problem, and confirms §10's `Transcript` is wrong as specified if chunking lands. Also surfaced: Groq's **ASH 7.2K** rate limit is exactly two hours of audio per hour, so a single long recording exhausts the hourly allowance and §21's "failed transcription should be retryable" is unsatisfiable for up to an hour — a throughput ceiling chunking cannot relieve.

- [Can expo-audio record with the screen locked?](issues/02-record-with-the-screen-locked.md): **Yes — GO, §8's stack survives and PR3 can proceed on `expo-audio` unchanged.** First-party Android background *recording* shipped in `expo-audio@55.0.0` (published 2026-01-21); it declares its own `microphone`-typed foreground service, so no custom native module, no third-party plugin, no manual manifest edits. Config is `["expo-audio", { "enableBackgroundRecording": true, "microphonePermission": "..." }]` plus runtime `setAudioModeAsync({ allowsBackgroundRecording: true })` and a notification-permission request; a development build is required, consistent with §7. No fallback exists or is needed — `expo-av` never supported background recording and its npm `latest` is `16.0.8` from Dec 2025. **Three findings that change the plan:** (1) §38's sequencing is wrong — the *plugin* flag mutates the manifest so it must be set at **PR3**, while the *runtime* flag can wait for PR5; flipping the plugin flag at PR5 forces a native rebuild mid-roadmap. (2) **The default behaviour is the §13 bug** — `enableBackgroundRecording` defaults to `false` and `AudioModule.kt` then calls `pauseRecording()` on every active recorder when the activity backgrounds, so a foreground-only PR3 smoke test passes while §13 is silently broken. (3) **§13 + §14 cannot mean auto-resume** — Android forbids *starting* a `microphone` foreground service from the background, so PR5's "state restoration" can only mean recover-and-finalise a partial file. Also settled without needing a ticket: `AudioRecordingService.kt` hardcodes `VISIBILITY_SECRET` ("Hide from lock screen on secure devices"), so §13's "persistent system indication" is absent from the lock screen and unfixable without forking — but Android itself shows a status-bar icon whenever an app accesses the microphone on **Android 12+**, so §13's "never disguise active recording" is satisfied by the platform and this is a UX preference, not a contradiction. Residual: pre-Android-12 devices get no OS indicator. All claims verified against the published `expo-audio@57.0.5` tarball, the `AudioModule.kt`/`AudioRecordingService.kt` source, the npm registry and Android's own behaviour-changes documentation, not just Expo docs.

## Not yet specified

<!-- in-scope fog: can't be phrased sharply enough to ticket yet -->

- **How `Transcript` and the transcription states represent chunk assembly and partial failure.** *Contingent:* this only exists if [Which provider ships first?](issues/04-which-provider-ships-first.md) picks a 25 MB provider. If it does, this graduates immediately and is load-bearing — §10's flat `text` cannot carry chunk offsets or overlap removal, and §21's four states cannot express "chunk 4 of 5 failed", which is the *normal* failure across five billed calls. If Deepgram ships first, this patch evaporates rather than graduating.
- **Provider quota exhaustion under bring-your-own-key.** Groq's ASH ceiling means the user's own tier, which §19 leaves to them, determines whether a two-hour recording can be retried at all. Unclear yet whether this is a UX problem (surface the quota), a provider-selection problem, or just documentation.
- **Audio encoding parameters.** Codec, bitrate, sample rate, channel count. Partly forced now — 128 kbps AAC is `expo-audio`'s default and 64/96 kbps remain open as compromises — but §12's "compare against the stock recorder" still needs a real device test. Note `LOW_QUALITY` on Android emits `.3gp`/AMR-NB, which is in neither Groq's nor OpenAI's supported-input list, so "just record lower quality" is not a free move.
- **Play Store policy exposure.** §38 PR10 wants a Play-compatible AAB. A microphone + foreground-service recording app attracts specific declaration requirements, and note `expo-audio`'s `enableBackgroundPlayback` defaults to **`true`**, so the manifest will carry `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and a `mediaPlayback` service whether or not anyone asked — §16 wants playback so keeping it is probably right, but make it a deliberate choice now rather than a Play Store question later; unclear yet whether these constrain the permissions story or just add release paperwork. Revisit once background recording is settled.
- **End-to-end / device testing tooling.** §35 wants critical workflows covered "eventually." Maestro vs Detox vs manual-only for v0.1 — depends on how much of §36's matrix proves automatable.
- **Whether Home and Library merge.** §29 says merge "if they naturally become the same screen" — a PR1 observation, not a decision to make in advance.
- **ORM vs raw expo-sqlite.** §8 already states the decision *rule* ("only if it materially improves migrations, type safety, or maintainability"). The call gets made when real migrations exist, against that rule.

## Out of scope

<!-- ruled beyond the destination; never graduates -->

- **Executing the roadmap.** Building PR1–PR10 is the work this map clears the way *for*, not part of the map.
- **Everything in §6 (non-goals for v0.1)** — accounts, backend, sync, subscriptions, summaries, semantic search, speaker ID, iOS, local Whisper, and the rest. Ruled out by the spec itself.
- **Everything in §40 (potential future direction)** — local transcription, local-network transcription, search, summarisation, encrypted sync, iOS, web/desktop companion. Explicitly post-v0.1.
