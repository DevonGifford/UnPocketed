# PR8 device test — bring-your-own provider

PR8's exit condition is **"the same recording can be transcribed successfully by
two different models/providers"**, and it cannot be met by review. No
transcription has ever run against a real key, so every network path in PR7 and
PR8 is unexercised: upload, submit, poll, model attribution and every failure
branch. This script is what closes it.

It has to be run by hand. MIUI blocks `adb shell input`, so the taps cannot be
injected — the same wall that left `probeDurationMs` unexercised at PR6.

## Before you start

Two accounts, both free to open, neither needing a card for the credit:

| Provider   | Key from                                   | Signup credit |
| ---------- | ------------------------------------------ | ------------- |
| AssemblyAI | https://www.assemblyai.com/dashboard/signup | $50           |
| Deepgram   | https://console.deepgram.com/signup         | $200          |

An hour of audio costs about $0.15 on AssemblyAI. The whole of this script is a
rounding error against either balance, so nothing below needs rationing.

Keep both dashboards open in a browser. Steps 5 and 9 ask you to check a usage
figure there, which is the only way to confirm what was actually billed.

## 1. Prove one provider works at all

This is the step that has never happened. Everything after it is comparison.

1. Record something short and spoken — **20 to 30 seconds**, a few clear
   sentences. Short enough to iterate, long enough that a wrong transcript is
   obvious.
2. Settings → **Provider** should already read `AssemblyAI`, **Model**
   `Universal-2`.
3. Settings → **API key** → paste the AssemblyAI key → Save. The row should
   change to dots plus the last four characters.
4. Open the recording → **Transcribe**.
5. Expect: the button reads `Transcribing…`, then a transcript appears with
   `assemblyai · universal-2` above it.

**If this fails, stop and report it rather than continuing.** Nothing past here
is meaningful until one provider works, and the failure is the finding.

Worth watching specifically, because each is a thing only a live run can show:

- the auth header being the **bare key** rather than `Bearer`-prefixed;
- `speech_models` (plural, array) being accepted on the pre-recorded endpoint;
- the attribution reading `universal-2` and **not** `universal-3-5-pro` — if it
  reads the latter, the explicit pin is not holding and the costed price is not
  what you are paying.

## 2. The exit condition — same recording, second provider

6. Settings → **API key** is per provider, so switch first: **Provider** →
   `Deepgram`. The **API key** row should go back to `Not set`, the **Model** row
   to `Nova-3`, and the retention notice below should change to Deepgram's.
7. **API key** → paste the Deepgram key → Save.
8. Open the **same recording** → **Retranscribe with another model** → pick
   `Deepgram · Nova-3`.
9. Expect: a **second** transcript, chips for both at the top of the transcript
   section, and `deepgram · nova-3` on the new one.

That is the exit condition. The two things to confirm beyond "text appeared":

- **The first transcript is still there.** §22 makes retranscription additive;
  if the AssemblyAI one vanished or was overwritten, that is a §3.2 violation
  and the most serious thing this script can find.
- **The attribution is right on both.** `nova-3` comes from
  `metadata.model_info[uuid].arch`, four levels into the response. If the new
  chip reads `2-general-nova`, the adapter read `name` instead of `arch`.

## 3. Model selection within one provider

10. Settings → **Provider** → `AssemblyAI`. Its **Model** row should come back
    reading `Universal-2` and its key should still be stored — switching away
    and back must not have discarded either.
11. **Model** → `Universal-3.5 Pro`.
12. Same recording → **Retranscribe with another model** → `AssemblyAI ·
    Universal-3.5 Pro`.
13. Expect a **third** transcript attributed `assemblyai · universal-3-5-pro`.

Three transcripts of one recording, two providers, two AssemblyAI models. §20's
question — "which provider and model generated this?" — now has three different
answers on one screen, which is the whole point of §22.

## 4. Failure paths that have never run

Each of these is a code path PR7 or PR8 wrote and nothing has ever executed.

14. **A bad key.** Settings → **API key** → paste `not-a-real-key` → Save →
    Transcribe. Expect *"The provider did not accept your API key"* and **no**
    "Try again" button, because retrying sends the same bad credential.
15. **Offline.** Restore the good key, turn on aeroplane mode, Transcribe.
    Expect *"No internet connection"* and a transcript-safe message. Turn
    aeroplane mode off and retry: it should succeed.
16. **Leaving mid-transcription.** Start a transcription on AssemblyAI and press
    Back immediately. Reopen the recording. Expect it to re-attach and finish —
    that is `resumeJobFor`, and it must not start a second job. Check the
    AssemblyAI dashboard afterwards: **one** transcription billed, not two.
17. **The same, on Deepgram.** Switch to Deepgram, start, press Back, reopen.
    Deepgram has nothing to re-attach *to*, so expect the honest message rather
    than a recovery: *"That transcription could not be picked up again"*. It
    says you may still have been charged — check the dashboard and confirm
    whether that happened, because that answer is currently a documented
    uncertainty rather than a known fact.

## 5. A real recording, not a test clip

18. Record or import something **an hour long**, and transcribe it on
    **AssemblyAI**.

This is the one that matters for §38's PR5 promise that an hour-long recording
can be trusted, and it is the first time the network path sees a real file —
roughly 43–45 MB at the ~96 kbps the test device negotiates.

19. Then try the same hour-long recording on **Deepgram**.

Expect this one to be **genuinely at risk**, and not because of a bug.
Deepgram caps processing at **10 minutes per file** and answers `504` past it,
which is a server-side limit no client setting can raise. For a 45 MB upload
that needs roughly 600–700 kbps sustained. On a fast connection it should pass;
on mobile data it may well not.

If it fails, expect *"The provider gave up after 10 minutes, which is its limit
for one recording."* **A `504` here is a correct result, not a defect** — it is
the documented cost of the provider ticket 04 accepted second place for. What
would be a defect is a generic "No internet connection", which would mean the
local 15-minute backstop fired first and blamed the network for the provider's
own ceiling.

## What to report back

- Which of steps 5, 9 and 13 produced a transcript, and the exact attribution
  text under each.
- Any step whose message differed from the one quoted here — the wording is
  §32's contract, so a mismatch is a finding even when the behaviour is right.
- The billed usage from both dashboards against the number of transcriptions you
  started. Step 16 in particular: a second charge there means the re-attach
  resubmitted, which is the specific failure AssemblyAI was chosen to prevent.
- Whether step 19 passed, failed with the `504` message, or failed some other
  way.
