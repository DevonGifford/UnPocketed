<div align="center">
  <!-- cover logo -->
  <p align='center'>
    <img src="docs/images/Logo/UnPocketed-Logo-Medium.png" alt="Unpocketed" title="Unpocketed" height="250">
  </p>
  <!-- sub headline -->
  <h2>
     Local-First Audio Recording &amp; Transcription
  </h2>
  <!-- tech used in this project -->
  <p>
    <a href="https://skillicons.dev">
      <img src="https://skillicons.dev/icons?i=react,ts,tailwind,androidstudio,sqlite,pnpm,github" /><br>
    </a>
  </p>
  <!-- spec link -->
  <h5>
      <a href='docs/spec.md'>
          read the specification ↗
      </a>
  </h5>
</div>

<br>
<!-- -------------------------------------------------------------------------- -->

### Brief Introduction
----

Unpocketed is an open-source Android application for recording, importing, transcribing, enriching and exporting spoken audio.

There is no Unpocketed account, subscription or server. Recordings, transcripts and settings stay on your device, while API keys are stored in the platform keystore. When you want something transcribed or enriched, you choose the provider and model, supply your own credentials, and the app talks to that service directly.

Original audio is never destructively modified, so transcripts and AI-generated outputs can be replaced, compared or regenerated later with a different model.

> **Status:** Unpocketed is under active development toward v0.1.

<br/>
<br/>

<!-- -------------------------------------------------------------------------- -->

### Application Flow
---

Unpocketed has two ways in — record on the device, or import audio captured elsewhere — and both produce the same kind of Recording. From there, transcription and enrichment are explicit, user-triggered steps, and the only points at which anything leaves the device.

```
        ┌──────────────────────┐          ┌──────────────────────┐
        │   Record on device   │          │     Import audio     │
        │   mic · background   │          │  captured elsewhere  │
        └───────────┬──────────┘          └───────────┬──────────┘
                    │                                 │
                    └───────────────┐ ┌───────────────┘
                                    ▼ ▼
                        ┌─────────────────────────┐
                        │        Recording        │
                        │   the original audio,   │
                        │     never rewritten     │
                        └────────────┬────────────┘
                                     │
          Transcribe · you pick the Provider and Model, pay them
                directly, and the audio leaves the device
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │        Transcript       │
                        │    zero or more, each   │
                        │  attributed, coexisting │
                        └────────────┬────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
   ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
   │      Edit     │         │   Enrichment  │         │     Export    │
   │    by hand,   │         │   on demand,  │         │  audio · txt  │
   │    any time   │         │ not automatic │         │   md · json   │
   └───────────────┘         └───────┬───────┘         └───────────────┘
                                     │
                        ┌────────────┴────────────┐
                        ▼                         ▼
                ┌───────────────┐         ┌───────────────┐
                │   Correction  │         │     Brief     │
                │   a Derived   │         │  a new entity │
                │   Transcript  │         │   beside it   │
                └───────────────┘         └───────────────┘
```

> An Edit and a Correction are the same operation by different hands — each makes a **Derived Transcript**, and neither replaces what it came from. A **Brief** is a different kind of thing: it sits beside a Transcript, and because its input is text already on the device, a poor one is re-rolled rather than edited. Two steps leave the device: the Transcribe arrow marked above, and Enrichment. Each goes to a provider you picked, under your own API key.

<br/>
<br/>

<!-- -------------------------------------------------------------------------- -->

### Running Locally
----

Unpocketed can be run in two ways during development:

- **On your computer**
  - **Browser** — quickest for UI and layout work
  - **Android Emulator** — runs the full Android app locally
  - See [**Emulator Setup**](docs/emulator-setup.md)

- **On a physical Android device**
  - **Development build** — runs against the local Expo development server
  - **Standalone APK** — runs without the development server *(coming later)*
  - See [**Device Setup**](docs/device-setup.md)

<br/>
<br/>
<!-- -------------------------------------------------------------------------- -->

### Privacy & Responsible Recording
----

Recordings and transcripts stay on your device unless you explicitly send them to a transcription or AI provider you choose. Unpocketed has no accounts, no cloud storage, and no analytics. Android device backup is left enabled, so recordings may also be included in your own Google Drive backup. See [**PRIVACY.md**](PRIVACY.md) for provider-specific details.

Recording laws vary by location and situation, and Unpocketed does not decide whether a recording is lawful. **You are responsible for making sure you have permission, or another lawful basis, before recording a conversation.**

Unpocketed will not include features designed to hide that recording is taking place, and Android's microphone indicator remains visible while recording.

<br/>
<br/>
<!-- -------------------------------------------------------------------------- -->

### Documentation
----

| Document | What it covers |
|---|---|
| [Specification](docs/spec.md) | Product and technical spec for v0.1 |
| [Privacy](PRIVACY.md) | What stays on the device, what leaves it, and when |
| [Domain glossary](CONTEXT.md) | The project's vocabulary, and the words to avoid |
| [Android setup](docs/android-setup.md) | Getting a local build toolchain working |
| [Emulator setup](docs/emulator-setup.md) | Running the app in a browser or on an Android emulator |
| [Device setup](docs/device-setup.md) | Running the app on a physical handset, tethered or not |
| [Releasing](docs/releasing.md) | Producing a signed APK or AAB, and what Play asks for |
| [Artwork](docs/artwork.md) | The icon and splash files still outstanding, and their sizes |
| [AGENTS.md](AGENTS.md) | Orientation for coding agents working in this repo |
| [Decision map](.scratch/v0-1-derisk/map.md) | What is settled, what is still open |

<br/>
<br/>

<!-- -------------------------------------------------------------------------- -->

