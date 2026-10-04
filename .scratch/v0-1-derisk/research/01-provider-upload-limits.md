# Does two hours of audio fit through the provider?

Research for [ticket 01](../issues/01-two-hours-through-the-provider.md). All provider figures
retrieved from primary vendor documentation on **2026-10-04**. Limits change; re-verify before
relying on any number here.

## Verdict

**Chunking is a v0.1 requirement, not a future optimisation.**

A two-hour recording at the quality §12 demands cannot be sent to Groq or OpenAI in a single
request. Not at 128 kbps, not at 96 kbps, not at 64 kbps. The gap is not marginal — it is
**4.6x** over the limit at the quality level the mandated audio library produces by default.

Consequently §10's `Transcript` interface is **wrong as specified**. See
[§10 is wrong as specified](#10-is-wrong-as-specified).

---

## 1. Hard per-request limits

### Groq

Source: [Speech to Text — GroqDocs](https://console.groq.com/docs/speech-to-text)
(raw markdown: `https://console.groq.com/docs/speech-to-text.md`)

Under **Working with Audio Files → Audio File Limitations**, verbatim:

| Field | Documented value |
| --- | --- |
| Max File Size | `25 MB (free tier), 100MB (dev tier)` |
| **Max Attachment File Size** | "25 MB. If you need to process larger files, use the `url` parameter to specify a url to the file instead." |
| Minimum File Length | `0.01 seconds` |
| Minimum Billed Length | `10 seconds. If you submit a request less than this, you will still be billed for 10 seconds.` |
| Supported File Types | `Either a URL or a direct file upload for flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm` |

No maximum audio **duration** is documented — only size.

**The "Max Attachment File Size" row is the one that decides this ticket.** The 100 MB dev-tier
figure is the ceiling for the *request*; the ceiling for a **directly uploaded file** is 25 MB
**on every tier**. The documented way to exceed 25 MB is to pass a `url` pointing at the audio.
Unpocketed is local-first by §3.1 ("The application must function without an Unpocketed server")
and therefore has no public URL to hand over. **That escape hatch is closed by the product
philosophy, not by the API.**

Also from the same page, **Audio Preprocessing**, verbatim:

> Our speech-to-text models will downsample audio to 16KHz mono before transcribing, which is
> optimal for speech recognition. This preprocessing can be performed client-side if your
> original file is extremely large and you want to make it smaller without a loss in quality
> (without chunking, Groq API speech-to-text endpoints accept up to 25MB for free tier and 100MB
> for dev tier). For lower latency, convert your files to `wav` format. When reducing file size,
> we recommend FLAC for lossless compression.

Note the parenthetical: Groq itself frames 25 MB / 100 MB as the limits that apply
**"without chunking."**

#### Groq rate limits — a second, separate constraint the ticket did not anticipate

Source: [Rate Limits — GroqDocs](https://console.groq.com/docs/rate-limits)
(raw markdown: `https://console.groq.com/docs/rate-limits.md`)

Unit definitions, verbatim: `**ASH:** Audio seconds per hour` and `**ASD:** Audio seconds per day`.

The page states, verbatim, immediately above its table:

> Note that the limits shown below are the base limits for the **Developer plan**, and higher
> limits are available for select workloads and enterprise use cases.

| MODEL ID | RPM | RPD | TPM | TPD | ASH | ASD |
| --- | --- | --- | --- | --- | --- | --- |
| `whisper-large-v3` | 20 | 2K | – | – | **7.2K** | 28.8K |
| `whisper-large-v3-turbo` | 20 | 2K | – | – | **7.2K** | 28.8K |

**ASH 7.2K = 7,200 audio-seconds per hour = exactly two hours of audio per hour.**

This is the **paid Developer plan** base limit, not the free tier. One two-hour recording
consumes **100% of the hourly audio allowance**. The daily allowance (ASD 28.8K = 8 hours)
permits four two-hour recordings per day.

Two consequences:

- A failed transcription of a two-hour file cannot be retried for up to an hour — which
  collides directly with §21 ("A failed transcription should be retryable") and §32's error
  handling. A retry button that is guaranteed to fail is not a retry button.
- Chunking does **not** relieve ASH. Eight chunks of the same two hours still bill 7,200
  audio-seconds. ASH is a throughput ceiling, orthogonal to the size cap.

**Unverified:** whether a *single* request of 7,200 audio-seconds is itself rejected for
exceeding the full hourly bucket, or merely drains it. The docs do not say. Groq's page adds
"there may be exceptions to these limits. You can view the current, exact rate limits for your
organization on the limits page in your account settings" — so per-account values vary. Test
this empirically before committing to Groq.

**Free-tier rate limits are not published.** The rate-limits page carries only the Developer-plan
table; the word "free" does not appear on it. Free-tier ASH/ASD must be read from the
authenticated account limits page. Under §19 (bring-your-own-key) the user's tier is not
Unpocketed's to choose, so the app must behave correctly on the *lower, undocumented* tier.

Pricing, for ticket 04's benefit (same STT page):
`whisper-large-v3` $0.111/hour, `whisper-large-v3-turbo` $0.04/hour; real-time speed factor
189 and 216 respectively.

### OpenAI

Source: [Speech to text — OpenAI API docs](https://developers.openai.com/api/docs/guides/speech-to-text)
(`platform.openai.com/docs/guides/speech-to-text` now 301-redirects here)

Verbatim:

> Files can be up to 25 MB. Supported input formats are `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`,
> `wav`, and `webm`.

And under the heading **Longer inputs**, verbatim:

> The Transcriptions API accepts files up to 25 MB. For larger recordings, use a compressed
> audio format or split the file into chunks of 25 MB or less. Avoid splitting in the middle of
> a sentence, which can remove context and reduce accuracy.

The page then gives a PyDub splitting example.

- **25 MB, hard, no tier distinction.** The documentation states no difference between
  `whisper-1`, `gpt-transcribe` / `gpt-4o-transcribe` and the mini variant on file size or format.
- No maximum duration is documented.
- **OpenAI's own documentation instructs you to chunk.** This is the citable primary source that
  makes chunking a vendor-prescribed requirement for long audio rather than an Unpocketed
  judgement call.
- There is no separate "free tier" file-size limit; OpenAI's API is prepaid-credit, and the size
  cap is the same for everyone.

### Deepgram

Source: [Pre-recorded Audio — Deepgram Docs](https://developers.deepgram.com/docs/pre-recorded-audio)

Under **Limits**, verbatim:

> **File size**: Maximum 2 GB. For large video files, extract the audio stream first.
>
> **Rate limits**: Up to 100 concurrent requests per project for Nova, Base, and Enhanced models.
> For full details, see API Rate Limits.
>
> **Processing time**: Requests exceeding 10 minutes (Nova/Base/Enhanced) or 20 minutes (Whisper)
> return a `504: Gateway Timeout` error.

Concurrency, from [API Rate Limits](https://developers.deepgram.com/reference/api-rate-limits):
Pay-As-You-Go and Growth both allow up to **50 concurrent** pre-recorded requests (Flux STT,
Nova-3, Nova-2, Nova, Enhanced, Base); Deepgram Whisper Cloud is limited to **3 concurrent** on
those plans, 15 on Enterprise, and is North-America-only. Note the 100-vs-50 discrepancy between
Deepgram's own two pages — the rate-limits reference is the more specific source.

Free tier, from [Deepgram Pricing](https://deepgram.com/pricing): "Free $200 Credit",
"No credit card required", then Pay-As-You-Go per-minute billing (Nova-3 monolingual
$0.0043/min ≈ $0.26/hour of audio). **There is no reduced file-size limit for free accounts** —
the free offer is a credit balance, not a capability tier. This is a materially different
bring-your-own-key story from Groq's 25 MB free-tier cap.

Important: the "Processing time" limit is about **server-side processing wall-clock**, not audio
duration. Deepgram's batch models run far faster than real time, so two hours of audio normally
processes well inside 10 minutes — but it is a genuine failure mode, and it is exactly what the
callback path exists to remove.

---

## 2. Does any provider offer a path around the single-request size cap?

Keep two different things apart, because only one of them breaks the domain model:

- **Chunked *upload*** — resumable/multipart transport of *one* logical job. Produces one
  transcript. Harmless to `Transcript`.
- **Chunked *audio*** — N independent transcription requests whose texts must be stitched.
  Produces N partial results that must be assembled, and N independent failure points.
  **This is what breaks `Transcript`.**

| Provider | Resumable/chunked upload? | Async callback? | Remote-URL ingestion? | Usable by a local-first Android app? |
| --- | --- | --- | --- | --- |
| Groq | No | No (Batch API exists but **requires `url`**) | Yes, `url` param | **No** — needs a public URL |
| OpenAI | No | No | No (multipart file only) | **No** |
| Deepgram | Not needed (2 GB cap) | **Yes** (`callback=URL`) | Yes (`{"url": "..."}`) | **Yes** for direct binary upload; callback needs a public URL |

### Groq — no

No resumable or multipart-chunked upload endpoint is documented. The `url` parameter is the only
documented route past 25 MB, and the
[API reference](https://console.groq.com/docs/api-reference) describes it as:

> `url` string Optional — The audio URL to translate/transcribe (supports Base64URL). Either a
> file or a URL must be provided. **For Batch API requests, the URL field is required since the
> file field is not supported.**

So the Batch API is not an escape hatch either: it also demands a URL. Both routes require the
audio to be reachable from the public internet, which §3.1 forbids Unpocketed from arranging.

**Untested ambiguity — ticket 04 must settle this empirically.** Groq's two size rows sit
adjacent and can be read two ways: either "Max Attachment File Size: 25 MB" is a tier-invariant
ceiling on multipart upload (the plain reading, and the one taken here), or "Max File Size: 25 MB
(free tier), 100MB (dev tier)" is the operative figure for uploads and the 25 MB attachment row
is stale. Groq's own community forum carries a thread titled *"Whisper payload up to 100MB for
dev tier not working?"* (non-primary, user-reported — not relied on here) suggesting the
distinction bites in practice. **The headline verdict is unaffected either way:** at 128 kbps —
`expo-audio`'s actual `HIGH_QUALITY` output, 115.2 MB — Groq fails on *both* readings. This only
matters if someone proposes 64 or 96 kbps as a compromise, in which case the 100 MB reading must
be tested with a real dev-tier key before Groq is chosen.

**Unverified:** "supports Base64URL" hints that a `data:` URI might be accepted inline. The docs
state no size behaviour for that path, and base64 inflates payloads ~33% (so even a 100 MB
request ceiling would carry only ~75 MB of audio — still short of 115.2 MB at 128 kbps). Do not
design around this without testing it.

### OpenAI — no

Multipart `file` upload only. No async job submission, no callback, no resumable upload, no
remote-URL ingestion for `/v1/audio/transcriptions`. The documentation's answer to long audio is
to split the file yourself. (OpenAI's Realtime transcription API is for live microphone/stream
input, not for submitting a finished file, and is not a batch workaround.)

### Deepgram — yes, and it does not need one

Deepgram does not need a size workaround: **2 GB** swallows two hours at any sane bitrate with
enormous headroom. It also offers a true async path.

[STT Callback](https://developers.deepgram.com/docs/callback), verbatim:

> Deepgram's Callback feature allows you to supply a callback URL to which transcriptions can be
> returned. When passed, Deepgram will immediately respond with a `request_id` before processing
> your audio asynchronously.

> For pre-recorded audio: `http` or `https`
>
> [...] it's important to note that only ports 80, 443, 8080, and 8443 are permitted for callbacks.

> If the HTTP status code of the response to the callback POST request is unsuccessful (not
> 200-299), Deepgram will retry the callback up to 10 times with a 30 second delay between
> attempts.

**The trap, stated plainly:** Deepgram's callback posts the transcript to a URL *you* host. An
Android app has no inbound HTTP endpoint on ports 80/443/8080/8443, and §3.1 forbids an
Unpocketed server. **So Unpocketed cannot use the callback.** The same applies to Deepgram's
remote-URL ingestion — the audio must be internet-reachable, and a file in app-private storage
is not.

What Unpocketed *can* use is Deepgram's **plain synchronous binary upload** —
`--data-binary @youraudio.wav` against `https://api.deepgram.com/v1/listen` — which accepts up
to 2 GB in a single request. That is the only one of the three providers where a whole two-hour
recording goes up in one call from a device with no server.

### The failure mode nobody's size cap covers

Uploading ~115 MB over mobile data, in one request, with no resumability, on a phone that may
change networks or sleep mid-transfer. Only Deepgram's callback would decouple upload from
result retrieval, and Unpocketed cannot use it. This argues for client-side chunking on
*reliability* grounds **independently of any size cap** — smaller requests fail smaller and
retry cheaper. Worth weighing in ticket 02 (background execution) as well.

---

## 3. What two hours actually weighs

Two hours = 7,200 seconds. For CBR, `bytes = kbps x 1000 x 7200 / 8`.
Container overhead (MP4/M4A boxes) is well under 1% at these sizes and is ignored.

| Encoding | Bytes | MB (10^6) | MiB (2^20) |
| --- | --- | --- | --- |
| AAC 64 kbps mono | 57,600,000 | **57.6 MB** | 54.9 MiB |
| AAC 96 kbps mono | 86,400,000 | **86.4 MB** | 82.4 MiB |
| AAC 128 kbps mono | 115,200,000 | **115.2 MB** | 109.9 MiB |
| 16 kHz 16-bit mono WAV (PCM, 32,000 B/s) | 230,400,000 | **230.4 MB** | 219.7 MiB |

Inverted — the number that actually settles the ticket:

| Cap | Bitrate that fits 2 hours | Longest clip at 64 / 96 / 128 kbps |
| --- | --- | --- |
| **25 MB** (Groq free, Groq attachment ceiling, OpenAI) | **27.8 kbps** | 52 min / 35 min / 26 min |
| **100 MB** (Groq dev tier, request ceiling only) | **111.1 kbps** | 208 min / 139 min / 104 min |
| **2 GB** (Deepgram) | ~2,386 kbps | ~37 hours at 128 kbps |

Chunks required for a two-hour recording under a 25 MB cap: **3** at 64 kbps, **4** at 96 kbps,
**5** at 128 kbps (more in practice, since overlap is needed to avoid cutting mid-sentence).

### What quality floor does §12 actually imply?

§12 requires quality "at least comparable to the device's stock recorder" and says the app
"should initially prefer reliable, good-quality audio over aggressively minimising storage."
§8 mandates `expo-audio`. Its documented presets
([Expo Audio SDK](https://docs.expo.dev/versions/latest/sdk/audio/)) are verbatim:

```js
RecordingPresets.HIGH_QUALITY = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 2,
  bitRate: 128000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ...
};

RecordingPresets.LOW_QUALITY = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 2,
  bitRate: 64000,
  android: { extension: '.3gp', outputFormat: '3gp', audioEncoder: 'amr_nb' },
  ...
};
```

So the **default good-quality recording this project will produce is 128 kbps AAC — 115.2 MB for
two hours.** That is the real number, not a hypothetical.

And `LOW_QUALITY` is not an escape route, for two independent reasons:

1. On Android it switches to **AMR-NB in a `.3gp` container**. AMR-NB is a 1990s narrowband
   telephony codec. Shipping it would plainly fail §12's comparison against the stock recorder.
2. **`.3gp` / AMR-NB appears in neither Groq's nor OpenAI's list of supported input formats.**
   Groq accepts `flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm`; OpenAI accepts `mp3, mp4,
   mpeg, mpga, m4a, wav, webm`. So `LOW_QUALITY` on Android produces a file that cannot be sent
   as-is to either Whisper-compatible provider at all — a direct collision with §21's "Send
   original/correctly encoded audio."

### Why "just transcode it smaller" is not available

Fitting two hours into 25 MB needs **27.8 kbps**. Options and why each fails:

- **Re-encode the stored original down to ~28 kbps** — violates §3.2 ("Original audio is
  sacred", "The original recording should never be destructively modified").
- **Record at ~28 kbps in the first place** — violates §12 outright, and is below AMR-NB
  territory for a 44.1 kHz stereo-capable pipeline.
- **Transcode a throwaway copy at ~28 kbps purely for upload** — respects §3.2, but produces
  audio materially worse than Groq's own 16 kHz mono preprocessing target, degrades transcription
  quality (the very thing §12's checklist ends on), and requires an on-device transcoder that is
  not in §8's stack. It also sits awkwardly against §21's "original/correctly encoded audio."
  Nor does Groq's own FLAC suggestion help: its 16 kHz 16-bit mono preprocessing target is
  230.4 MB as raw PCM for two hours, and FLAC on speech typically lands at 50–70% of PCM, i.e.
  roughly **115–161 MB** — still 5–6x over the 25 MB cap.

A 16 kHz 16-bit mono **WAV** — i.e. exactly the format Groq says it downsamples to anyway — is
**230.4 MB** for two hours. Nine times the 25 MB cap. There is no encoding of two hours of
intelligible speech that fits 25 MB without going below the §12 floor.

---

## 4. The decision

### Does chunking have to be in v0.1?

**Yes — if the first provider is Groq or OpenAI. Unambiguously yes.**

| Provider | 2h @ 128 kbps (115.2 MB) | 2h @ 96 kbps (86.4 MB) | 2h @ 64 kbps (57.6 MB) |
| --- | --- | --- | --- |
| Groq, direct file upload (any tier) — 25 MB | **FAILS** (4.6x over) | **FAILS** (3.5x over) | **FAILS** (2.3x over) |
| Groq dev tier request ceiling — 100 MB, needs `url` | FAILS (1.15x over) | fits on paper, unreachable without a public URL | fits on paper, unreachable without a public URL |
| OpenAI — 25 MB | **FAILS** (4.6x over) | **FAILS** (3.5x over) | **FAILS** (2.3x over) |
| Deepgram — 2 GB | **FITS, ~17.8x headroom** | FITS, ~23.8x headroom | FITS, ~35.6x headroom |

§19's settings mockup shows `Groq` / `whisper-large-v3-turbo`, which makes Groq the likely first
provider. **On that assumption, chunking is in v0.1.** Three to five sequential provider calls
per two-hour recording, with overlap handling, and at least four of those calls must all succeed
before the user has a transcript.

Only Deepgram clears a two-hour recording in one request from a serverless mobile client, with
~18x headroom at `expo-audio`'s own `HIGH_QUALITY` preset. If Deepgram ships first, chunking
stays out of v0.1 — but Deepgram is *not* Whisper-compatible, which changes ticket 04's
sequencing argument entirely: the provider that avoids chunking is also the one with the
genuinely different API shape that §3.3's abstraction needs to be stressed against.

### §10 is wrong as specified

The ticket's conditional has triggered. If Groq ships first, this spec block cannot represent
what the system will actually produce:

```ts
interface Transcript {
  id: string;
  recordingId: string;
  providerId: string;
  modelId: string;
  text: string;          // <- a transcript stitched from 3-5 provider calls
  createdAt: string;
  updatedAt: string;
}
```

Concretely missing:

1. **No segment or offset concept.** A transcript assembled from 5 chunks needs per-chunk time
   offsets to be stitched at all, to de-duplicate overlap regions, and to support any future
   seek-to-text behaviour. A flat `text` destroys the boundary information at the exact moment
   it is needed.
2. **No partial-failure representation.** With 5 calls, "chunk 4 of 5 failed" is the *normal*
   failure, not an edge case. §21's state machine — `Not transcribed / Transcribing /
   Transcribed / Failed` — has no state for "3 of 5 done" and no way to express a retry that
   re-sends only the failed chunk. Retrying all 5 wastes money the user is paying directly
   (§19: "Unpocketed does not pay provider usage on the user's behalf") and burns ASH quota that
   is already exactly exhausted by one pass.
3. **No chunk-assembly provenance.** §20 requires a transcript to answer "Which provider and
   model generated this?" With chunking, it should also answer "and was it complete?" A
   `Transcript` row with a gap where chunk 4 should be is indistinguishable from a complete one.

### Further contradictions surfaced

- **§21 "Send original/correctly encoded audio" vs. the 25 MB cap.** These are not
  simultaneously satisfiable for two hours at §12 quality. One of the three — §12 quality,
  §34's two-hour target, or §21's original-audio upload — has to give. Chunking is the option
  that gives up none of them (each chunk is a verbatim slice of the original, re-containerised
  not re-encoded).
- **§21 "A failed transcription should be retryable" vs. Groq ASH 7.2K.** A two-hour recording
  exhausts the hourly audio allowance on the *paid* tier. The retry is rate-limited for up to an
  hour. §32's error handling needs to say something true about this.
- **§18's `TranscriptionProvider` interface** returns a flat `Promise<TranscriptionResult>`.
  A chunked provider needs progress reporting (§21 has only a binary `Transcribing` state) and
  partial-result surfacing. Feed this to ticket 04.
- **§8's stack has no audio-slicing capability.** `expo-audio` records and plays; it does not
  split. Chunking at container level needs either a native module or a JS MP4/ADTS parser, and
  that is a PR-7-scope item nobody has budgeted. Flag for the roadmap (§38).
- **`expo-audio`'s `LOW_QUALITY` Android preset emits `.3gp`/AMR-NB**, a format neither Groq nor
  OpenAI accepts. If any code path can produce it, transcription breaks outright.

### Recommendation

1. Treat chunking as in-scope for PR 7 **or** ship Deepgram first and defer it. Do not ship Groq
   first while pretending chunking is a later concern — it is load-bearing from the first
   two-hour test in §36's matrix.
2. Revise §10's `Transcript` to carry segments with offsets and an explicit completeness/partial
   state before PR 7 begins. The migration cost of adding this later, after transcripts exist in
   SQLite, is much higher than specifying it now.
3. Verify empirically before committing to Groq: whether a single 7,200-audio-second request is
   accepted at all, and what a free-tier key's actual ASH/ASD values are.

---

## Sources

All retrieved 2026-10-04.

- [Groq — Speech to Text](https://console.groq.com/docs/speech-to-text) (also `.md` variant)
- [Groq — Rate Limits](https://console.groq.com/docs/rate-limits) (also `.md` variant)
- [Groq — API Reference](https://console.groq.com/docs/api-reference)
- [OpenAI — Speech to text guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- [Deepgram — Pre-recorded Audio](https://developers.deepgram.com/docs/pre-recorded-audio)
- [Deepgram — API Rate Limits](https://developers.deepgram.com/reference/api-rate-limits)
- [Deepgram — STT Callback](https://developers.deepgram.com/docs/callback)
- [Deepgram — Pricing](https://deepgram.com/pricing)
- [Expo — Audio (expo-audio) SDK](https://docs.expo.dev/versions/latest/sdk/audio/)
