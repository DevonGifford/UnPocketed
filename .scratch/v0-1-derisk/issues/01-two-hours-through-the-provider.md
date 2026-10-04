# Does two hours of audio fit through the provider?

Type: research
Status: resolved
Map: [De-risk v0.1](../map.md)

## Question

§34 requires the app to work with recordings of "approximately two hours." §12 requires audio quality at least comparable to the device's stock recorder, explicitly preferring quality over storage economy. §21 says transcription sends "original/correctly encoded audio" to the provider.

Nothing in the spec checks that those three statements are mutually satisfiable.

Find out, from current primary provider documentation (not memory):

1. For each candidate first provider — Groq, OpenAI, Deepgram — what is the **hard limit** on a transcription request? Max file size in MB, max audio duration, and any separate free-tier limit. Note the exact figure and cite the doc.
2. Do any of them offer a chunked, streaming, or async/callback upload path that sidesteps a single-request size cap? Deepgram in particular has a different API shape to the Whisper-compatible providers.
3. What does two hours of speech actually **weigh** at a few plausible encodings — e.g. AAC 64/96/128 kbps mono, and 16 kHz mono WAV? Simple arithmetic is fine; show the numbers.

Then answer the decision this blocks: **does chunking enter v0.1, or not?**

If a two-hour recording at acceptable quality cannot be sent in one request, then chunking is not a future optimisation — it is a v0.1 requirement, and §10's `Transcript` interface is wrong as specified. A single `text` field with no segment, offset, or chunk-assembly concept cannot represent a transcript stitched from eight separate provider calls, nor record a partial failure where chunk 5 of 8 failed. That would make this the first real correction to the spec.

If it does fit, say so plainly with the headroom figure, and chunking stays out of v0.1.

---

## Answer

**No — not through Groq or OpenAI. Chunking is a v0.1 requirement.**

Hard limits (primary docs, retrieved 2026-10-04):

| Provider | Max file size | Max duration | Free-tier difference |
| --- | --- | --- | --- |
| Groq | "25 MB (free tier), 100MB (dev tier)" — but "Max Attachment File Size: **25 MB**. If you need to process larger files, use the `url` parameter" | none documented | 25 MB cap; free-tier rate limits unpublished |
| OpenAI | "Files can be up to 25 MB." | none documented | none (same for all) |
| Deepgram | "Maximum 2 GB" | none; 504 if processing exceeds 10 min (Nova) / 20 min (Whisper) | none — $200 credit, not a capability tier |

Two hours weighs **57.6 MB** at 64 kbps, **86.4 MB** at 96 kbps, **115.2 MB** at 128 kbps, and
**230.4 MB** as 16 kHz 16-bit mono WAV. A 25 MB cap allows only **27.8 kbps** across two hours —
below AMR-NB, so §12's quality floor and §34's two hours cannot both be met in one 25 MB request.
`expo-audio`'s documented `HIGH_QUALITY` preset is 128 kbps AAC, so the real figure is 115.2 MB:
**4.6x over the limit**, needing 5 chunks.

No workaround exists. Neither provider offers chunked or resumable upload. Groq's `url` parameter
and Batch API, and Deepgram's callback and remote-URL ingestion, all require the audio or the
result endpoint to be **publicly reachable** — which §3.1 forbids. Only Deepgram's plain
synchronous binary upload takes a whole two-hour file, with ~18x headroom.

Second finding the ticket did not anticipate: Groq's **paid** Developer-plan limit is
**ASH 7.2K = 7,200 audio-seconds/hour**, exactly two hours. One recording exhausts the hourly
allowance, so §21's "failed transcription should be retryable" is unsatisfiable for up to an hour.

**§10's `Transcript` is therefore wrong as specified** (unless Deepgram ships first): a flat
`text` cannot carry chunk offsets for stitching/overlap removal, and §21's four states cannot
express "chunk 4 of 5 failed" or a partial re-send.

Full findings, with verbatim quotes, arithmetic and further spec contradictions:
[research/01-provider-upload-limits.md](../research/01-provider-upload-limits.md)
