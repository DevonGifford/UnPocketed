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
sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.0.0"
sdkmanager --licenses      # accept each prompt
```

Licence acceptance is mandatory — Gradle fails the build without it, with an error that does not obviously say so.

---

## 5. Prepare your phone

1. **Settings → About phone**, tap **Build number** seven times to unlock Developer options.
2. **Settings → System → Developer options**, enable **USB debugging**.
3. Plug the phone in over USB. A dialog asks you to authorise the computer — accept it, and tick "always allow".

On Linux, add yourself to the group the udev rules use, then log out and back in:

```bash
sudo usermod -aG adbusers "$USER"
```

Confirm the device is visible:

```bash
adb devices      # expect: <serial>  device
```

`unauthorized` means you have not accepted the on-device dialog. An empty list usually means the udev rules or group membership have not taken effect yet — a full logout is genuinely required, not just a new terminal.

---

## 6. Build and run

From the repo root:

```bash
pnpm install
pnpm expo run:android
```

The first build downloads Gradle and compiles native code — expect **10–20 minutes**. Later builds are far quicker.

This produces a **development build**, not Expo Go. Unpocketed needs native modules for audio recording, secure storage and foreground services, so Expo Go is not sufficient once real recording lands (§7).

---

## Troubleshooting

**`sdkmanager: command not found`** — `PATH` is not picking up `cmdline-tools/latest/bin`, or the tools are not in the `latest/` subdirectory. Check `ls ~/Android/Sdk/cmdline-tools/latest/bin`.

**`Unsupported class file major version`** — a JDK other than 17 is in use. Check `java -version` and `echo $JAVA_HOME`.

**`Failed to install the following Android SDK packages as some licences have not been accepted`** — run `sdkmanager --licenses`.

**`adb: no devices/emulators found`** — in order: is USB debugging on, was the authorisation dialog accepted, is the cable a data cable rather than charge-only, and have you logged out since the `usermod`?

**Gradle runs out of memory** — add `org.gradle.jvmargs=-Xmx4g` to `android/gradle.properties`. That file only exists after a prebuild.

---

## Removing it all

The SDK is self-contained, so cleanup is:

```bash
rm -rf ~/Android
sudo pacman -Rns jdk17-openjdk android-udev
```

and delete the `android sdk` block from `~/.bashrc`.
