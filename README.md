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

Unpocketed is an Android app for recording, importing, transcribing and processing audio with the AI providers and models you choose.

Your data stays local until you decide otherwise. When you want a cloud transcription or AI pass, you bring your own API key, pick the provider and model and Unpocketed talks to that service directly.  Original recordings and provider transcripts are kept intact, so you can compare models, create new versions and regenerate outputs whenever you want.

> **Status:** Unpocketed is under active development toward v0.1.

<br/>
<br/>

<!-- -------------------------------------------------------------------------- -->

### Application Flow
---

Unpocketed has two ways in — record on the device, or import audio captured elsewhere — and both produce the same kind of Recording. From there, transcription and enrichment are explicit, user-triggered steps and the only points at which anything leaves the device.

```
        ┌──────────────────────┐          ┌──────────────────────┐
        │   Record on device   │          │     Import audio     │
        │      microphone      │          │  captured elsewhere  │
        └───────────┬──────────┘          └───────────┬──────────┘
                    │                                 │
                    └───────────────┐ ┌───────────────┘
                                    ▼ ▼
                        ┌─────────────────────────┐
                        │     Stored on Device    │
                        │ ----------------------- │
                        │    Indexed in SQLite    │
                        │   with in-app playback  │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │   Transcription Model   │
                        │ ----------------------- │
                        │       BYO-API Key       │
                        └────────────┬────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
   ┌───────────────┐      ┌─────────────────────┐       ┌───────────────┐
   │      Edit     │      │      LLM Model      │       │     Export    │
   │    by hand,   │      │ ------------------- │       │   in chosen   │  
   │    any time   │      │     BYO-API Key     │       │     format    │
   └───────────────┘      └──────────┬──────────┘       └───────────────┘
                                     │
                        ┌────────────┴────────────┐
                        ▼                         ▼
                ┌────────────────┐         ┌──────────────────┐
                │   Correction   │         │    Create an     │
                │   to Derived   │         │    AI Summary    │
                │   Transcript   │         │  of transcript   │
                └────────────────┘         └──────────────────┘
```

> Recordings and transcripts stay on the device until you explicitly choose to use a cloud provider. Transcription and AI enrichment are separate steps, each using the provider, model and API key you choose.  Original recordings and provider transcripts are preserved, so nothing is overwritten.

<br/>
<br/>

<!-- -------------------------------------------------------------------------- -->

### Privacy & Responsible Recording
----
Recording laws vary by location and situation, and Unpocketed does not decide whether a recording is lawful. **You are responsible for making sure you have permission, or another lawful basis, before recording a conversation.**

Recordings and transcripts stay on your device unless you explicitly send them to a transcription or AI provider you choose. Unpocketed has no accounts, no cloud storage, and no analytics. Android device backup is left enabled, so recordings may also be included in your own Google Drive backup. See [**PRIVACY.md**](PRIVACY.md) for provider-specific details.

<br/>
<br/>
<!-- -------------------------------------------------------------------------- -->

### Running Locally
----

There are a few useful ways to work on it depending on what you are testing. Browser preview is useful for quick interface work, while the Android emulator and a physical device are the real development environments for native behaviour.

- **On your computer** — see [**emulator setup.md**](docs/emulator-setup.md)  <br/>
use the browser for fast UI and layout changes, or the Android Emulator when you need the full app with native storage, playback, recording, and Android-specific behaviour

- **On a physical Android device** — see [**device setup.md**](docs/device-setup.md)  <br/>
run a development build against the local Expo server for real-device testing, especially recording, background behaviour, and hardware-specific features. A standalone APK workflow that runs without the development server will be added later.

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


