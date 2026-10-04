# Which Expo SDK ships v0.1?

Type: grilling
Status: open
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
