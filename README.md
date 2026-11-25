# Chatly — شاتلي

**Chatly (شاتلي)** is a bilingual (Arabic RTL / English LTR), privacy-first real-time messaging platform built on **Firebase Authentication (Google Sign-In)** and **Cloud Firestore** with a shared TypeScript core across **Web**, **Windows Desktop (Electron)**, and **Android (Capacitor)**.

---

## Architecture Overview

| Layer | Location | Responsibility |
| --- | --- | --- |
| **React Frontend** | `src/App.tsx`, `src/components/`, `src/services/`, `src/lib/firebase.ts`, `vite.config.ts` | UI rendering, IndexedDB E2EE key management (`WebCrypto ECDH P-256 + AES-256-GCM`), client-side encrypted backups, Firebase Google OAuth sign-in, and static SPA bundle (`dist/`) |
| **Firebase Auth & Cloud Firestore** | `firebase-applet-config.json`, `firestore.rules`, `src/services/firestoreService.ts` | Worldwide real-time `onSnapshot` sync for conversations, messages, reactions, typing/online presence, live location, WebRTC call signaling, voice stickers, stories, groups, channels, and notifications |
| **Shared Core** | `src/core/` | Pure TypeScript modules shared by Web, Electron, and Android (`config.ts`, `types.ts`, `validation.ts`, `privacy.ts`, `reactions.ts`, `e2ee.ts`, `backupCrypto.ts`, `localAi.ts`, `features.ts`, `localization.ts`, `theme.ts`) |
| **Windows Shell** | `electron/` (`main.ts`, `preload.ts`, `tsconfig.json`), `electron-builder.json` | Context-isolated Electron wrapper loading `dist/index.html` in production |
| **Android Shell** | `capacitor.config.ts`, `android-manifest-template.xml` | Capacitor Android WebView container wrapping `dist/` |

---

## Prerequisites

- **Node.js** `>= 22.14` (recommended `v22 LTS` or newer) and **npm**
- **Firebase Project** configured in `firebase-applet-config.json` with **Google Sign-In** enabled in Firebase Authentication and **Cloud Firestore** rules (`firestore.rules`) deployed (zero `.env` variables required)
- **Windows Packaging (optional)**: Windows host (or Wine/NSIS toolchain) + `electron` and `electron-builder`
- **Android Packaging (optional)**: JDK 17+, Android Studio / Android SDK, and `@capacitor/*` packages

---

## Installed Dependencies

### Runtime (`dependencies`)
- **Frontend & Firebase**: `react`, `react-dom`, `lucide-react`, `motion`, `qrcode`, `firebase`
- **Build & Styling**: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`

### Development (`devDependencies`)
- `typescript`, `tsx`, `autoprefixer`
- `@types/node`, `@types/react`, `@types/react-dom`, `@types/qrcode`

### Optional Platform Packaging Dependencies (install only on packaging workstation)
- **Windows Electron**: `npm i -D electron electron-builder`
- **Android Capacitor**: `npm i @capacitor/core @capacitor/android && npm i -D @capacitor/cli`

---

## Exact Commands

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Unit Tests & Type Check
```bash
npm test
npm run lint
```

### 3. Run Development Server (Port `3000`)
```bash
npm run dev
```

### 4. Build & Preview Production Web App (`dist/`)
```bash
npm run build
npm run preview
```

---

## Cross-Platform Packaging

### Windows Desktop (Electron)
1. Install Electron packaging tools if not already installed:
   ```bash
   npm install -D electron electron-builder
   ```
2. Build the static frontend (`dist/`), compile Electron main/preload scripts, and package NSIS + Portable `.exe`:
   ```bash
   npm run package:win
   ```
   Output installers are generated in `release/`.

### Android Mobile (Capacitor)
1. Install Capacitor packages if not already installed:
   ```bash
   npm install @capacitor/core @capacitor/android
   npm install -D @capacitor/cli
   ```
2. Initialize the Android project once and merge permissions from `android-manifest-template.xml` into `android/app/src/main/AndroidManifest.xml`:
   ```bash
   npx cap add android
   ```
3. Build `dist/` and sync to Android:
   ```bash
   npm run cap:sync
   ```
4. Build APK / App Bundle in Android Studio (`npx cap open android`) or Gradle:
   ```bash
   cd android && ./gradlew assembleDebug
   ```
