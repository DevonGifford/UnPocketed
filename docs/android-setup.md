# Android development setup

How to get a local Android toolchain working so you can build and run Unpocketed — on an emulator, or on a real device.

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
| **Somewhere to run it** | | An emulator or a physical handset. §7 of the spec wants development tested on real hardware — recording quality, background behaviour and microphone permissions all differ on an emulator — but either will build. |

Disk: budget roughly **4–6 GB** for the SDK once platforms and build-tools are installed.

---

## 1. Install the JDK and udev rules

Needs root. The JDK is needed either way; the udev rules only matter for a physical handset, so skip them if you are only ever running an emulator. On Arch / Omarchy:

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
export ANDROID_AVD_HOME="${XDG_CONFIG_HOME:-$HOME/.config}/.android/avd"
```

Then `source ~/.bashrc` or open a new terminal. Both `ANDROID_HOME` and `ANDROID_SDK_ROOT` are set because tooling is inconsistent about which it reads.

`ANDROID_AVD_HOME` is only needed if you want an emulator, but it is cheap to set now and [Emulator setup](emulator-setup.md) explains the trap it avoids. Skip it on macOS, where the default already matches.

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

## 5. Pick a surface

The toolchain is now installed. What you do with it depends on what you are running the app on:

- **[Emulator setup](emulator-setup.md)** — a browser for layout work, or an Android emulator for the full app, both on this machine.
- **[Device setup](device-setup.md)** — a physical handset: phone preparation, the development build, wireless ADB and the standalone APK.

Either way the first build is the same command and the same wait:

```bash
pnpm install
pnpm expo run:android
```

The first run takes **10–20 minutes** — it generates `android/`, downloads Gradle and the NDK, and compiles native code. Later builds are far quicker, and you only need this one again when a native dependency or `app.json` plugin config changes.

This produces a **development build**, not Expo Go. Unpocketed needs native modules for audio recording, secure storage and foreground services, so Expo Go is not sufficient (§7).

---

## Troubleshooting

**`sdkmanager: command not found`** — `PATH` is not picking up `cmdline-tools/latest/bin`, or the tools are not in the `latest/` subdirectory. Check `ls ~/Android/Sdk/cmdline-tools/latest/bin`.

**`Unsupported class file major version`** — a JDK other than 17 is in use. Check `java -version` and `echo $JAVA_HOME`.

**`Failed to install the following Android SDK packages as some licences have not been accepted`** — run `sdkmanager --licenses`.

**A device or emulator that will not connect** — see the troubleshooting section of [Device setup](device-setup.md#troubleshooting) or [Emulator setup](emulator-setup.md#troubleshooting); both are surface-specific rather than toolchain faults.

**Gradle runs out of memory** — add `org.gradle.jvmargs=-Xmx4g` to `android/gradle.properties`. That file only exists after a prebuild.

---

## Removing it all

The SDK is self-contained, so cleanup is:

```bash
rm -rf ~/Android
sudo pacman -Rns jdk17-openjdk android-udev
```

and delete the `android sdk` block from `~/.bashrc`.
