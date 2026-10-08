# Artwork

The launcher icon and splash screen are still Expo's template art. This is the list of what has to replace them, at what size, and the two colour decisions that come with it.

Everything here is **outstanding** — it is the one part of PR10 left open on purpose, because turning `UnPocketed-Logo.png` into a square mark is a design decision rather than a crop. The logo is a 2048×768 wordmark; at 48dp on a home screen the letters are illegible.

---

## Files to replace

All live in `assets/images/` and are already wired up in `app.json`, so dropping a file in at the right name and size is the whole change. Nothing else references them.

| File | Size | What it is |
|---|---|---|
| `android-icon-foreground.png` | 1024×1024 | The mark itself, on transparency. Android masks this to whatever shape the launcher uses. |
| `android-icon-background.png` | 1024×1024 | What sits behind it. A flat colour is fine and is what `adaptiveIcon.backgroundColor` already does. |
| `android-icon-monochrome.png` | 1024×1024 | Silhouette for Android 13+ themed icons: alpha only, shape carried by opacity, colour ignored. |
| `icon.png` | 1024×1024 | The square fallback, used where there is no adaptive icon. |
| `splash-icon.png` | ≥228 wide | Shown at `imageWidth: 76` dp, so supply it at 3–4× that and let Android scale down. |
| `favicon.png` | 48×48 | Web only, which §6 makes a non-goal. Harmless to leave. |

> [!IMPORTANT]
> **Keep the foreground inside the middle 66%.** Android crops an adaptive icon
> to a circle, a squircle or a rounded square depending on the launcher, so a
> 1024×1024 foreground has roughly a **666px centred safe area**. Anything
> outside it will be cut on some devices and not others.

## The two colour decisions

Both are currently the template's and both are wrong for this app. They are listed together because they want answering at the same time as the artwork.

**`adaptiveIcon.backgroundColor` is `#E6F4FE`** — Expo's pale blue. It has no relationship to the HUD palette the rest of the app uses.

**The splash is `#0B0B0C` in both themes**, including `dark.backgroundColor`. A light-mode user therefore gets a near-black splash opening into a near-white app. The app's own backgrounds are `#F4F8FA` light and `#021018` dark, and the splash plugin takes a separate `dark` block, so the two can differ.

For reference, the tokens in `src/global.css`:

| | Light | Dark |
|---|---|---|
| background | `#F4F8FA` | `#021018` |
| primary | `#107993` | `#49C5E4` |

## After replacing them

The icon and splash are compiled into the native project, so a JavaScript reload will not show them:

```bash
pnpm expo prebuild --platform android --clean
pnpm expo run:android
```

Check the result on a device against a launcher that uses circular icons and one that uses squircles, and open the app from cold in both themes to see the splash.
