# Building Kazi Agent for Android (.apk)

## Prerequisites
1. [Node.js 18+](https://nodejs.org)
2. [Android Studio](https://developer.android.com/studio) (includes Android SDK & JDK)
3. Java 17+ in your PATH

---

## Steps

### 1 — Install Capacitor
```bash
cd android-app
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/splash-screen @capacitor/status-bar
```

### 2 — Initialise & add Android platform
```bash
npx cap init "Kazi Agent" com.kazi.agent.mobile --web-dir .
npx cap add android
```

### 3 — Sync web assets into Android project
```bash
npx cap sync android
```

### 4 — Open in Android Studio (GUI build)
```bash
npx cap open android
```
Then in Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**
The APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`

### 5 — (Optional) Release / signed APK
1. Generate a keystore: `keytool -genkey -v -keystore kazi.jks -keyalg RSA -keysize 2048 -validity 10000 -alias kazi`
2. In Android Studio: **Build → Generate Signed Bundle/APK**
3. Select APK, fill keystore details, build **release** variant.

---

## Hot reload (development)
```bash
npx cap run android --live-reload
```

---

## Notes
- The mobile app talks **directly to the Gemini API** — no desktop process needed.
- Desktop automation (screen control) is only available in the Windows/macOS/Linux app.
- Each user enters their own API key in the mobile app Settings.
- Data (accounts, chat history, API keys) are stored in the device's localStorage — never sent to any server.

## Minimum Android version
Android 7.0 (API 24) — set in `android/app/build.gradle` as `minSdkVersion 24`.
