# Unpocketed

**Product & Technical Specification**  
**Target:** v0.1.0 MVP  
**Primary platform:** Android  
**Project type:** Open-source, local-first mobile application  
**Status:** Planning

---

## 1. Overview

Unpocketed is an open-source mobile application for recording, importing, transcribing, managing, and exporting spoken audio.

The application is built around a deliberately simple principle:

> **Your recordings. Your models. Your data.**

Unpocketed should not require proprietary recording hardware, an Unpocketed account, a subscription, or an Unpocketed-hosted backend.

A user's phone is already a capable recording device. Unpocketed uses that existing hardware and provides a lightweight software layer around it.

Recordings remain ordinary audio files. Transcripts remain ordinary user-owned data. When transcription is required, users choose the provider and model they want to use and supply their own credentials.

The application should remain useful even if a particular transcription provider disappears, becomes too expensive, declines in quality, or is superseded by a better model.

Unpocketed should therefore treat recording, storage, transcription, and AI processing as separate concerns rather than bundling them into one proprietary service.

---

# 2. Problem

A growing category of AI recording products combines dedicated recording hardware with proprietary transcription and software services.

This can create several unnecessary constraints:

- users may be forced to use the manufacturer's transcription provider;
- better transcription models may be unavailable;
- useful functionality may require recurring subscriptions;
- recordings and transcripts may become tied to a proprietary ecosystem;
- users may have limited control over exporting or reprocessing their own recordings;
- a dedicated recording device may provide no meaningful improvement over the phone the user already carries;
- additional AI features can add substantial interface complexity without improving the fundamental recording and transcription workflow.

Unpocketed takes the opposite approach.

The application should be a transparent tool between the user's microphone, files, and chosen transcription service.

The original audio is the source of truth.

Everything else can be regenerated.

---

# 3. Product philosophy

Unpocketed follows several principles that should guide product and engineering decisions.

## 3.1 Local first

The application must function without an Unpocketed server.

Audio, recording metadata, transcripts, settings, and other application state should live locally by default.

A network connection should only be required when the user explicitly performs an operation requiring an external service, such as cloud transcription.

## 3.2 Original audio is sacred

The original recording should never be destructively modified as part of transcription or AI processing.

A transcription can be regenerated.

A summary can be regenerated.

Metadata can be reconstructed.

A lost original recording cannot.

Unpocketed should therefore preserve the original audio unless the user explicitly deletes it.

## 3.3 Provider independence

Transcription should be implemented behind a provider abstraction.

The rest of the application should not care whether a transcript came from Groq, OpenAI, Deepgram, a local Whisper model, a custom endpoint, or a provider that does not exist yet.

Changing transcription provider should not require changing the underlying recording library.

## 3.4 User ownership

Users must be able to export their original recordings and transcripts without paying, creating an account, or passing through a proprietary conversion process.

The application should prefer common formats such as:

- M4A/WAV/MP3 for audio;
- plain text for simple transcript export;
- Markdown for human-readable structured export;
- JSON for complete machine-readable data.

## 3.5 No artificial feature gates

Unpocketed is not designed around creating artificial limitations that can later be removed by a subscription.

If a feature can reasonably operate locally, it should operate locally.

External services may cost money, but those costs belong between the user and the service they chose.

## 3.6 Simple before clever

The application should favour obvious workflows over novelty.

The primary experience is:

**Record → Listen → Transcribe → Read → Export.**

Additional AI functionality should never make those core actions harder to find.

## 3.7 No AI theatre

The MVP does not require mind maps, generated speech bubbles, engagement scores, motivational insights, automatic diagrams, or other features merely because an LLM can generate them.

AI functionality should solve a concrete problem.

---

# 4. Target user

The initial target user is someone who wants to capture spoken information without committing that information to a proprietary recording ecosystem.

Typical uses may include:

- meetings;
- personal notes;
- brainstorming;
- interviews where recording is permitted;
- lectures;
- voice journals;
- spoken reminders;
- imported recordings from another recorder or service.

