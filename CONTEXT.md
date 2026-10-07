# Unpocketed

A local-first Android application for recording, importing, transcribing and exporting spoken audio. The user owns the audio, chooses the transcription service, and keeps both on their own device.

This file is the glossary. Product scope and technical decisions live in [docs/spec.md](docs/spec.md).

## Language

### Audio

**Recording**:
An original audio source together with its metadata, whether captured by Unpocketed or brought in from elsewhere. The central entity.
_Avoid_: note, memo, clip, file, voice note

**Original audio**:
The unmodified audio file underlying a Recording. Never rewritten by transcription or processing.
_Avoid_: master, raw, source file

**Source**:
Whether a Recording was `recorded` by Unpocketed or `imported` from elsewhere. Past that distinction, both behave identically.
_Avoid_: origin, type, kind

**Interrupted**:
A Recording whose capture ended with Unpocketed's termination rather than with the user stopping it. Its original audio is preserved and exportable, but the container lacks the index needed to play it, so it cannot be played back, and its duration is an estimate rather than a measurement.
_Avoid_: corrupt, broken, damaged, failed, crashed, truncated

**Import**:
Bringing an externally-created audio file under Unpocketed's management by copying it into managed storage.
_Avoid_: upload (nothing is sent anywhere — see **Export**), add, attach, sync

**Library**:
The complete set of Recordings on the device, regardless of source.
_Avoid_: feed, inbox, archive, list, collection

### Transcription

**Transcript**:
One textual interpretation of a Recording, attributed to the Provider and Model that produced it. A Recording has zero or more, and they coexist.
_Avoid_: transcription (that is the act), text, caption, note

**Transcription**:
The act of turning a Recording into a Transcript.
_Avoid_: transcript, processing, conversion

**Retranscription**:
Producing an additional Transcript for a Recording that already has one. Additive — it never replaces existing Transcripts.
_Avoid_: re-run, redo, regenerate, refresh, update

**Provider**:
An external service that performs Transcription, chosen and paid for by the user. Reached through an adapter, so the rest of the application stays ignorant of which one is in use.
_Avoid_: vendor, backend, server, API, service, integration

**Model**:
The specific speech-to-text model used within a Provider. Selected independently of the Provider where the Provider allows it, and recorded on every Transcript.
_Avoid_: engine, algorithm, version

### Ownership

**Export**:
Producing a user-owned copy of a Recording or Transcript in a standard format, for use outside Unpocketed.
_Avoid_: download (the data is already local), backup, save as, share
