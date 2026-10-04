# How is audio written during capture?

Type: grilling
Status: open
Blocked by: 04
Map: [De-risk v0.1](../map.md)

## Question

Graduated from fog by [Can expo-audio record with the screen locked?](02-record-with-the-screen-locked.md), which named the mitigation and placed it at **PR3**, not PR5.

§14 wants audio to survive "unexpected application termination." §3.2 calls the original recording sacred. Research established that the residual risk to an hour-long recording is **OEM vendor process killing** ([expo#40626](https://github.com/expo/expo/issues/40626)) — not Doze, whose documented restrictions are network, wake locks, alarms, Wi-Fi scans, sync adapters and JobScheduler, and not Android 15's 6-hour foreground-service timeout, which applies to `dataSync`/`mediaProcessing` and **not** `microphone`. So the OS will not stop a running recording; a vendor might kill the process.

The mitigation is **incremental write-to-disk**, which is an architectural choice made when recording is built, not a resilience feature bolted on at PR5.

Decide:

1. **One growing file, or rotating segments?** A single file is simpler and matches §24's "unchanged original file where technically possible" export promise. Segments survive a kill more gracefully but turn "the original recording" into a set, which §3.2 and §24 both assume is one thing.
2. **If segments: what happens at export?** Does §24 concatenate on the fly, or does the library hold a stitched file plus its parts? Does a recording killed mid-capture surface in §15's library as a playable partial, or as something flagged?
3. **What does PR5's "state restoration" actually promise?** It cannot mean auto-resume — Android forbids starting a `microphone` foreground service from the background. So it means recover-and-finalise. What does the user see on next launch: a recovered recording, a warning, a choice?
4. **Who owns a stop that JS never saw?** The foreground-service notification's Stop button calls native `stopRecording()` directly, bypassing JS. §11 and §14 must reconcile state on next foreground rather than assume JS witnessed every stop.

**Blocked for a reason:** resolve [Which provider ships first?](04-which-provider-ships-first.md) first. If a 25 MB provider ships, upload slicing is already required, and segmented capture could serve both recovery *and* slicing with one mechanism — which changes the answer to question 1. Deciding the write strategy before knowing that risks building two segmentation schemes, or the wrong one.
