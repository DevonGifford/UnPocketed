# Device setup

Running Unpocketed on a physical Android handset. This is the only surface that exercises what the app actually does — real microphone, real foreground service, real manufacturer power management — and the one releases are judged on (§7 of the [spec](spec.md)).

Two ways to get it there:

| | What it needs | When you want it |
|---|---|---|
| **Development build** | the local Expo dev server | day-to-day work, with Fast Refresh |
| **Standalone APK** | nothing running on your machine | carrying the app around, or handing it to someone |

For a browser or an emulator instead, see **[Emulator setup](emulator-setup.md)**.

**Prerequisite:** the toolchain in **[Android development setup](android-setup.md)** — JDK 17, the SDK packages, the environment variables and the udev rules.

---

## 1. Prepare the phone

1. **Settings → About phone**, tap the OS version seven times to unlock Developer options. The label is vendor-specific: **MIUI version** on Xiaomi (the bold string, e.g. `14.0.9.0 TKFEUXM`), **Build number** on stock Android.
2. Open Developer options — **Settings → Additional settings → Developer options** on Xiaomi/MIUI, **Settings → System → Developer options** on stock Android — and enable **both**:
   - **USB debugging**.
   - **Install via USB**. Xiaomi only, and the expensive one to miss: `expo run:android` finishes with `adb install`, which MIUI refuses with `INSTALL_FAILED_USER_RESTRICTED` unless this is on. The refusal arrives *after* the full 10–20 minute build, so set it before you start. It may also demand a signed-in Mi account.
3. Set **Default USB configuration** to **File transfer**. Charge-only mode hides the ADB interface on some MIUI builds.
4. Plug the phone in over USB. A dialog asks you to authorise the computer — accept it, and tick "always allow".

On Linux, add yourself to the group the udev rules use, then log out and back in:

```bash
sudo usermod -aG adbusers "$USER"
```

`adbusers` is the group named in `/usr/lib/udev/rules.d/51-android.rules` (`GROUP="adbusers"`), installed by `android-udev`. If you are on a distro that ships different rules, check that file rather than assuming the group name.

Those rules also carry `TAG+="uaccess"`, which makes systemd-logind grant the active local user an ACL on the device node directly. Where that applies the group membership is belt-and-braces rather than load-bearing, so `id -nG` omitting `adbusers` is not on its own an explanation for a device that will not appear — check the ACL with `getfacl /dev/bus/usb/<bus>/<dev>` before chasing it.

Confirm the device is visible:

```bash
adb devices      # expect: <serial>  device
```

`unauthorized` means you have not accepted the on-device dialog.

An **empty list** has two unrelated causes, and the USB descriptors tell them apart before you start changing anything:

```bash
lsusb                                   # find the phone's <vid>:<pid>
lsusb -d <vid>:<pid> -v | grep -E "bNumInterfaces|bInterfaceClass"
```

With USB debugging off the phone exposes a single interface, class 6 (Imaging — MTP/PTP). With it on, a **second interface appears at class ff, subclass 42, protocol 1**: that is ADB. If that interface is absent the fault is on the phone and no amount of udev or group work will fix it — go back to step 2. Only once it is present do the host-side causes (udev rules, group membership, a full logout) become worth investigating.

---

## 2. Development build

```bash
pnpm install
pnpm expo run:android
```

The first run takes **10–20 minutes**: it generates `android/`, downloads Gradle and the NDK, and compiles native code. You do not need it again unless native dependencies change, or you edit plugin configuration in `app.json`.

Day to day, with the development build already installed:

```bash
pnpm expo start
```

That starts Metro alone. Press `a`, or launch Unpocketed from the phone's home screen, and Fast Refresh applies JavaScript changes without a rebuild.

While the phone is plugged in, Expo sets up `adb reverse` so the device reaches Metro back down the USB cable. The phone therefore needs **no network of its own** — a handset on mobile data, or on no data at all, still loads the bundle.

> **Expo Go is not sufficient.** Unpocketed needs native modules for audio recording, secure storage and foreground services (§7), so a development build is required.

### Without the cable — wireless ADB

Real device, real microphone, real foreground service, no USB lead. Worth ten minutes once the tethered loop starts to grate.

On Android 11 and newer:

1. **Developer options → Wireless debugging**, and enable it.
2. Tap **Pair device with pairing code**. Note the IP, port and code it shows.
3. Pair, then connect — the pairing port and the debugging port are different numbers:

   ```bash
   adb pair <ip>:<pairing-port>      # enter the code when prompted
   adb connect <ip>:<debug-port>     # the port under "Wireless debugging"
   ```

Or, starting from a working cable connection:

```bash
adb tcpip 5555
adb connect <phone-ip>:5555
```

Either way, unplug once `adb devices` lists the phone at its IP.

**The prerequisite that catches people:** this is the one mode that genuinely needs phone and machine on the **same network**, and reachable across it. A phone on mobile data cannot be reached, however strong the signal — turn Wi-Fi on first and check that `adb shell ip -4 -br addr` shows a `wlan0` address on the same subnet as the machine. Client isolation or a guest network on the access point will also block it. The link then drops when the phone sleeps deeply or changes network; reconnect with `adb connect`.

---

## 3. Standalone APK

An APK with the bundle inside it, which runs with nothing on your machine at all. The **release** build already does this — **[Releasing](releasing.md)** covers it end to end, §1 for the signing key and §2 for the build:

```bash
→ android/app/build/outputs/apk/release/app-release.apk
```

A release build is **refused** without the signing key rather than falling back to the debug one, because a signature cannot be changed after release. `plugins/with-release-signing.js` turns that trap into a build failure.

What is still **coming later** is the lighter version of this: a bundled build for *testing* on a phone with no dev server and no release signing ceremony. Until then, a release APK from `releasing.md` is the way to carry the app around.

---

## Driving the phone without input injection

`adb shell input` is **blocked on MIUI**, so the usual way of scripting a UI flow does not work on this project's test device. What does work:

- **Deep links** for navigation — the app's scheme is `unpocketed`.
- **`run-as`** to read and write the app's own storage for a debuggable build.
- **Intents** via `adb shell am start` to launch a specific activity.

Anything that genuinely needs a tap — a system file chooser, for one — has to be driven on an [emulator](emulator-setup.md) instead.

Note also that **`adb shell am force-stop` is not a process-kill test for recording.** `MediaRecorder` runs in the media server, not the app process, so the file is still finalised correctly and comes back fully playable. A green run there tells you only that recovery classified a complete file.

---

## Troubleshooting

Toolchain and build failures are covered in [Android development setup](android-setup.md#troubleshooting).

**`adb: no devices/emulators found`** — check the USB interface list in step 1 before suspecting the host. Then, in order: is USB debugging on, is **Install via USB** on if this is a Xiaomi, was the authorisation dialog accepted, is the cable a data cable rather than charge-only, and have you logged out since the `usermod`?

**`INSTALL_FAILED_USER_RESTRICTED`** — **Install via USB** is off in Developer options. Xiaomi only.

**The app shows a connection error on the phone** — first, the dev server is not running, or it stopped along with the terminal that started it; run `pnpm expo start` again. Over USB that is usually the whole story, since `adb reverse` makes the connection independent of any network. Untethered, check instead that the phone is on the same Wi-Fi as the machine and that `adb devices` still lists it.

**`Port 8081 already in use`** — another Metro instance is still alive. Stop it, or use `pnpm expo start --port 8082`.
