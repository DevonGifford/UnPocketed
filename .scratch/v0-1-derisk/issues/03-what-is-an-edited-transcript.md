# What is an edited transcript?

Type: grilling
Status: open
Map: [De-risk v0.1](../map.md)

## Question

The spec contradicts itself. Three statements cannot all hold:

- **§23** — the transcript screen supports **editing**.
- **§20** — "A transcript should always make it possible to answer: *Which provider and model generated this?*"
- **§10** — `Transcript` has a mutable `text` field, an `updatedAt`, a `providerId` and a `modelId`, and no flag distinguishing model output from human-edited text.

Once a user fixes three misheard words, the record still claims `modelId: whisper-large-v3` but the text is no longer what that model produced. §22's whole point — that provider choice becomes "verifiable rather than ideological" because users can compare transcripts themselves — quietly breaks: you can no longer tell whether you are comparing two models or one model and one careful proofread.

What should the model be? Candidates to grill, not a menu to pick from blind:

- An edit produces a **new** `Transcript` with a distinct source (`human-edited`, deriving from its parent) — provenance stays honest, at the cost of more records and a parent/child relation.
- The existing record gains an **edited flag** plus the original text retained alongside — cheaper, keeps one row per transcription, but now `text` has two meanings.
- Edits are a **separate layer** over an immutable transcript (a diff or patch set) — strongest provenance, most machinery, probably too much for v0.1.
- Editing is **deferred out of v0.1** entirely — but §5 item 13 lists "edit or copy transcript text" as an MVP success criterion, so this needs an explicit decision, not a silent drop.

Also settle the downstream consequences, since they are what make this worth deciding now rather than at PR9:

- What do §24's Markdown and JSON exports state about provenance for an edited transcript? The §24 example prints `Provider:` and `Model:` with no room for "edited by hand."
- Does §25's deletion model change — can the original model output be deleted while keeping the edit, or vice versa?

## Note on ordering

Previously blocked on the chunking question, now unblocked. Chunk assembly is about how `text` is *produced*; edit provenance is about what happens *after* it exists. They touch the same entity but are separable, so this is a cheap HITL ticket takeable alongside the heavier ones — just expect to state the answer in a way that survives `Transcript` later gaining a segment concept, should [Which provider ships first?](04-which-provider-ships-first.md) land on a 25 MB provider.