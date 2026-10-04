# Android development setup

How to get a local Android toolchain working so you can build and run Unpocketed on a real device.

This is the **local** path. Unpocketed deliberately avoids depending on a cloud build service — §3.1 of the [spec](spec.md) makes local-first a product principle, and it would be odd for the build to need someone else's servers when the app does not. EAS Build remains a valid fallback if you cannot install a toolchain, but nothing here requires it.

You will not write a line of Java or Kotlin. Expo's managed workflow is TypeScript only. The JDK is here purely as a **build tool** — Gradle, which compiles the Android app, runs on it. That distinction trips people up: "I don't write Java" and "I don't need Java installed" are different statements.

---

## What you need

| | | Why |
|---|---|---|
| **OpenJDK 17** | ~424 MB | Gradle runs on it. Expo SDK 57 targets 17 specifically — newer JDKs are not reliably supported by the Android Gradle Plugin. |
| **Android SDK Platform 36** | | Android 16 ("Baklava"), the API level Expo SDK 57 compiles against. |
| **Android SDK Build-Tools** | | Turns compiled code into an APK. |
| **Platform-Tools** | | Provides `adb`, which talks to the device. |
| **udev rules** | tiny | Linux only. Without them your phone shows up but `adb` cannot claim it. |
| **A physical Android device** | | §7 of the spec: development is tested on real hardware. Recording quality, background behaviour and microphone permissions all differ on an emulator. |

Disk: budget roughly **4–6 GB** for the SDK once platforms and build-tools are installed.

---

## 1. Install the JDK and udev rules

Needs root. On Arch / Omarchy:

```bash
sudo pacman -S --needed jdk17-openjdk android-udev
```

<details>
<summary>Other systems</summary>

```bash
# Debian / Ubuntu
sudo apt install openjdk-17-jdk android-sdk-platform-tools-common

# Fedora
sudo dnf install java-17-openjdk-devel

# macOS
brew install --cask temurin@17        # udev rules are Linux-only
```

</details>

Verify:

```bash
java -version      # expect: openjdk version "17.x.x"
```

If you have several JDKs installed, make 17 the default:

```bash
archlinux-java status
sudo archlinux-java set java-17-openjdk
```

---

## 2. Install the Android command-line tools

No root needed. These live entirely in your home directory, which keeps the SDK self-contained and easy to delete.

```bash
mkdir -p ~/Android/Sdk/cmdline-tools
cd /tmp
curl -LO https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip
unzip -q commandlinetools-linux-16111833_latest.zip
mv cmdline-tools ~/Android/Sdk/cmdline-tools/latest
```

The nested `cmdline-tools/latest/` layout is **required** — `sdkmanager` refuses to run from anywhere else.

> Check <https://developer.android.com/studio#command-line-tools-only> for a newer build number. The one above was current at the time of writing.

If you would rather use Android Studio's GUI installer, that works too and puts the SDK in the same place. The command-line route is documented here because it scripts cleanly and installs nothing you do not need.

---

## 3. Set the environment variables

Add to `~/.bashrc` (or your shell's equivalent):

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

Then `source ~/.bashrc` or open a new terminal. Both variable names are set because tooling is inconsistent about which it reads.

---

## 4. Install the SDK packages

```bash
sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.1.0"
```

**Platform 36 is the one that matters** — Expo SDK 57 compiles against Android 16 (API 36). Newer packages exist (platform 37, build-tools 37.0.0) and installing them does no harm, but they are not what this project targets.

### Two things changed recently

**`sdkmanager` is deprecated.** In cmdline-tools 23.0.0 it prints a warning and forwards to the new Android CLI. The commands above still work; the modern equivalent is `android sdk`. Package paths in the new CLI's listings use `/` (`platforms/android-36`) while `sdkmanager` still takes `;` (`platforms;android-36`). Both reach the same package.

**Licences are now accepted on install.** The old `sdkmanager --licenses` ritual, and the Gradle failure that followed forgetting it, no longer applies: installing a package writes `$ANDROID_HOME/licenses/android-sdk-license` for you. If a build ever does complain about licences, that command still exists as a fallback.

---

### What a correct install looks like

```
$ sdkmanager --list_installed
build-tools/36.1.0      36.1.0     Android SDK Build-Tools 36.1
cmdline-tools/latest    23.0.0     Android SDK Command-line Tools (latest)
platform-tools          37.0.1     Android SDK Platform-Tools
platforms/android-36    2.0.0      Android SDK Platform 36
```

About **480 MB** at this point. Gradle and the native build will add several GB more on first build.

---

## 5. Prepare your phone

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

## 6. Build and run

From the repo root:

```bash
pnpm install
pnpm expo run:android
```

The first build downloads Gradle and compiles native code — expect **10–20 minutes**. Later builds are far quicker.

This produces a **development build**, not Expo Go. Unpocketed needs native modules for audio recording, secure storage and foreground services, so Expo Go is not sufficient once real recording lands (§7).

That is the one-time install finished. For the day-to-day loop — running against Metro without rebuilding, testing the interface in a browser, or working untethered over wireless ADB — see **[Running locally](running-locally.md)**.

---

## Troubleshooting

**`sdkmanager: command not found`** — `PATH` is not picking up `cmdline-tools/latest/bin`, or the tools are not in the `latest/` subdirectory. Check `ls ~/Android/Sdk/cmdline-tools/latest/bin`.

**`Unsupported class file major version`** — a JDK other than 17 is in use. Check `java -version` and `echo $JAVA_HOME`.

**`Failed to install the following Android SDK packages as some licences have not been accepted`** — run `sdkmanager --licenses`.

**`adb: no devices/emulators found`** — check the USB interface list (§5) before suspecting the host. Then, in order: is USB debugging on, is **Install via USB** on if this is a Xiaomi, was the authorisation dialog accepted, is the cable a data cable rather than charge-only, and have you logged out since the `usermod`?

**Gradle runs out of memory** — add `org.gradle.jvmargs=-Xmx4g` to `android/gradle.properties`. That file only exists after a prebuild.

---

## Removing it all

The SDK is self-contained, so cleanup is:

```bash
rm -rf ~/Android
sudo pacman -Rns jdk17-openjdk android-udev
```

and delete the `android sdk` block from `~/.bashrc`.
