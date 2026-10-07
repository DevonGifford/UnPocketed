# How is audio written during capture?

Type: grilling
Status: resolved
Map: [De-risk v0.1](../map.md)
Research: [05-capture-write-strategy.md](../research/05-capture-write-strategy.md)

## Resolution

**One growing `.m4a`. A recording killed mid-capture is preserved but not playable, and that is
what §14 promises.** Resolved 2026-10-07.

1. **One file.** Segments are *foreclosed*, not rejected: `expo-audio` does not expose
   `setNextOutputFile`, and the stop/start alternative restarts a `microphone` foreground service
   from the background once per segment — which ticket 02 established Android forbids.
2. **Moot**, since segments are out.
3. **Recover-and-adopt**, not recover-and-finalise: a `moov` atom cannot be synthesised on-device.
   An orphan in `Paths.document/Audio/` is adopted into the library automatically, flagged as
   interrupted and unplayable, exportable as the raw file, with its duration estimated from file
   size and labelled approximate.
4. **The app owns it, and currently does not.** The notification's Stop button finalises the file
   correctly and emits `recordingStatusUpdate`, but `useAudioRecorder` is called with one argument
   so the listener is never registered and every event is dropped. PR5 must register it.

`aac_adts` would have made partials playable and was considered and declined, to keep §16's seek
and duration exact. Full reasoning, costs and spec consequences are in the research file and the
map's *Decisions so far*.

Everything below is the question **as originally posed**, kept for the record.

## Question

Graduated from fog by [Can expo-audio record with the screen locked?](02-record-with-the-screen-locked.md), which named the mitigation and placed it at **PR3**, not PR5.

§14 wants audio to survive "unexpected application termination." §3.2 calls the original recording sacred. Research established that the residual risk to an hour-long recording is **OEM vendor process killing** ([expo#40626](https://github.com/expo/expo/issues/40626)) — not Doze, whose documented restrictions are network, wake locks, alarms, Wi-Fi scans, sync adapters and JobScheduler, and not Android 15's 6-hour foreground-service timeout, which applies to `dataSync`/`mediaProcessing` and **not** `microphone`. So the OS will not stop a running recording; a vendor might kill the process.

The mitigation is **incremental write-to-disk**, which is an architectural choice made when recording is built, not a resilience feature bolted on at PR5.

Decide:

1. **One growing file, or rotating segments?** A single file is simpler and matches §24's "unchanged original file where technically possible" export promise. Segments survive a kill more gracefully but turn "the original recording" into a set, which §3.2 and §24 both assume is one thing.
2. **If segments: what happens at export?** Does §24 concatenate on the fly, or does the library hold a stitched file plus its parts? Does a recording killed mid-capture surface in §15's library as a playable partial, or as something flagged?
3. **What does PR5's "state restoration" actually promise?** It cannot mean auto-resume — Android forbids starting a `microphone` foreground service from the background. So it means recover-and-finalise. What does the user see on next launch: a recovered recording, a warning, a choice?
4. **Who owns a stop that JS never saw?** The foreground-service notification's Stop button calls native `stopRecording()` directly, bypassing JS. §11 and §14 must reconcile state on next foreground rather than assume JS witnessed every stop.

**Unblocked 2026-10-07**, and question 1 is now easier than when this was written.
[Which provider ships first?](04-which-provider-ships-first.md) resolved to **AssemblyAI at PR7
and Deepgram at PR8 — both chunk-free at a two-hour recording**, so upload slicing is not required
anywhere in v0.1. The reason to consider segments was that one mechanism might serve both recovery
*and* slicing; **that second purpose is gone**. Segmentation now has to justify itself on
crash-recovery grounds alone, against a single growing file that matches §24's "unchanged original
file where technically possible" export promise and §3.2's assumption that a recording is one
thing. The bar for segments is therefore higher than this ticket originally assumed.

Questions 2, 3 and 4 are unchanged and still need answering — in particular question 4, which is a
correctness problem in PR5 regardless of which way question 1 goes.