The MVP is particularly suitable for technically comfortable users because external transcription initially uses bring-your-own API credentials.

The project does not need to optimise onboarding for completely nontechnical users in v0.1.

---

# 5. MVP definition

Unpocketed v0.1 is successful if a new user can:

1. install the Android application;
2. grant microphone permission;
3. record audio;
4. stop the recording and have it safely persisted;
5. close and reopen the application without losing the recording;
6. play the original recording;
7. import an existing audio recording;
8. configure their own transcription API credentials;
9. choose a supported transcription model;
10. transcribe a recording;
11. view the resulting transcript;
12. retranscribe the same original recording using another model;
13. edit or copy transcript text;
14. export the transcript;
15. share/export the original audio;
16. delete recordings and transcripts intentionally.

If those workflows are reliable and pleasant, v0.1 is complete.

---

# 6. Non-goals for v0.1

The first release deliberately does **not** attempt to provide:

- user accounts;
- an Unpocketed backend;
- cloud storage;
- cloud synchronisation;
- subscriptions;
- payment processing;
- social functionality;
- sharing through hosted public links;
- automatic summaries;
- mind maps;
- chat-with-your-recordings;
- embeddings;
- semantic search;
- speaker recognition profiles;
- collaborative editing;
- desktop applications;
- a web dashboard;
- iOS release support;
- local on-device Whisper inference;
- automatic continuous recording;
- proprietary hardware integration.

Some of these may become useful later.

None are required to validate the core product.

---

# 7. Platform

The MVP targets **Android first**.

The architecture should avoid unnecessary Android-specific coupling so that iOS can be supported later, but the first release does not need feature parity across both platforms.

Development should be tested primarily on a physical Android device rather than relying exclusively on an emulator.

The application should use an Expo development build once native functionality requires it rather than treating Expo Go as the production-equivalent development environment.

---

# 8. Technology

The initial application stack is:

**Framework**

Expo + React Native.

**Language**

TypeScript with strict type checking.

**Routing**

Expo Router.

**Package management**

pnpm.

**Styling**

Uniwind with Tailwind 4 utility classes.

A utility-first Tailwind approach is chosen because the project author is already highly familiar with it, and there is little value in forcing the application to use `StyleSheet` purely as a learning exercise.

Uniwind is the binding, replacing NativeWind as of v0.0.2. NativeWind has no stable Tailwind 4 line — its released version pairs with Tailwind 3, and its Tailwind 4 branch remains a release candidate. Uniwind is stable, needs no Babel plugin, and is measurably faster.

React Native layout and platform behaviour should still be understood rather than assuming browser CSS semantics.

**Audio**

`expo-audio`.

**Persistent files**

Expo FileSystem APIs.

**Structured local persistence**

SQLite through `expo-sqlite`.

An ORM should only be introduced if it materially improves migrations, type safety, or maintainability. The MVP should not introduce an ORM merely because it is fashionable.

**Secrets**

`expo-secure-store`.

API keys must not be persisted in ordinary SQLite tables or plaintext configuration files.

**File import**

`expo-document-picker`.

**Native sharing/export**

`expo-sharing` and appropriate platform APIs.

---

# 9. High-level architecture

The application is intentionally backendless.

```text
┌──────────────────────────────────────┐
│              Unpocketed              │
│                                      │
│  ┌──────────────┐   ┌─────────────┐  │
│  │  Filesystem  │   │   SQLite    │  │
│  │              │   │             │  │
│  │ Audio Files  │   │ Recordings  │  │
│  │              │   │ Transcripts │  │
│  └──────────────┘   │ Metadata    │  │
│                     └─────────────┘  │
│                                      │
│  ┌──────────────┐                    │
│  │ SecureStore  │                    │
│  │              │                    │
│  │ API Keys     │                    │
│  └──────┬───────┘                    │
│         │                            │
└─────────┼────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│ User-selected       │
│ transcription      │
│ provider           │
└─────────────────────┘
```

There is deliberately no:

```text
Phone
  ↓
Unpocketed API
  ↓
Transcription API
```

The intended architecture is:

