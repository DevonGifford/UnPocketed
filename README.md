<div align="center">
  <!-- cover logo -->
  <p align='center'>
    <img src="docs/UnPocketed-Logo.png" alt="Unpocketed" title="Unpocketed" height="250">
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

Unpocketed has two ways in — record on the device, or import audio captured elsewhere — and both produce the same kind of Recording. From there, transcription is an explicit, user-triggered step that leaves the device only when asked.

```text
┌──────────────────────┐                  ┌──────────────────────┐
│   Record on device   │                  │    Import a file     │
│  mic · background    │                  │  M4A · MP3 · WAV     │
└──────────┬───────────┘                  └──────────┬───────────┘
           │                                         │
           └───────────────┐         ┌───────────────┘
                           ▼         ▼
                    ┌──────────────────────┐
                    │  Expo / React Native │
                    │      Unpocketed      │
                    └──────────┬───────────┘
                               │
                 ┌─────────────┴─────────────┐
                 ▼                           ▼
      ┌──────────────────────┐    ┌──────────────────────┐
      │  On-device storage   │    │ Your transcription   │
      │ files · SQLite · keys│    │ provider · your key  │
      └──────────────────────┘    └──────────────────────┘
             always                    only when you ask
```

There is deliberately no `phone → Unpocketed API → provider` hop. That keeps this project out of the path of your recordings, your credentials, your billing and your transcripts.

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

Both start from the same one-time toolchain install — JDK, Android SDK and environment variables: [**Android development setup**](docs/android-setup.md). A development build is required rather than Expo Go, because Unpocketed needs native modules for audio recording, secure storage and foreground services; the browser renders the interface but implements none of them.

Then **configure transcription**: open **Settings** in the app and add your own provider API key. Keys are held in the device keystore, never in the database or a config file, and never leave the device except as an authorisation header to the provider you chose.

#### Notes

- Transcription is the only feature that requires a network connection. Recording, playback, import, rename, delete, export and reading existing transcripts all work offline.
- Cloud transcription sends that recording to the external provider you selected, under their pricing and privacy terms.
- If you hit a problem, check the [Issues](https://github.com/DevonGifford/UnPocketed/issues) page for an existing report, or open a new one.

<br/>
<br/>
<!-- -------------------------------------------------------------------------- -->

### Privacy & Responsible Recording

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

