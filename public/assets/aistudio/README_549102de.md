# Chatly (شاتلي)

**Connect Freely. Communicate Better.**

A premium, secure, next-generation messaging platform for Windows and Android, built with a shared React/TypeScript codebase.

## Project Status: Phase 1 - Foundation ✅

The foundation is complete and working. The application compiles and builds successfully.

### What's Implemented (Phase 1)

- **Project Architecture**: Monorepo with shared backend/frontend/types
- **Backend**: Node.js + Express + TypeScript + PostgreSQL
- **Frontend**: React + TypeScript + Vite
- **Authentication**: Register, login, logout, JWT access/refresh tokens, password hashing (bcrypt), session management
- **Database**: PostgreSQL schema with users, devices, sessions, conversations, messages, privacy settings, folders
- **Shared Types**: TypeScript types shared between frontend and backend
- **UI/UX**: Light/dark theme, RTL/LTR support (Arabic/English), responsive design, original visual identity
- **Desktop**: Electron main process with secure architecture (contextIsolation, no nodeIntegration)
- **Mobile**: Capacitor configuration for Android

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, React Router |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| Real-time | WebSocket (ws) |
| Auth | JWT (access + refresh), bcryptjs |
| Desktop | Electron 28 |
| Mobile | Capacitor |
| Shared | TypeScript types, Zod schemas |

### Project Structure

```
chatly/
├── apps/
│   ├── backend/          # Node.js + Express API + WebSocket
│   ├── web/              # React + Vite frontend (shared)
│   ├── desktop/          # Electron (Windows)
│   └── mobile/           # Capacitor (Android)
├── packages/
│   └── shared/           # Shared TypeScript types
├── database/
│   └── migrations/       # SQL migrations
└── docs/
```

### Quick Start

#### Prerequisites
- Node.js >= 18
- PostgreSQL >= 14

#### Backend Setup

```bash
cd apps/backend
cp .env.example .env
# Edit .env with your database credentials
npm install
npx tsc
# Set up PostgreSQL database
psql -U postgres -c "CREATE DATABASE chatly;"
psql -U postgres -d chatly -f ../../database/migrations/001_initial_schema.sql
npm run dev
```

Backend runs on `http://localhost:4000`

#### Frontend Setup

```bash
cd apps/web
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

#### Desktop (Electron)

```bash
cd apps/desktop
npm install
npm start
```

### API Endpoints (Phase 1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/health` | Health check |

### Roadmap

- **Phase 1** (complete): Foundation, auth, database, basic UI
- **Phase 2**: Core messaging (real-time chats, reactions, replies, media)
- **Phase 3**: Stickers and voice stickers
- **Phase 4**: Advanced features (folders, scheduled messages, privacy)
- **Phase 5**: Groups and communities
- **Phase 6**: End-to-end encryption (Signal Protocol)
- **Phase 7**: Audio and video calling (WebRTC)
- **Phase 8**: Cross-platform packaging (EXE, APK)

### Design Principles

- **Original Identity**: Chatly has its own visual identity, not a copy of WhatsApp or any other platform
- **RTL Support**: Full Arabic (RTL) and English (LTR) support with easy language switching
- **Security First**: Secure defaults, bcrypt password hashing, JWT tokens, context-isolated Electron
- **Shared Codebase**: Maximum code sharing between Windows and Android
- **Open Source**: Self-hostable infrastructure, no paid services required

### License

Private - Chatly is a premium messaging platform.
