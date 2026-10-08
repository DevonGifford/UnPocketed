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

## 0. Confirm the pickers render at all

**Do this before pasting any key.** It needs no account and no network, and if
it fails every numbered step below fails for a reason that has nothing to do
with providers.

1. Settings → tap **Provider**. Both `AssemblyAI` and `Deepgram` should be
   visible and tappable, with a tick beside the selected one.
2. Cancel → tap **Model**. Both AssemblyAI models should be visible, one marked
   `Default`.

`OptionPicker` is a new component and has never been rendered on a device. It
puts a `ScrollView` with a height-constraining class inside the dialog, which is
the same shape as the `flex-1`-on-`SafeAreaView` bug AGENTS.md records — where a
subtree measured zero height while typecheck, lint and a clean bundle all
passed. An empty or collapsed picker here is a **layout** finding, and the rest
of this script is noise until it is fixed.

## 1. Prove one provider works at all

This is the step that has never happened. Everything after it is comparison.

3. Record something short and spoken — **20 to 30 seconds**, a few clear
   sentences. Short enough to iterate, long enough that a wrong transcript is
   obvious.
4. Settings → **Provider** should already read `AssemblyAI`, **Model**
   `Universal-2`.
5. Settings → **API key** → paste the AssemblyAI key → Save. The row should
   change to dots plus the last four characters.
6. Open the recording → **Transcribe**.
7. Expect: the button reads `Transcribing…`, then a transcript appears with
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

8. Settings → **API key** is per provider, so switch first: **Provider** →
   `Deepgram`. The **API key** row should go back to `Not set`, the **Model** row
   to `Nova-3`, and the retention notice below should change to Deepgram's.
9. **API key** → paste the Deepgram key → Save.
10. Open the **same recording** → **Retranscribe with another model** → pick
   `Deepgram · Nova-3`.
11. Expect: a **second** transcript, chips for both at the top of the transcript
   section, and `deepgram · nova-3` on the new one.

That is the exit condition. The two things to confirm beyond "text appeared":

- **The first transcript is still there.** §22 makes retranscription additive;
  if the AssemblyAI one vanished or was overwritten, that is a §3.2 violation
  and the most serious thing this script can find.
- **The attribution is right on both.** **Write down the new chip's exact
  text.** It should read `nova-3`. Treat **anything else** as the finding —
  `2-general-nova` (the adapter read `name` instead of `arch`), a bare uuid, an
  empty chip, or any other string. Deepgram's own documented example is
  self-contradictory about this field, so `arch` is this adapter's best guess
  rather than a verified contract, and a value outside the provider's model list
  produces a chip the user can never select again.

## 3. Model selection within one provider

12. Settings → **Provider** → `AssemblyAI`. Its **Model** row should come back
    reading `Universal-2` and its key should still be stored — switching away
    and back must not have discarded either.
13. **Model** → `Universal-3.5 Pro`.
14. Same recording → **Retranscribe with another model** → `AssemblyAI ·
    Universal-3.5 Pro`.
15. Expect a **third** transcript attributed `assemblyai · universal-3-5-pro`.

Three transcripts of one recording, two providers, two AssemblyAI models. §20's
question — "which provider and model generated this?" — now has three different
answers on one screen, which is the whole point of §22.

## 4. Failure paths that have never run

Each of these is a code path PR7 or PR8 wrote and nothing has ever executed.

16. **A bad key.** Settings → **API key** → paste `not-a-real-key` → Save →
    Transcribe. Expect *"The provider did not accept your API key"* and **no**
    "Try again" button, because retrying sends the same bad credential.
17. **Offline.** Restore the good key, turn on aeroplane mode, Transcribe.
    Expect *"No internet connection"* and a transcript-safe message. Turn
    aeroplane mode off and retry: it should succeed.
18. **Leaving mid-transcription.** Start a transcription on AssemblyAI and press
    Back immediately. Reopen the recording. Expect it to re-attach and finish —
    that is `resumeJobFor`, and it must not start a second job. Check the
    AssemblyAI dashboard afterwards: **one** transcription billed, not two.
19. **Deepgram, leaving the screen.** Switch to Deepgram, start, press Back,
    reopen. Expect the transcript to **arrive anyway**.

    This is deliberate and is not the same test as step 18. A synchronous
    provider has no polling phase to stop — the single request *is* the
    transcription — so the caller's abort signal is not forwarded to it at all.
    Honouring it would convert "the user left the screen" into "throw away work
    that may already have been billed and that no `resume` can recover". The
    request therefore runs to completion in the background and files its
    result.

20. **Deepgram, killing the app.** Start a transcription and have the app
    *killed* mid-flight (`adb shell am force-stop com.unpocketed.app`), then
    relaunch. **This** is where Deepgram's missing job reference bites: expect
    *"That transcription could not be picked up again"*, which says you may
    still have been charged.

    Note this is the one place `force-stop` is a genuine kill test. AGENTS.md
    records that it proves nothing about an interrupted *recording*, because
    `MediaRecorder` runs in the media server and finalises the file regardless.
    A JavaScript promise holding an HTTP request has no such refuge — the app
    process dies and the request dies with it.

    Then check the Deepgram dashboard. Whether that request was billed is
    currently a documented uncertainty rather than a known fact, and this is
    what settles it.

## 5. A real recording, not a test clip

21. Record or import something **an hour long**, and transcribe it on
    **AssemblyAI**.

This is the one that matters for §38's PR5 promise that an hour-long recording
can be trusted, and it is the first time the network path sees a real file —
roughly 43–45 MB at the ~96 kbps the test device negotiates.

22. Then try the same hour-long recording on **Deepgram**.

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

- Whether the pickers rendered (steps 1–2), and which of steps 7, 11 and 15 produced a transcript, and the exact attribution
  text under each.
- Any step whose message differed from the one quoted here — the wording is
  §32's contract, so a mismatch is a finding even when the behaviour is right.
- The billed usage from both dashboards against the number of transcriptions you
  started. Step 18 in particular: a second charge there means the re-attach
  resubmitted, which is the specific failure AssemblyAI was chosen to prevent.
- Whether step 22 passed, failed with the `504` message, or failed some other
  way.
