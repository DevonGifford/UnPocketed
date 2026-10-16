# Emulator setup

Running Unpocketed on your own machine: in a **browser** for layout work, or on an **Android emulator** for the app itself. For a physical handset, see **[Device setup](device-setup.md)**.

| | What it needs | What it gives you |
|---|---|---|
| **Browser** | nothing beyond `pnpm install` | layout, design tokens, dark mode, navigation |
| **Emulator** | the [Android toolchain](android-setup.md), plus an AVD | the real native app — and `adb shell input` |

Commands below are written out in full (`pnpm expo …`) rather than using the `package.json` script aliases, so they stay correct however those scripts are defined.

---

## In a browser — interface only

No toolchain, no SDK, no device. A clean checkout is enough:

```bash
pnpm install
pnpm expo start --web
```

Serves the app at `http://localhost:8081` through `react-native-web`.

**What it is good for.** Layout, design tokens, dark mode and navigation all iterate faster in a browser than on hardware, with Fast Refresh and no cable.

**The library is always empty.** Web has no file system, so `listPersistedRecordings`, `listPersistedTranscripts` and `listPersistedBriefs` return nothing there rather than throwing — the guard is an explicit `Platform.OS === "web"` check, not a `try`/`catch`, so a genuine read failure on Android still surfaces (§3.2). The practical consequence: **the list screens render but the detail screens cannot be reached**, because there is nothing to open.

**What it will never do.** Web is a development convenience, not a product surface — §6 of the spec lists "a web dashboard" among the explicit non-goals. None of the features that define the app have a web implementation:

| Capability | On web |
|---|---|
| Recording (`expo-audio`) | absent |
| Background recording, foreground service | absent |
| API keys in the device keystore | absent |
| Local database | absent |
| File export and the share sheet | absent |
| Importing a file (`expo-document-picker`) | chooser opens, copy fails |

Import is the one row with a trap in it: `expo-document-picker` ships a web implementation, so the file chooser really does open and a file really is picked. Everything after that — copying into managed storage, writing the sidecar, indexing the row — needs `expo-file-system` and `expo-sqlite`, so the import fails after the part you can see succeeding. A browser check will tell you the button is wired up and nothing more.

The useful span of browser testing therefore shrinks as the roadmap advances. Treat it as evidence about layout, never about behaviour: reach for web when the question is "does this screen look right", and for the emulator when it is anything else.

> [!NOTE]
> Browser mode was broken from the move to Uniwind until 2026-10-08 (`53057b7`), by three stacked faults: uniwind [#704](https://github.com/uni-stack/uniwind/issues/704), fixed in 1.12.2; `wasm` missing from Metro's `assetExts`, so `expo-sqlite`'s worker chunk was never emitted; and `web.output: "static"`, which dragged that worker into the dev server's serializer. The last two are web-only paths, but the Uniwind bump touches the native styling engine and **has not been checked on a device**.

---

## On an emulator — the full app, locally

An AVD runs the real native app: real file system, real SQLite, real `expo-audio`. It is the fastest surface that still behaves like the product, and the only one where **`adb shell input` works** — MIUI refuses injected input on the test phone, so a flow that needs a tap can only be scripted here.

**Prerequisite:** the toolchain in **[Android development setup](android-setup.md)** — JDK 17, the SDK packages and the environment variables, including `ANDROID_AVD_HOME`.

### 1. Create an AVD

Android Studio owns this; the command-line tools can do it but the wizard is less work.

```bash
yay -S android-studio        # Arch / Omarchy; other systems, use the installer
android-studio               # Standard setup, then the device manager
```

A **Google Play x86_64** image is the right default. A Play image keeps `adb root` out of reach, but `run-as` still works for a debuggable build, which is all the device recipes here need.

### 2. Check KVM

Without hardware acceleration an emulator is unusably slow:

```bash
emulator -accel-check         # expect: KVM ... is installed and usable
```

If it complains, the usual causes are virtualisation disabled in firmware, or your user not being in the `kvm` group.

### 3. The AVD visibility trap

Android Studio and `avdmanager` honour `XDG_CONFIG_HOME` and write AVDs to `~/.config/.android/avd`; the `emulator` binary ignores it and looks in `~/.android/avd`. Without `ANDROID_AVD_HOME`, a device Studio created and lists quite happily does not exist as far as the command line is concerned:

```
$ emulator @Pixel_10
ERROR | Unknown AVD name [Pixel_10], use -list-avds to see valid list.
ERROR | HOME is defined but there is no file Pixel_10.ini in $HOME/.android/avd
```

`emulator -list-avds` comes back empty for the same reason, and that is the call Expo shells out to (`listAvdsAsync` in `@expo/cli`) when it needs to *start* a device. So `pnpm expo run:android` with nothing already booted fails with **"No Android connected device found, and no emulators could be started automatically"**. Boot the emulator from Android Studio first and `adb` reports it like any other device, so Expo finds it and the whole problem hides — which is what makes it worth writing down.

[Section 3 of the setup guide](android-setup.md#3-set-the-environment-variables) has the export. `ANDROID_USER_HOME` is not a substitute; only `ANDROID_AVD_HOME`, pointing at the `avd` directory itself, works.

### 4. Run

```bash
emulator -list-avds
emulator @<a-name-from-that-list> &
pnpm expo run:android
```

The first build takes **10–20 minutes** — Gradle, the NDK, and native compilation. After that, `pnpm expo start` and Fast Refresh are the loop, and `pnpm expo run:android` is only needed again when a native dependency or `app.json` plugin config changes.

Pressing `a` in `pnpm expo start` from cold works too, with a catch worth knowing. With nothing booted Expo takes the **first** AVD `emulator -list-avds` prints rather than asking, spawns `emulator @<name>` itself, and waits up to three minutes for the boot animation to finish. Press **`shift+a`** to choose a device instead — lowercase `a` never prompts. Booting the one you want yourself is the simplest answer, and it keeps the device alive across Metro restarts.

### What an emulator cannot settle

Recording quality, background behaviour and microphone permissions all differ from hardware — which is precisely the territory this app lives in. The microphone is host audio, so §12's comparison against the stock recorder stays on the phone, as does anything involving the manufacturer's own power management. Drive the app on the emulator; judge it on the device (§7 of the [spec](spec.md)).

Whether this makes a Maestro or Detox suite worth having for v0.1 is still open — it sits with the device-testing question in the [decision map](../.scratch/v0-1-derisk/map.md).

---

## Troubleshooting

Toolchain and build failures are covered in [Android development setup](android-setup.md#troubleshooting).

**`No Android connected device found, and no emulators could be started automatically`, with an AVD that Android Studio can see** — `emulator -list-avds` is looking in the wrong directory. See the AVD visibility trap above.

**`Port 8081 already in use`** — another Metro instance is still alive. Stop it, or use `pnpm expo start --port 8082`.

**A control does nothing in the browser** — expected, if it touches audio, storage or export. See the capability table above.