```text
Phone
  ↓
Chosen transcription provider
  ↓
Phone
```

This keeps Unpocketed out of the path of the user's recording, credentials, billing, and transcript.

---

# 10. Core domain model

The main domain entity is a **Recording**.

A recording represents an original audio source whether it was captured by Unpocketed or imported from another application.

Conceptually:

```ts
interface Recording {
  id: string;
  title: string;

  source: 'recorded' | 'imported';

  audioPath: string;
  mimeType: string;

  durationMs: number;

  createdAt: string;
  updatedAt: string;
}
```

A recording may contain zero or more **Transcripts**.

```ts
interface Transcript {
  id: string;
  recordingId: string;

  providerId: string;
  modelId: string;

  text: string;

  createdAt: string;
  updatedAt: string;
}
```

A recording should not contain one mutable `transcript` field.

Multiple transcript records are intentional.

This makes the following workflow possible:

```text
Recording
│
├── Original audio
│
├── Whisper Large v3 transcript
│
├── Model B transcript
│
└── Future Model C transcript
```

Retranscription therefore creates another interpretation of the original source rather than destructively replacing previous work.

---

# 11. Recording workflow

The recording experience is the most important part of the application.

The initial recording screen should prioritise a single obvious action.

```text
             UNPOCKETED


              00:00

            ● RECORD


             Library
```

Once recording begins:

```text
              14:32

         recording…

          ■ STOP
```

The screen should show enough information for the user to know with certainty that recording is active.

The application should avoid decorative animation that creates uncertainty about whether recording is actually occurring.

## Recording requirements

Starting a recording must:

- verify microphone permission;
- initialise the audio recorder;
- begin recording;
- create application state representing the active session;
- display elapsed recording time.

Stopping must:

- reliably finalise the audio file;
- persist it into durable application storage;
- create its corresponding database record;
- make it immediately available in the library.

The user should not need to name a recording before recording it.

A useful default title can be derived from date/time and renamed afterward.

---

# 12. Recording quality

Audio quality is a first-class product requirement.

The existence of a dedicated recording application is difficult to justify if its recordings are materially worse than the phone's stock recorder.

During development, Unpocketed recordings should therefore be directly compared against recordings made using the same device's native recording application.

The comparison should consider:

- speech intelligibility;
- background noise;
- clipping;
- volume;
- compression artifacts;
- handling of distant speakers;
- resulting transcription quality.

The application should initially prefer reliable, good-quality audio over aggressively minimising storage.

Storage optimisation can be addressed later if real-world usage demonstrates that it is necessary.

---

# 13. Background recording

A user must be able to begin recording and subsequently:

- lock the device;
- turn off the screen;
- move to another application;
- return to Unpocketed;

without unintentionally ending the recording.

Android background recording requirements must be implemented using the appropriate foreground-service behaviour and permissions.

A persistent system indication that recording is active is acceptable and desirable.

Unpocketed should never attempt to disguise active recording from the operating system or user.

---

# 14. Recording resilience

Recording represents potentially irreplaceable information, so failure handling is more important than most interface polish.

The application should account for:

- app backgrounding;
- UI remounts;
- temporary interruption;
- low available storage;
- audio API errors;
- attempts to start a second recording;
- failure while finalising a file;
- unexpected application termination where recovery is technically possible.

The application should prefer preserving recoverable audio over producing perfectly tidy metadata.

---

# 15. Library

The library contains all recordings regardless of source.

A recording captured in Unpocketed and an imported Pocket/MP3/WAV recording should ultimately use the same domain model.

A simple library entry may show:

```text
Meeting with Sam
48:12
Today, 14:32
2 transcripts
```

The MVP library should support:

- chronological display;
- opening a recording;
- renaming;
- playback;
- deletion;
- transcript status.

Search is not necessary for the first release unless implementation becomes trivial.

---

# 16. Playback

Every recording must be playable independently of whether it has been transcribed.

Playback should support at minimum:

- play;
- pause;
- seek;
- current position;
- total duration.

