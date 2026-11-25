# Chatly Architecture Document

## 1. Overview

Chatly is a premium, secure, next-generation messaging platform with a shared codebase for Windows (Electron) and Android (Capacitor). The frontend is built with React + TypeScript + Vite, and the backend is Node.js + Express + TypeScript with PostgreSQL.

## 2. High-Level Architecture

```
┌─────────────────┐     HTTPS/WSS      ┌──────────────────┐
│   Windows       │                    │    Android       │
│   (Electron)    │◄───────────────────►│  (Capacitor)   │
│   React + TS    │                    │  React + TS      │
└─────────────────┘                    └──────────────────┘
         │                                       │
         └───────────────┬───────────────────────┘
                         │ HTTPS/WSS
                         ▼
              ┌──────────────────┐
              │  Chatly Backend  │
              │  Node.js + TS    │
              │  Express + WS    │
              └────────┬─────────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
      ┌──────────┐        ┌────────────┐
      │ PostgreSQL│        │  Media     │
      │  (Primary)│        │  Storage   │
      └──────────┘        └────────────┘
```

## 3. Technology Decisions

### 3.1 Monorepo Structure
A single monorepo with workspaces enables maximum code sharing:
- `packages/shared` - TypeScript types, Zod schemas, API contracts
- `apps/web` - React frontend (runs in Electron webview and Capacitor webview)
- `apps/backend` - Express API + WebSocket server
- `apps/desktop` - Electron main process
- `apps/mobile` - Capacitor configuration

### 3.2 Backend
- **Express.js** - REST API framework
- **ws** - WebSocket server for real-time messaging
- **pg** - PostgreSQL client
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT access/refresh tokens
- **helmet** - Security headers
- **express-rate-limit** - Rate limiting
- **cors** - Cross-origin resource sharing

### 3.3 Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **CSS Variables** - Theming (light/dark, RTL/LTR)

### 3.4 Database (PostgreSQL)
Tables:
- `users` - Account information
- `devices` - Multi-device tracking
- `sessions` - Session management with refresh tokens
- `email_verifications` - Email verification tokens
- `password_resets` - Password reset tokens
- `conversations` - Direct and group conversations
- `conversation_members` - Conversation participants
- `messages` - All messages (text, media, stickers, etc.)
- `message_reactions` - Emoji reactions
- `user_privacy_settings` - Privacy controls per user
- `conversation_folders` - Smart folders

## 4. Security Architecture

### 4.1 Authentication
- Passwords hashed with bcrypt (12 salt rounds)
- JWT access tokens (15 min expiry) + refresh tokens (7 day expiry)
- Refresh tokens stored hashed in database
- Session revocation on logout
- Rate limiting on auth endpoints (100 req/15min)

### 4.2 Electron Security
- `contextIsolation: true` - Isolated preload script
- `nodeIntegration: false` - No Node.js in renderer
- `webSecurity: true` - Same-origin policy enforced
- ContextBridge API for secure IPC communication

### 4.3 End-to-End Encryption (Phase 6)
Planned implementation using the Signal Protocol (libsignal-protocol-typescript or similar audited implementation). Never implementing custom cryptography.

## 5. Database Schema

See `database/migrations/001_initial_schema.sql` for the complete schema.

Key design decisions:
- UUID primary keys for all tables
- `updated_at` triggers for automatic timestamping
- Indexes on frequently queried columns (conversation_id, sender_id, created_at)
- Foreign key cascading deletes for data integrity

## 6. API Design

REST API at `/api` with WebSocket at `/ws`.

### Authentication Flow
1. Register → returns accessToken + refreshToken
2. Login → returns accessToken + refreshToken
3. Access token expires in 15 min → use refresh token to get new access token
4. Logout → revokes all sessions

### WebSocket Events
- `message.new` - New message received
- `message.read` - Message read receipt
- `typing.start/stop` - Typing indicators
- `presence.change` - Online/offline status
- `delivery.status` - Message delivery status

## 7. UI/UX Design

### Visual Identity
- **Primary Color**: Indigo (#6366f1) - Chatly's brand color
- **Secondary**: Pink (#ec4899)
- **Typography**: System fonts with Arabic fallback
- **Theme**: CSS variables for light/dark mode
- **Direction**: `dir` attribute for RTL/LTR switching
- **Language**: `localStorage` persistence for language preference

### Components
- Card-based layout
- Smooth transitions (150-350ms)
- Custom scrollbars
- Loading skeletons and empty states
- Responsive sidebar navigation

## 8. Development Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | Foundation (auth, DB, UI) | ✅ Complete |
| 2 | Core Messaging | 📋 Planned |
| 3 | Stickers & Voice Stickers | 📋 Planned |
| 4 | Advanced Features | 📋 Planned |
| 5 | Groups & Communities | 📋 Planned |
| 6 | End-to-End Encryption | 📋 Planned |
| 7 | Audio/Video Calling | 📋 Planned |
| 8 | Packaging (EXE, APK) | 📋 Planned |

## 9. Infrastructure Costs

All infrastructure is self-hostable and open-source:
- **PostgreSQL**: Free, self-hosted
- **Media Storage**: Local filesystem or S3-compatible (MinIO)
- **Push Notifications**: Self-hosted or Firebase FCM (free tier)
- **No paid services required** for deployment

Potential costs:
- VPS/Server: $5-50/month depending on scale
- Storage: Depends on media volume
- Bandwidth: Depends on usage

## 10. Technical Risks

| Risk | Mitigation |
|------|-----------|
| End-to-end encryption complexity | Use Signal Protocol library, not custom crypto |
| WebRTC calling | Implement in Phase 7 as separate milestone |
| Media storage costs | Document costs, use object storage with lifecycle policies |
| Multi-device sync | Centralized server as source of truth, conflict resolution |
| Mobile push notifications | Capacitor plugins + FCM/APNS |

