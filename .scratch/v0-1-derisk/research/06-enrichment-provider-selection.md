# Which LLM providers ship first for enrichment?

Research for [PR 9.5](../../../docs/spec.md) (§38), opened 2026-10-08.
Same shape as [ticket 04](../issues/04-which-provider-ships-first.md) was for transcription.

## The short version

**Cost cannot decide this, and that is the most useful thing the research found.**
Every candidate is a rounding error against the transcription that must precede it. The
decisive axis turns out to be **data usage**, and it points somewhere uncomfortable: the one
genuinely free option is the one that trains on the user's transcripts.

## What a Brief actually costs

A one-hour recording is roughly 10,000 spoken words, or about **13,000 input tokens**. A
Brief — title, sub-headline, summary, overview, conclusion — is about **500 output tokens**.
Prices below are per 1M tokens, taken from each provider's own pricing page on 2026-10-08.

| Provider | Model | Input | Output | **Per hour-long transcript** |
| --- | --- | ---: | ---: | ---: |
| OpenAI | `gpt-5-nano` | $0.05 | $0.40 | **$0.0009** |
| Google | Gemini 2.5 Flash-Lite | $0.10 | $0.40 | **$0.0015** |
| OpenAI | `gpt-4o-mini` | $0.15 | $0.60 | **$0.0023** |
| Google | Gemini 3.5 Flash-Lite | $0.30 | $2.50 | **$0.0051** |
| Anthropic | Claude Haiku 4.5 | $1.00 | $5.00 | **$0.016** |
| Anthropic | Claude Sonnet 5 | $2.00 | $10.00 | **$0.031** |
| Anthropic | Claude Opus 5 | $5.00 | $25.00 | **$0.078** |

Now the comparison that matters. **Transcribing** that same hour costs **$0.17** on
AssemblyAI `universal-2` with diarization, or **~$0.26** on Deepgram `nova-3`.

So the *most expensive* enrichment option costs **less than half** the *cheapest*
transcription, and the cheapest costs about **half a percent** of it. A user who can afford
to transcribe can afford to enrich, whichever model they pick. Choosing a provider on price
would be optimising a number that is already negligible — and would trade away quality on the
one stage where quality is the entire product.

**Consequence for the model picker:** the spread from Haiku to Opus is ~5x on a base of under
a tenth of a cent. That is small enough that the default should be the *best* model and the
picker should let a user economise, rather than the reverse. PR8 already built that picker.

## Data usage — the axis that actually decides

Transcripts are the most sensitive thing this app holds. §26 says so outright:
*"Conversations, meetings, journals, and voice notes may contain personal or confidential
information."* Where that text goes, and whether it trains somebody's model, is not a
secondary concern.

| Provider | Trains on API data by default? | Retention |
| --- | --- | --- |
| **Anthropic** | **No.** "By default, Anthropic will not use inputs or outputs from commercial products (e.g. Claude for Work, Anthropic API...) to train models." | Deleted within 30 days |
| **OpenAI** | **No**, for API data since 1 March 2023, unless explicitly opted in | Up to 30 days; zero-retention available for eligible customers |
| **Google (Gemini) — paid tier** | **No.** The paid tier lists "Content **not** used to improve our products" as a benefit | Per paid-tier terms |
| **Google (Gemini) — free tier** | **Yes.** Google states "Content used to improve our products" applies to free-tier users | — |

**This is the finding.** Gemini's free tier needs no credit card and would let a user enrich
for nothing — and it is the only option here that feeds their private conversations into a
model vendor's training data. "Free" has a price, and it is paid in the one currency this app
exists to protect.

That does not disqualify Gemini. Its **paid** tier is as clean as the other two. It
disqualifies *quietly offering the free tier as the cheap default*, which is exactly what a
reasonable person would otherwise do.

## Structured output

A Brief is five named fields. Every candidate can return validated JSON against a schema, so
this is not a discriminator either — but the shapes differ, which is useful for §3.3:

- **Anthropic** — `output_config: {format: {...}}`, plus `strict: true` on tools. The
  `output_format` parameter is deprecated; new code uses `output_config`.
- **OpenAI** — `response_format` with a `json_schema`.
- **Google** — `responseSchema` / `responseMimeType` inside `generationConfig`.

Context windows are a non-issue: Claude's current models are 1M, and an hour of speech is
13K. Even a day-long recording would fit.

## What this means for the choice

Three candidates, all cheap, all capable of structured output, two of them clean on data by
default and the third clean only when paid for.

**Recommended: Anthropic first, an OpenAI-compatible endpoint second.**

- **Anthropic first** for the same reason AssemblyAI went first: it is the one whose
  defaults need no caveat. No training by default, 30-day deletion, the strongest structured
  output surface, and a context window that removes a whole class of failure.
- **An OpenAI-compatible endpoint second**, rather than OpenAI specifically — because one
  adapter then covers OpenAI, OpenRouter, **Ollama and LM Studio**. That is the
  `custom-openai.ts` dropped from PR8 finally landing, and it is the only option on the table
  that opens the door to a **local** model, which §40 wants and which would make enrichment
  free *and* private rather than one or the other.
- **Gemini is a strong third**, and stresses the abstraction hardest — its request shape
  (`contents`/`parts`) differs most from the other two. It is deferred rather than rejected,
  and if it ships, the free tier must be labelled for what it is at the point of choosing.

**Where this is weaker than ticket 04:** that one turned on a hard architectural fact
(Deepgram stores no transcripts, so §21 was unimplementable). Nothing here is that decisive.
Quality of summarisation is unmeasured and these three are close enough that it may stay
unmeasured — which is itself an argument for shipping two and letting §22's comparison
settle it, exactly as the transcription providers were left.

## Not examined

Mistral, Cohere, Llama via a host, and any self-hosted model other than through the
OpenAI-compatible path. The pool closed once three candidates met every constraint, as
ticket 04's did.
