# QuickChat Native (Capacitor)

The native app is a thin shell around the exact same web app the PWA serves.
One codebase, three surfaces: browser PWA (GitHub Pages), Android APK, and
iOS (when built on a Mac).

## What the native app adds

- **Reminders while fully closed**: `@capacitor/local-notifications` schedules
  OS-level notifications at each follow-up's exact date+time — no server, works
  offline, on Android and iOS. The web paths (Notification API / Periodic
  Background Sync) still run in the PWA and inside the native app as fallback.
- Home-screen icon, splash screen, native app switcher entry.
- App icon and splash are generated from `resources/icon.png` / `resources/splash*.png`.

## Project layout

- `capacitor.config.json` — app id `com.hossamgouda.quickchat`, webDir `www`
- `tools/build_www.py` — assembles `www/` from the same files the service worker
  precaches (always run before `cap sync`)
- `android/` — generated Android project (committed so Android Studio opens it
  directly; build outputs are gitignored)

## Build the Android app

Prerequisites (already on this machine): Android Studio + SDK, its bundled JDK.

```bash
npm install                # once
npm run cap:sync           # build www/ + copy into android/ + update plugins
npm run cap:apk            # gradle assembleDebug -> android/app/build/outputs/apk/debug/app-debug.apk
```

Or open `android/` in Android Studio and press Run.

Install on a phone: copy the APK over, tap it (allow "install unknown apps"),
or `adb install app-debug.apk` with USB debugging.

## Release build (Play Store)

```bash
keytool -genkey -v -keystore quickchat.keystore -alias quickchat -keyalg RSA -keysize 2048 -validity 10000
# android/app/build.gradle: sign with the keystore (or use Android Studio
# Build > Generate Signed Bundle), then:
cd android && gradlew.bat bundleRelease   # .aab for Play Console
```

## iOS

Requires macOS + Xcode + an Apple Developer account ($99/yr) to run on a device:

```bash
npm install @capacitor/ios
npx cap add ios
npx cap sync
npx cap open ios   # on the Mac: set team, then Run
```

Local notifications need no extra entitlements. The PIN lock, sync and offline
behaviour are identical to the PWA.

## After changing the web app

1. `python tools/build_sw.py` (as before — the PWA deploy uses it)
2. `npm run cap:sync`
3. Rebuild the APK or just reload in Android Studio (live reload via
   `npx cap run android -l --external` is also possible).

The CI workflow intentionally does not build the native app (no SDK on the
runner); it guards the web code both surfaces share.
