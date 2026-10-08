# Releasing

How a signed Unpocketed build is produced. Everything here runs on your own machine — there is no build service in the loop, which is the same reason there is no Unpocketed server (§6).

Prerequisites are the ones in **[Android development setup](android-setup.md)**: a JDK, the Android SDK, and `pnpm install` already run.

Commands are written out in full rather than using `package.json` aliases, so they stay correct however those scripts are defined.

---

## 1. One time — the signing key

A release build is refused until this exists. The build does **not** fall back to the debug key: an app's signature cannot be changed after release, so anyone who installed a debug-signed APK would have to uninstall — losing their recordings — before a properly signed update would go on. `plugins/with-release-signing.js` turns that trap into a build failure.

Generate a key:

```bash
keytool -genkeypair -v \
  -keystore ~/keys/unpocketed-release.jks \
  -storetype PKCS12 \
  -alias unpocketed \
  -keyalg RSA -keysize 4096 \
  -validity 10000
```

Then tell Gradle where it is, in `keystore.properties` at the **repository root**:

```properties
storeFile=/home/you/keys/unpocketed-release.jks
storePassword=…
keyAlias=unpocketed
keyPassword=…
```

> [!CAUTION]
> **Back the keystore up, offline, before you ship anything signed with it.**
> Lose it and the application can never be updated again — not on Play, not by
> sideload. A new key is a new app, and every existing install is stranded.
> Keep the passwords somewhere that survives the machine.

The repository root, not `android/`: step 2 below starts with `expo prebuild --clean`, which **deletes that directory**, so a properties file kept inside it would be destroyed by the first step of every build. `keystore.properties` is gitignored, and `storeFile` is an absolute path so the `.jks` itself lives outside the repository entirely.

---

## 2. Build

`android/` is generated, not checked in, so regenerate it first. This is also what applies any change to `app.json` or to a config plugin.

```bash
pnpm expo prebuild --platform android --clean
```

**APK**, for the GitHub release and for sideloading:

```bash
cd android && ./gradlew assembleRelease
```

→ `android/app/build/outputs/apk/release/app-release.apk`

**AAB**, for Play:

```bash
cd android && ./gradlew bundleRelease
```

→ `android/app/build/outputs/bundle/release/app-release.aab`

---

## 3. Check what you built

Confirm it is signed with the release key and not the debug one:

```bash
"$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)/apksigner" verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

The certificate's DN must be yours. `CN=Android Debug, OU=Android, O=Android` means the guard was bypassed and the artifact must not be published.

Check what the APK actually asks for, which is the **merged** manifest rather than the one prebuild writes:

```bash
cd android && ./gradlew :app:processReleaseManifest
grep -oE 'android:name="android.permission[^"]*"' \
  android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml | sort -u
```

Expect one foreground service (`microphone`) and no `SYSTEM_ALERT_WINDOW`, `VIBRATE` or `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. Four entries come from libraries rather than from `app.json` and cannot be read as choices: `ACCESS_NETWORK_STATE`, `WAKE_LOCK`, and `USE_BIOMETRIC`/`USE_FINGERPRINT` from `expo-secure-store`. All four are normal permissions with no runtime prompt, and they still appear in a Play listing.

Then install it on a device that has never had a development build, and walk §39's four promises: record, keep, transcribe, export. The release build is minified and uses a different JS bundle from the one you develop against, so this is not a formality.

---

## 4. Versions

`app.json` holds both:

- `expo.version` — `0.1.0`, what a user sees;
- `expo.android.versionCode` — an integer Play orders upgrades by.

**`versionCode` must increase for every artifact that leaves this machine**, including a re-upload of the same version after a fix. Play rejects a repeat, and a device will not install over an equal or higher code.

---

## 5. Publishing

> **Pull requests and releases are Devon's.** This document stops at a verified
> artifact on disk.

### GitHub

Attach `app-release.apk` to a tagged release. Note the SHA-256 so a stranger can check what they downloaded:

```bash
sha256sum android/app/build/outputs/apk/release/app-release.apk
```

### Play

Three things the Console asks for that this app's shape makes non-obvious:

**Foreground service declaration.** The manifest declares one — `microphone`, for §13's background recording. Play wants a written use case and a short video showing it. There is deliberately no second declaration: `enableBackgroundPlayback` is `false`, because the `mediaPlayback` service it adds backed no working capability. See the decision map.

**Data safety.** Audio and transcripts are collected on the device. They are transmitted only when the user asks for cloud transcription or enrichment, which is the user-initiated transfer Play's form treats separately from ongoing sharing. The app has no analytics and no account.

**Privacy policy URL.** Mandatory. Point it at [`PRIVACY.md`](../PRIVACY.md) in this repository.

> [!IMPORTANT]
> If you enrol in **Play App Signing**, upload *this* keystore as the app
> signing key rather than letting Google generate one. Otherwise the Play build
> and the GitHub APK carry different signatures, and a user who has one cannot
> install the other without uninstalling first.
