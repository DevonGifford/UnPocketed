# Privacy

**Unpocketed has no account, no server and no analytics.** There is nothing to sign up for, nothing is uploaded unless you ask for it, and no Unpocketed service sits between you and anything else. This document says exactly what that does and does not cover.

It describes the application itself. It is not legal advice, and it does not cover what a transcription or AI provider you choose does with what you send them beyond what they publish — each one is linked below.

Last updated 2026-10-08, for version 0.1.0.

---

## What Unpocketed collects

Nothing.

There is no account, no sign-in, no device identifier, no crash reporting, no usage analytics, and no advertising. The application contains no code that reports anything to its authors, and never has. It is open source: you can check.

## Where your data stays

Everything the app creates lives in its own private storage on your device, which no other application can read:

| | |
|---|---|
| **Recordings** | the original audio, plus a small JSON file beside each one holding its name and duration |
| **Transcripts** | including edits you make and any derived versions |
| **Briefs** | the title, summary, overview and conclusion an AI model produced |
| **An index** | a SQLite database that makes the library fast; it can be rebuilt from the files above |
| **API keys** | in Android's encrypted keystore, not in the database and not in the index |

The original audio is never altered or discarded to make room for anything derived from it.

## What leaves the device, and when

Only two things ever leave, and each only when you ask for it by name:

**Transcription sends a recording.** When you choose a provider and tap transcribe, that recording's audio is uploaded to the provider you picked, using your own API key and your own account with them. Nothing is sent before that tap, and no other recording goes with it.

**Enrichment sends a transcript.** When you ask for a brief or an AI cleanup, the text of that transcript is sent to the AI provider you picked. The audio is not.

There is no background sync, no queue that uploads later, and no "improve the product" pathway. If you never configure a provider, nothing ever leaves the device at all, and the app still records, plays back and exports.

### What each provider does with it

These are the providers' own stated terms, repeated inside the app at the point you choose one:

**Transcription**

- **[AssemblyAI](https://www.assemblyai.com/legal/privacy-policy)** — keeps the audio for up to 48 hours and the transcript for 30 days. Their account settings cannot turn that off for this kind of request.
- **[Deepgram](https://deepgram.com/privacy)** — does not store your audio or the transcript; the reply to Unpocketed's request is the only copy.

**Enrichment**

- **[Anthropic](https://www.anthropic.com/legal/privacy)** — does not train models on what you send through its API, and deletes it within 30 days.
- **[Google Gemini](https://ai.google.dev/gemini-api/terms)** — depends on which tier your key bills to. On the **free** tier, what you send may be used to improve Google's models and may be read by human reviewers; Google's own guidance is not to send private data on it. The paid tier does neither. **Unpocketed cannot tell which applies to you** — the tier follows your Google Cloud project's billing status rather than the key, and no API reports it. Treat a free key as meaning people at Google may read that transcript.

Your API keys are sent only to the provider they belong to, as that provider's own authentication header.

## Android backup

Android's own backup service copies app data to **your** Google Drive, and Unpocketed leaves it enabled. Your recordings and transcripts are therefore included in your device backup, which is what lets them survive a switch to a new phone.

This is Google's backup of your own device, not an upload to Unpocketed — there is no Unpocketed server for anything to be uploaded to. But it is the one case where audio can leave the device without you approving that recording individually, so it is stated here rather than left implied. Turn it off for this app in **Settings → Google → Backup** if you would rather it did not.

## Export and sharing

Exporting a transcript or sharing a recording hands the file to Android's share sheet, and it goes wherever you send it. Unpocketed has no part in what happens after that.

## Deletion

Deleting a recording removes its audio and, with a warning first, the transcripts and briefs derived from it. Deleting a transcript leaves the recording alone. Removing an API key deletes it from the keystore. Uninstalling the app removes everything it stored on the device — subject to the backup note above.

None of this reaches a provider that already has a copy. If AssemblyAI holds your audio for 48 hours, deleting the recording here does not shorten that; their own terms govern it.

## Recording responsibly

Recording laws differ by country and situation, and Unpocketed does not try to work out whether a given recording is lawful. Making sure you have permission or another lawful basis to record is yours. The app does not hide that it is recording, and will not be given a feature that does.

## Changes

This file is versioned in the repository, so its history is the change log. Material changes will be noted in the release that carries them.

Questions and corrections: [github.com/DevonGifford/UnPocketed/issues](https://github.com/DevonGifford/UnPocketed/issues)