Useful additions such as ±15 second controls may be included if they remain simple.

Transcription should never be a prerequisite for audio playback.

---

# 17. Import

Users should be able to import existing recordings from Android's native file picker.

Initial target formats should include common audio/video containers such as:

- M4A;
- MP3;
- WAV;
- MP4;
- WebM where supported.

An imported file should be copied into Unpocketed-managed storage rather than relying indefinitely on an external temporary URI.

After import, it should behave like any other recording.

One explicit use case is importing audio previously exported from Pocket or another recording application and retranscribing it using a different provider.

Unpocketed should not require knowledge of proprietary metadata formats simply to process an ordinary exported media file.

---

# 18. Transcription provider architecture

Transcription must use an adapter architecture.

For example:

```ts
interface ProviderCapabilities {
  maxUploadBytes?: number;
  maxDurationMs?: number;
  supportsDiarization: boolean;
}

interface TranscriptionOptions {
  // ...model, language and other per-request options
  /** Called once, as soon as the provider issues a job id. Persist it synchronously. */
  onJobRef?: (jobRef: string) => void;
}

interface TranscriptionProvider {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;

  transcribe(
    audio: AudioSource,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult>;

  /** Re-attach to a job already in flight. Undefined for synchronous providers. */
  resume?(jobRef: string, options: TranscriptionOptions): Promise<TranscriptionResult>;
}
```

Application code outside the transcription layer should not contain provider-specific API logic.

`capabilities` exists so that code outside the transcription layer can ask "will this file go
through?" without knowing which provider is selected — which is the rule above. It is what lets a
user-configured OpenAI-compatible endpoint refuse a file before spending an upload on it.

`onJobRef` and `resume` exist because a long transcription outlives the app process on Android. A
promise alone means a killed app loses the only reference to a job that is still running and
already paid for, so the reference has to surface the moment the provider issues it rather than on
completion. A synchronous provider implements neither member: it has no job id and nothing to
re-attach to. Designing for the asynchronous case therefore costs the synchronous one nothing,
while the reverse would force a breaking change once transcripts are already stored.

Deliberately absent: progress reporting and partial results. Neither is needed while no provider
requires an audio file to be split across requests.

Provider implementations might eventually include:

```text
providers/
├── groq.ts
├── openai.ts
├── deepgram.ts
├── custom-openai.ts
└── local-whisper.ts
```

The MVP begins with one provider.

A second provider is introduced only after the abstraction is proven.

---

# 19. Provider configuration

The user should configure transcription from Settings.

Example:

```text
TRANSCRIPTION

Provider
AssemblyAI                   >

Model
universal-2                  >

API key
••••••••••••••••••••         >

Credentials stored locally
```

Provider credentials should be stored using secure device storage.

The application should clearly explain that submitting audio for cloud transcription sends that recording to the selected external provider and that the provider's own pricing and privacy terms apply.

That explanation should also say that the provider may **retain** what it is sent, and for how
long, because "sent" and "kept" are different promises and only the second one matters to someone
deciding whether to upload. The disclosure should not imply the user can opt out of retention
unless the selected provider actually offers that on the endpoint Unpocketed uses.

Unpocketed does not pay provider usage on the user's behalf.

---

# 20. Model selection

Providers may expose multiple transcription models.

Model selection should therefore be independent from provider selection where the provider API supports it.

The selected model should be persisted as metadata on every transcript.

A transcript should always make it possible to answer:

> Which provider and model generated this?

This is important both for transparency and comparison.

---

# 21. Transcription workflow

From a recording:

```text
Recording
   ↓
Transcribe
   ↓
Provider + model
   ↓
Send original/correctly encoded audio
   ↓
Receive transcript
   ↓
Store locally
   ↓
Display
```

The application should expose clear states:

```text
Not transcribed
Transcribing
Transcribed
Failed
```

Failure must not affect the original recording.

A failed transcription should be retryable.

---

# 22. Retranscription

Retranscription is a first-class capability rather than an edge case.

A user should be able to select the same recording and submit it to another model.

