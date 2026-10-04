# Which Expo SDK ships v0.1?

Type: grilling
Status: resolved
Map: [De-risk v0.1](../map.md)

## Question

**Take this first.** It gates PR1 — the Expo project cannot be created without it — and it is the only ticket on the map whose answer is needed before a single file exists.

[Can expo-audio record with the screen locked?](02-record-with-the-screen-locked.md) cleared `expo-audio` for §13, but surfaced two live bugs in the current stable release, both sitting in the recording path that §14 says matters more than interface polish. Verified by unpacking the published `expo-audio@57.0.5` tarball:

- **`prepareToRecordAsync` throws `NotificationPermissionsException`** if `POST_NOTIFICATIONS` is denied on Android 13+ ([expo#50705](https://github.com/expo/expo/issues/50705)). A user who declines the notification prompt cannot record at all.
- **`prepareToRecordAsync` can hang forever** — `startBindingTimeout()` is defined but never called ([expo#50706](https://github.com/expo/expo/issues/50706)). No throw, no resolve; the record button just never arms.

Both are fixed only in `58.0.5`. The `sdk-57` branch's `Unpublished` changelog section is empty, so no backport appears to be pending.

Registry state as of 2026-10-04: `expo-audio` `latest` = `57.0.5`, `next` = `58.0.5`.

Decide:

1. **SDK 57 (stable) or SDK 58 (`next`)?** 57 means shipping v0.1 on a release with two known recording-path bugs and writing workarounds for both. 58 means both are fixed upstream, at the cost of building the whole project on a pre-release SDK — for an app whose §3.2 promise is that recordings are never lost.
2. **If 57:** what are the workarounds, and do they hold? The permission throw needs §32 error handling and a request-before-prepare sequence at **PR3**, not PR5. The hang needs a JS-side timeout around `prepareToRecordAsync`, because the library's own never fires.
3. **If 58:** what is the upgrade/downgrade escape route if `next` regresses something else, and does an Expo pre-release SDK block the §38 PR10 Play Store path?
4. Either way: §38 lists no SDK-upgrade step. Is a mid-roadmap SDK bump an accepted event, or is the SDK frozen at PR1 for v0.1?

Note for whoever takes this: these two bugs are *why* this is a decision rather than a lookup. Confirm both issues are still open before deciding — they may have been fixed or backported since 2026-10-04.

## Answer

**SDK 57, with both workarounds. SDK bumps are an accepted but scheduled event, re-evaluated once at PR3.**

Decided 2026-10-04. Registry state at the time: `expo` `latest` = `57.0.26` (2026-09-29), `next` = `58.0.3` (2026-10-03 — three days old).

### 1. Why 57

**The risk is asymmetric.** SDK 57's risk is two bugs that are named, reproduced, bounded and have known fixes. SDK 58's risk is the whole dependency graph — NativeWind, Expo Router, every community package — resolved against a days-old pre-release. For an app whose core promise (§3.2) is that recordings are never lost, known bugs beat unknown ones: a timeout can be written, a peer-dependency break that has not happened yet cannot be pre-empted.

**One of the two "workarounds" is not a workaround.** §13 requires a foreground service, which requires `POST_NOTIFICATIONS` on Android 13+, so the permission must be requested regardless. Requesting it *before* `prepareToRecordAsync` is correct sequencing; [expo#50705](https://github.com/expo/expo/issues/50705) only bites code that had the ordering wrong anyway.

**Recording does not land until PR3.** PR1 and PR2 never touch `expo-audio`, so there is runway before either bug can bite.

### 2. Required at PR3, not PR5

- **Request `POST_NOTIFICATIONS` before `prepareToRecordAsync`.** Handle refusal as a §32 user-facing error — a user who declines the prompt cannot record at all, and the message must say so rather than surfacing the raw exception.
- **Wrap `prepareToRecordAsync` in a JS-side timeout.** [expo#50706](https://github.com/expo/expo/issues/50706) means the library's own `startBindingTimeout()` never fires, so a hang has no upper bound. This is defensive code §14 and §32 want regardless of the bug.

### 3. Upgrade policy

The SDK is **frozen through PR2** while the native environment stabilises, then **re-evaluated once at PR3** — the point at which the two bugs begin to matter. If 58 is stable by then, upgrade (via the `expo-upgrade` path, not by hand-editing versions) before writing recording code; if not, ship the workarounds and revisit at PR10. One scheduled decision point, not a standing invitation to bump.
