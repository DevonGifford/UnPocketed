# Running locally

Two ways to run Unpocketed while developing it, and one way to get rid of the USB cable.

New to the project? Work through **[Android development setup](android-setup.md)** first — JDK, Android SDK, udev rules and phone preparation. That is the one-time install; this document is the recurring loop.

Commands below are written out in full (`pnpm expo …`) rather than using the `package.json` script aliases, so they stay correct however those scripts are defined.

---

## 1. On the phone — the real thing

A development build installed on a physical Android device. This is the only way to exercise what Unpocketed actually does.

```bash
pnpm install
pnpm expo run:android
```

The first run takes **10–20 minutes**: it generates `android/`, downloads Gradle and the NDK, and compiles native code. You do not need it again unless native dependencies change.

Day to day, with the development build already installed:

```bash
pnpm expo start
```

That starts Metro alone. Press `a`, or launch Unpocketed from the phone's home screen, and Fast Refresh applies JavaScript changes without a rebuild.

While the phone is plugged in, Expo sets up `adb reverse` so the device reaches Metro back down the USB cable. The phone therefore needs **no network of its own** — a handset on mobile data, or on no data at all, still loads the bundle.

Go back to `pnpm expo run:android` only when you add or change a native dependency, or edit plugin configuration in `app.json`.

> **Expo Go is not sufficient.** Unpocketed needs native modules for audio recording, secure storage and foreground services (§7 of the [spec](spec.md)), so a development build is required.

---

## 2. In a web browser — interface only

> [!WARNING]
> **Browser mode is currently broken** and has been since the move to Uniwind
> (v0.0.2). The app bundles and serves, but React never mounts — the page stays
> blank with `TypeError: Cannot read properties of undefined (reading
> 'default')` in the console.
>
> This is an upstream Uniwind bug, not a configuration mistake:
> [uni-stack/uniwind#704](https://github.com/uni-stack/uniwind/issues/704),
> a circular import when `react-native-web` 0.21.3+ loads the React Native root
> via `InputAccessoryView`. We are on exactly 0.21.3. It has been fixed three
> times upstream (#697, #703, #706) and regressed, and the issue is open.
>
> **Android is unaffected.** Use a device until this clears; re-test by simply
> running the command below once Uniwind updates.

```bash
pnpm expo start --web
```

Serves the app at `http://localhost:8081` through `react-native-web`. No device, no cable, no native build.

**What it is good for, when it works.** Every screen runs on mock fixtures, so layout, design tokens, dark mode and navigation all iterate faster in a browser than on hardware.

**What it will never do.** Web is a development convenience, not a product surface — §6 of the spec lists "a web dashboard" among the explicit non-goals, and a web companion is parked as a future idea rather than planned work. None of the features that define the app have a web implementation:

| Capability | On web |
|---|---|
| Recording (`expo-audio`) | absent |
| Background recording, foreground service | absent |
| API keys in the device keystore | absent |
| Local database | absent |
| File export and the share sheet | absent |

So the useful span of browser testing shrinks as the roadmap advances. Through PR2 it covers nearly everything, because nearly everything is still static. From **PR3**, when real recording lands, screens will render and every control that touches audio will fail.

Treat a browser check as evidence about layout, never about behaviour. Reach for web when the question is "does this screen look right"; reach for the phone when the question is anything else.

---

## 3. Without the cable — wireless ADB

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

## A note on emulators

Deliberately not covered. Development is tested on physical hardware (§7) because recording quality, background behaviour and microphone permissions all differ on an emulator — which is precisely the territory this app lives in. The [setup guide](android-setup.md) installs no emulator package, system image or AVD.

If a screen-size or API-level matrix later makes one worth having, that belongs with the open question on device-testing tooling in the [decision map](../.scratch/v0-1-derisk/map.md), not here.

---

## Troubleshooting

Toolchain and build failures are covered in [Android development setup](android-setup.md#troubleshooting).

**The app shows a connection error on the phone** — first, the dev server is not running, or it stopped along with the terminal that started it; run `pnpm expo start` again. Over USB that is usually the whole story, since `adb reverse` makes the connection independent of any network. Untethered, check instead that the phone is on the same Wi-Fi as the machine and that `adb devices` still lists it.

**`Port 8081 already in use`** — another Metro instance is still alive. Stop it, or use `pnpm expo start --port 8082`.

**A control does nothing in the browser** — expected, if it touches audio, storage or export. See the table in section 2.