Existing transcripts should remain available unless explicitly deleted.

This turns provider choice into something verifiable rather than ideological.

Users can compare transcription quality themselves.

---

# 23. Transcript interface

The transcript screen should prioritise readability.

The MVP supports:

- reading;
- selecting text;
- copying;
- editing;
- identifying provider/model;
- retranscribing;
- exporting.

It should not initially attempt to transform every transcript into a complex AI workspace.

---

# 24. Export and sharing

Ownership requires a reliable exit path.

Users should be able to export:

**Original audio**

The unchanged original file where technically possible.

**Plain-text transcript**

Suitable for copy/paste and simple archival.

**Markdown**

Human-readable transcript with useful metadata.

For example:

```md
# Meeting with Sam

Recorded: 2026-10-04 14:32
Duration: 48:12
Provider: Groq
Model: whisper-large-v3

## Transcript

...
```

**JSON**

Machine-readable recording and transcript metadata suitable for backups, scripts, or migration.

No export feature should require an account or paid Unpocketed plan.

---

# 25. Deletion

Deletion must be explicit.

Deleting a transcript should not delete its recording.

Deleting a recording should warn the user if it will also remove associated transcripts.

The interface should clearly distinguish:

```text
Delete transcript

vs.

Delete recording and all associated data
```

Destructive actions should not be unnecessarily easy to trigger accidentally.

---

# 26. Security and privacy

Unpocketed will handle highly sensitive data by its nature.

Conversations, meetings, journals, and voice notes may contain personal or confidential information.

The application should therefore minimise the amount of trust required from the user.

Core privacy properties:

- no Unpocketed account;
- no Unpocketed cloud storage;
- no Unpocketed analytics containing recording content;
- provider API keys stored securely;
- recordings stored locally;
- transcripts stored locally;
- cloud transmission only when the user requests cloud transcription;
- no silent upload of recordings;
- no selling or monetising recording content.

Telemetry, if ever introduced, must never include recording or transcript content and should ideally be opt-in for an open-source project of this nature.

---

# 27. Legal recording considerations

Unpocketed is a recording tool.

Recording laws vary significantly by jurisdiction and circumstance.

The application should not attempt to determine whether an individual recording is lawful.

Documentation should state that users are responsible for ensuring they have appropriate permission or another lawful basis to record conversations.

The application should not provide features specifically intended to conceal the fact that recording is occurring.

---

# 28. UI direction

Unpocketed should feel quiet, utilitarian, and trustworthy.

The application is primarily a tool.

Visual direction:

- restrained colour palette;
- strong typography;
- generous spacing;
- clear hierarchy;
- excellent dark mode;
- minimal decorative animation;
- no gradient-heavy "AI app" aesthetic;
- no gamification;
- no unnecessary cards inside cards inside cards.

The recording action should be visually distinctive without turning the entire interface red.

The visual hierarchy should generally be:

```text
CONTENT
↓
PRIMARY ACTIONS
↓
METADATA
↓
SETTINGS / SECONDARY ACTIONS
```

not:

```text
DECORATION
↓
AI BRANDING
↓
CONTENT SOMEWHERE BELOW
```

---

# 29. Navigation

The application should use the smallest navigation model that supports the workflows.

An initial structure may be:

```text
Home / Record
Library
Settings
```

Recording detail screens are pushed from the Library.

The application should avoid adding tabs simply because mobile applications traditionally contain several tabs.

If Home and Library naturally become the same screen, they should be merged.

---

# 30. Styling

Uniwind is the primary styling approach.

Tailwind utility classes should be used for normal component styling and layout.

A small shared design-token layer should define semantic concepts such as:

- application background;
- elevated surface;
- primary text;
- muted text;
- borders;
- destructive actions;
- recording state;
- spacing conventions.

Components should use semantic application design decisions rather than scattering arbitrary hex colours throughout screens.

---

# 31. Accessibility

The MVP should consider accessibility from the beginning rather than adding it during release week.

Interactive controls should:

