# Chatly (شاتلي) — Architecture, Security & Deployment Guide

## 1. System Architecture
- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4 (complete Arabic RTL & English LTR logical properties, Light/Dark modes, 4 accent palettes), compiling into a static SPA (`dist/`) compatible with Web, Electron, and Capacitor.
- **Shared Core (`src/core/`)**: Pure TypeScript modules shared across Web, Electron Desktop, and Capacitor Android (`config.ts`, `types.ts`, `validation.ts`, `privacy.ts`, `reactions.ts`, `e2ee.ts`, `backupCrypto.ts`, `localAi.ts`, `localization.ts`, `theme.ts`).
- **Cloud Backendless Data Layer (`src/lib/firebase.ts`, `src/services/firestoreService.ts`)**: Firebase Authentication (Google OAuth) + Cloud Firestore (`ai-studio-chatly-b783e8d7-c18e-4d7c-ab5c-ddfb027c083d`) configured directly from `firebase-applet-config.json` with zero runtime environment variables and zero SQL servers.

## 2. Cloud Firestore Collections (`firestore.rules` & `firebase-blueprint.json`)
- `users_public/{uid}`: Public discovery profiles, online presence (`isOnline`, `lastSeenAt`), username/phone searchability, and status.
- `users/{uid}` (plus `sessions`, `notes`, `reminders`, `backups`, `notifications`, `contacts`, `preferences`, `security`): Owner-private profile, device sessions, saved vault, encrypted backup payloads, notification preferences, and SHA-256 PIN lock metadata.
- `user_e2ee_keys/{uid}`: Public ECDH P-256 JWKs for verified 1:1 E2EE negotiation.
- `conversations/{convId}` (plus `members`, `messages`, `polls`, `events`, `tasks`, `locations`, `typing`, `join_requests`): Real-time `onSnapshot` worldwide chat threads, reactions, scheduled messages, live typing indicators, live location shares, and group governance.
- `calls/{callId}` (plus `candidates`): Peer-to-peer WebRTC call records and ICE candidate signaling using Google STUN servers (`stun.l.google.com:19302`, `stun1.l.google.com:19302`).
- `sticker_packs/{packId}` & `stickers/{stickerId}`: Compressed visual frames + recorded/uploaded voice audio persisted directly to Cloud Firestore documents (< 1 MiB safe limit).
- `channels/{channelId}` (plus `posts`, `members`), `stories/{storyId}`, `friend_requests/{reqId}`, `safety_reports/{reportId}`.

## 3. Security & End-to-End Encryption (E2EE)
- **Protocol**: WebCrypto `ECDH` (P-256) key agreement + `HKDF-SHA256` key derivation + `AES-256-GCM` authenticated encryption with unique 96-bit random IV per message.
- **Private Key Storage**: Private keys stay inside browser/device IndexedDB (`chatly_e2ee_keystore`) and are never transmitted to Firestore. Only public JWKs are published in `user_e2ee_keys`.
- **Honest E2EE Scope**: Direct 1:1 messages show the verified E2EE lock badge **only** when `e2eeVerified === true` (both peers registered device keys and E2EE toggle is enabled). Group messages and unencrypted threads use TLS transport encryption (`Standard TLS`) and are labeled accurately.
- **Zero-Trust Firestore Rules**: Enforced via `firestore.rules` (`request.auth.uid == uid`, membership checks on `conversations/{convId}`, immutable caller/callee invariants on `calls/{callId}`).

## 4. Google OAuth External Configuration Checklist
1. Open Firebase Console -> **Authentication** -> **Settings** -> **Authorized domains**.
2. Add your preview and production domains plus `localhost` / custom packaging domain if needed.
3. Ensure **Google** sign-in provider is enabled in Firebase Authentication.
4. No OAuth client secrets are ever stored in frontend code.

## 5. Windows (Electron) & Android (Capacitor) Packaging Instructions
### Windows Desktop (`electron/`)
- Config files: `electron/main.ts` (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`), `electron/preload.ts`, `electron-builder.json` (`nsis` + `portable`).
- Commands:
  1. `npm run build`
  2. `npm run build:electron`
  3. `npm run package:win`

### Android Mobile (`capacitor.config.ts`, `android-manifest-template.xml`)
- Commands:
  1. `npm run build`
  2. `npm i @capacitor/core @capacitor/cli @capacitor/android`
  3. `npx cap add android`
  4. Merge permissions from `android-manifest-template.xml` into `android/app/src/main/AndroidManifest.xml`
  5. `npm run cap:sync && cd android && ./gradlew assembleDebug`
