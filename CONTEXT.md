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

**Source**:
Who produced a Transcript's current text — the Provider's Model, the user, or an LLM that cleaned it up. Not a boolean: an LLM correcting a mishearing and a user fixing a typo are the same operation by different authors, so one field answers for both and §20 stays answerable at every step.
_Avoid_: edited (that is a state, not an author), origin, author (reserved for people)

**Derived Transcript**:
A Transcript produced by changing another one's text rather than by transcribing audio, carrying a link to the Transcript it came from. Editing a Derived Transcript updates it in place rather than making a third — once something other than the recogniser owns the text, there is no further provenance to protect.
_Avoid_: version, revision, copy, fork, child

**Brief**:
The structured reading of a Transcript an LLM produces: title, sub-headline, executive summary, overview and conclusion. Owned by a Transcript, attributed to its own Provider and Model, and never a replacement for the Transcript it describes. Every field is optional — an absent conclusion means the model produced none, and the interface shows nothing rather than a heading over filler.
_Avoid_: summary (that is one field inside it), analysis, insights, notes, AI summary

**Enrichment**:
The act of producing a Brief, and of cleaning up a Transcript, from a Transcript's text. Distinct from Transcription in every way that matters: it reads text rather than audio, answers to different Providers, and can be repeated at any time because its input is already on the device.
_Avoid_: processing, post-processing, polishing, AI pass

**Provider**:
A service that performs Transcription — speech to text, and nothing else. Chosen by the user, and paid for directly by them where it is a remote one. Reached through an adapter, so the rest of the application stays ignorant of which one is in use.

Deliberately no longer "an external service": an on-device Provider needs no API key and no network, and the word has to still fit when one lands (§40). A later layer that reads a Transcript and derives a title, a summary or speaker turns from it is a different job answered by different services, and must not borrow this word.
_Avoid_: vendor, backend, server, API, service, integration

**Model**:
The specific speech-to-text model used within a Provider. Selected independently of the Provider where the Provider allows it, and recorded on every Transcript.

Scoped to transcription on purpose. It does not mean any model Unpocketed might one day send text to — only the one that turned audio into this Transcript's words.
_Avoid_: engine, algorithm, version

**Segment**:
One continuous stretch of speech within a Transcript attributed to a single Speaker, with its offsets into the Recording. A Transcript has either none or several — never exactly one meaningful turn.
_Avoid_: utterance (that is the providers' word), turn, chunk, line, block, bubble

**Speaker**:
A participant in a Recording, as separated by the Provider's diarization. Identified by a 0-based index within one Transcript and **nothing more** — it is a label, not a person: Speaker 1 in one Transcript is not the same human as Speaker 1 in another, even for the same Recording. Unpocketed never infers a Speaker from text and never names one.
_Avoid_: participant, person, voice, user, channel

**Diarization**:
The Provider's separation of a Recording into Speakers. Requested per transcription and chargeable at some Providers, so it is the user's choice rather than always on.
_Avoid_: speaker detection, speaker ID, voice recognition (that implies identifying *who*, which this does not do)

### Ownership

**Export**:
Producing a user-owned copy of a Recording or Transcript in a standard format, for use outside Unpocketed.
_Avoid_: download (the data is already local), backup, save as, share