- expose useful accessibility labels;
- provide adequate touch targets;
- communicate state without relying exclusively on colour;
- support system font scaling where practical;
- maintain sufficient contrast;
- work with Android accessibility services for core workflows.

The record/stop state in particular must be obvious through more than colour alone.

---

# 32. Error handling

Technical error messages should be translated into useful user-facing explanations.

Bad:

```text
HTTP 401
```

Better:

```text
The transcription provider rejected your API key.
Check your key in Settings and try again.
```

Likewise:

```text
No internet connection.

Your recording is safe on this device.
Connect to the internet before trying transcription again.
```

Errors must reinforce that the original recording has not been lost where that statement is true.

---

# 33. Offline behaviour

Core recording and library functionality must work offline.

Offline:

```text
✓ record
✓ playback
✓ rename
✓ delete
✓ import
✓ export local data
✓ read existing transcripts
✗ cloud transcription
```

Cloud transcription actions should fail gracefully and remain retryable once connectivity returns.

---

# 34. Performance

The application should be designed around potentially long recordings.

It should not assume every audio file is a three-minute voice note.

Testing should include recordings of:

- several seconds;
- several minutes;
- approximately one hour;
- approximately two hours.

The UI should avoid loading entire large audio files into JavaScript memory unnecessarily.

Database records should reference files rather than storing audio blobs inside SQLite.

---

# 35. Testing strategy

Testing should focus primarily on behaviours whose failure risks data loss.

Highest priority areas include:

```text
recording lifecycle
file persistence
recording finalisation
database/file consistency
import
delete
background recording
transcription error recovery
export
```

Pure TypeScript domain logic and provider adapters should receive unit tests where useful.

Critical user workflows should eventually receive end-to-end/device testing.

The MVP should not chase arbitrary test coverage percentages.

Confidence matters more than a coverage badge.

---

# 36. Manual recording test matrix

Before v0.1, the application should be manually tested against scenarios including:

```text
5-second recording
10-minute recording
1-hour recording
2-hour recording

screen locked while recording
application backgrounded
returning to active recording
incoming notifications

import MP3
import M4A
import WAV
import MP4

valid API key
invalid API key
provider timeout
airplane mode
network lost during transcription

application restart
long filenames
Unicode filenames
low available storage

delete transcript
delete recording
export transcript
export original audio
```

---

# 37. Repository structure

The exact structure may evolve naturally, but separation of concerns should remain visible.

A likely structure:

```text
src/
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── library/
│   ├── recordings/
│   └── settings/
│
├── components/
│
├── features/
│   ├── recording/
│   ├── playback/
│   ├── library/
│   ├── transcription/
│   └── import/
│
├── db/
│   ├── schema/
│   ├── migrations/
│   └── queries/
│
├── providers/
│   └── transcription/
│
├── services/
│   ├── audio/
│   ├── files/
│   └── export/
│
├── hooks/
│
├── types/
│
└── utils/
```

The project should not prematurely create layers merely to resemble enterprise architecture.

A folder should exist because there is real code requiring that boundary.

---

# 38. Development roadmap

## PR 1 — Foundation and static interface

Create the Expo project and build the initial static application shell using mock data.

Deliver:

- TypeScript;
- Expo Router;
- NativeWind;
- linting/formatting;
- theme foundations;
- Record screen;
- Library;
- Recording detail;
- Settings;
- mocked recordings.

Exit condition:

> Unpocketed runs locally and visually resembles the intended product even though functionality is mocked.

---

## PR 2 — Android development environment

Introduce the native development workflow.

Deliver:

- Android development build;
- physical-device workflow;
- required native configuration;
- microphone permission handling.

Exit condition:

> A development build of Unpocketed is installed and debugged on a physical Android device.

---

## PR 3 — Audio recording

Replace the mocked recording experience with real recording.

Deliver:

- start;
- stop;
- timer;
- local audio persistence;
- failure handling;
- recording-quality evaluation.

Exit condition:

> A valid recording can be created and replayed outside the recording session.

---

## PR 4 — Persistent library and playback

Deliver:

