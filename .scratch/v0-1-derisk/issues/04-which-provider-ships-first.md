# Which provider ships first?

Type: grilling
Status: open
Map: [De-risk v0.1](../map.md)

## Question

§18 says "The MVP begins with one provider" and never names it. §19's settings mockup shows `Groq` / `whisper-large-v3-turbo`, which looks like a decision but reads as illustration. PR7 cannot start without the answer, and PR8's "second provider" only proves the §3.3 abstraction if the two are *different enough* to stress it.

Decide:

1. **Which single provider ships in PR7**, and why — cost per hour of audio, latency on a two-hour file, transcription quality, API ergonomics, signup friction for a bring-your-own-key user, and whether it imposes the upload limit that the *two hours* ticket turned up.
2. **Which second provider in PR8**, chosen specifically to stress the adapter. Two Whisper-compatible endpoints would validate almost nothing — the abstraction only earns trust against a genuinely different API shape and response format.
3. Does `TranscriptionProvider` as sketched in §18 survive both? It currently returns a flat `TranscriptionResult` and takes an `AudioSource` — does the second provider's response force a richer result type, and is `custom-openai.ts` (an OpenAI-compatible base URL, per §18's file list) worth shipping in v0.1 as the cheap escape hatch that makes §3.3's promise real?

## Inputs now settled

[Does two hours of audio fit through the provider?](01-two-hours-through-the-provider.md) resolved, and it loaded this ticket heavily. This is no longer only a cost/quality ranking — **it decides whether chunking is in v0.1 at all.**

- **Groq and OpenAI cap a request at 25 MB.** Two hours at `expo-audio`'s `HIGH_QUALITY` default (128 kbps AAC) is 115.2 MB — five chunks. Fitting it whole needs 27.8 kbps, which violates §12.
- **Deepgram caps at 2 GB** — two hours fits with 17.8x headroom, no chunking, no slicing code.
- **No provider offers resumable or chunked upload.** Groq's `url`/Batch path and Deepgram's callback both need publicly-reachable audio, closed off by §3.1, not by the APIs.
- **Groq's ASH 7.2K** limit is exactly two hours of audio per hour. One long recording exhausts the hourly allowance, so §21's retry promise fails for up to an hour. Chunking does not relieve it — it is a throughput ceiling. Under §19's BYO-key model the user's tier is not ours to choose.
- **§8's stack cannot slice audio.** `expo-audio` records and plays; chunking needs a native module or a JS MP4/ADTS parser — unbudgeted PR7 scope.
- **`LOW_QUALITY` on Android emits `.3gp`/AMR-NB**, absent from both Groq's and OpenAI's supported-input lists. "Record lower quality" is not an escape.

So weigh the real cost of each option: **Deepgram removes a whole workstream** (no slicing, no partial-failure model, no chunk UI) and is also the genuinely different API shape §3.3's abstraction needs stressing against — those two arguments point the same way. Against that, price per hour, quality, and signup friction for a BYO-key user still matter, and Whisper-on-Groq is cheap and fast.

Add to question 3 above: §18's `TranscriptionProvider` returns a flat `Promise<TranscriptionResult>` with no progress or partial-result surface. If a 25 MB provider ships first, that interface is wrong as sketched — decide it here, not at PR7.

**One item flagged untested:** Groq's docs carry both "Max File Size 25 MB (free tier), 100MB (dev tier)" and "Max Attachment File Size 25 MB". The verdict holds on either reading at 128 kbps, but if anyone proposes 64 or 96 kbps as a compromise, the 100 MB reading must be tested against a real dev-tier key first.