- SQLite;
- recording metadata;
- library populated from real data;
- playback;
- seeking;
- rename;
- delete.

Exit condition:

> Recordings survive an application restart and remain playable.

---

## PR 5 — Background recording and resilience

Deliver:

- Android background recording;
- locked-screen recording;
- app-background recording;
- state restoration;
- interruption handling;
- duplicate-recording prevention.

Exit condition:

> An hour-long real-world recording can be trusted.

---

## PR 6 — External audio import

Deliver:

- document picker;
- supported media formats;
- copying files into managed storage;
- imported recordings integrated into the library.

Exit condition:

> A previously exported Pocket recording can be imported and played successfully.

---

## PR 7 — Initial transcription

Deliver:

- provider abstraction;
- first provider;
- transcript persistence;
- transcription states;
- errors/retry.

Exit condition:

> An existing recording can produce and display a real transcript.

---

## PR 8 — Bring-your-own provider

Deliver:

- provider settings;
- model selection;
- secure API-key storage;
- second provider;
- ability to switch providers.

Exit condition:

> The same recording can be transcribed successfully by two different models/providers.

---

## PR 9 — Transcript ownership

Deliver:

- transcript editing;
- multiple transcript versions;
- retranscription;
- copy;
- TXT export;
- Markdown export;
- JSON export;
- original audio sharing.

Exit condition:

> A user can import, transcribe, compare, edit, and export their data without lock-in.

---

## PR 10 — Polish and Android release

Deliver:

- final UX pass;
- empty/loading/error states;
- accessibility pass;
- dark/light mode;
- icon;
- splash screen;
- release configuration;
- CI;
- README;
- privacy documentation;
- license;
- GitHub APK release;
- Play Store-compatible AAB configuration.

Exit condition:

> A stranger can download the v0.1 APK, install it, record audio, configure their provider, transcribe the recording, and export their data without developer assistance.

---

# 39. Definition of done for v0.1

Unpocketed v0.1 is considered complete when the following four promises can be made confidently:

> **Record well.**

The application reliably creates good-quality recordings using the hardware the user already owns.

> **Keep the original.**

The original recording remains under the user's control and is not sacrificed to downstream processing.

> **Transcribe however you want.**

The application is architecturally independent from any single AI provider and allows the user to choose the service/model processing their recording.

> **Get your data back out.**

Recordings and transcripts remain exportable in useful, standard formats without subscriptions or artificial restrictions.

Anything beyond those four promises belongs to a future release unless it directly improves their reliability.

---

# 40. Potential future direction

Once the core application is proven, possible future work includes:

**Local transcription**

Run Whisper or another speech model directly on supported devices.

This would allow a completely offline path:

```text
Microphone
    ↓
Local recording
    ↓
Local transcription
    ↓
Local transcript
```

**Local-network transcription**

Allow advanced users to configure a transcription server running on their own desktop, homelab, or GPU machine.

**Search**

Full-text search across transcripts.

**Semantic search**

Optional local or user-selected embedding provider.

**Transcript summarisation**

Allow users to explicitly choose an LLM and transform an existing transcript into summaries or structured notes.

This should use the same provider-independent philosophy as transcription.

**Optional encrypted sync**

Synchronisation between devices could eventually be implemented without making an account mandatory for core functionality.

**iOS**

Support iOS once the Android architecture and workflows are stable.

**Web/desktop companion**

Provide a larger interface for managing, editing, searching, and retranscribing an existing Unpocketed library.

None of these features should compromise the ability to use Unpocketed as a straightforward local recorder.

---

# 41. Project positioning

Unpocketed is not intended to prove that audio transcription is technically novel.

It deliberately assumes the opposite.

Modern phones already contain capable microphones, storage, compute, connectivity, and displays. Modern transcription models are increasingly commoditised and interchangeable.

The useful product is therefore the layer that gives the user control over those pieces without unnecessarily owning the relationship between them.

Unpocketed should remain understandable.

A recording is a file.

A transcript is text.

A model turns one into the other.

The user owns all three decisions: **what to record, where to keep it, and which model gets to listen.**
