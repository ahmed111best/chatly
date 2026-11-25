# Chatly Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched under `/databases/{database}/documents` is denied for both reads and writes (`match /{document=**} { allow read, write: if false; }`).
2. **Verified Identity**: All writes require `request.auth != null && request.auth.token.email_verified == true`. Author/owner UID fields (`uid`, `ownerUid`, `senderUid`, `creatorUid`, `uploaderUid`, `userUid`, `callerUid`, `reporterUid`) must strictly match `request.auth.uid` on creation and remain immutable on update.
3. **PII Isolation (Split Collection)**:
   - Public directory data in `/users_public/{uid}` never stores `email`, `phoneNumber`, `pinHash`, or private preferences.
   - All PII (`email`, `phoneNumber`, privacy rules, sessions, contacts, notes, reminders, backups, notifications) lives exclusively under `/users_private/{uid}` and is readable/writable ONLY by `request.auth.uid == uid`.
4. **Master Gate & Bounded Lists**:
   - All subcollections under `/conversations/{convId}/...` verify parent membership via `get(/databases/$(database)/documents/conversations/$(convId))` on `get`, `create`, `update`, and `delete`.
   - `allow list` never invokes `get()` or `exists()` and strictly filters using `resource.data` against `request.auth.uid` (`request.auth.uid in resource.data.memberUids`, `resource.data.senderUid == request.auth.uid`, etc.).
   - All arrays (`memberUids`, `reactions`, `starredByUids`, `readByUids`, `viewUids`, `allowedUids`, `participantUids`) have strict `.size() <= MAX` limits.
5. **Path Variable & Payload Hardening**:
   - Every single-document operation validates document IDs via `isValidId(id)` (`^[a-zA-Z0-9_-]+$`, length `1..128`).
   - Every `create` checks `keys().hasAll(...) && keys().hasOnly(...)`; every `update` runs `isValid[Entity](incoming())` and restricts changed keys with `incoming().diff(existing()).affectedKeys().hasOnly(...)`.
   - Every string validates `.size() <= MAX`, and `createdAt` / `updatedAt` timestamps are enforced against `request.time` (`createdAt == existing().createdAt` on update).
   - Terminal states on `friendRequests` (`accepted` / `rejected`) and `calls` (`ended` / `declined` / `missed`) lock against further mutations.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: `request.auth = null` attempting `get /conversations/dm_1_2`.
2. **Unverified Email Write**: `request.auth.token.email_verified = false` creating `/users_public/u1`.
3. **PII Cross-User Read**: User `u2` attempting `get /users_private/u1`.
4. **Owner Spoofing**: User `u2` creating `/users_private/u1/savedNotes/n1` with `uid: "u1"`.
5. **Shadow / Ghost Field Injection**: User `u1` updating `/users_public/u1` with an extra `{ isVerifiedAdmin: true }` field.
6. **ID Poisoning**: User `u1` creating `/conversations/bad..id$1500chars...` exceeding 128 chars or invalid regex.
7. **Oversized String Exhaustion**: User `u1` sending a message with `body.size() == 20000` (> 8000 limit) or `media.dataUrl.size() == 990000` (> 850000 limit).
8. **Client Timestamp Forgery**: User `u1` creating a message with `createdAt` backdated instead of `request.time`.
9. **Immutable Field Tampering**: User `u1` updating a message to change `senderUid`, `conversationId`, or `createdAt`.
10. **Unauthorized Non-Member Message Read/Write**: User `u3` listing or creating `/conversations/dm_u1_u2/messages`.
11. **Terminal State Re-opening**: User `u1` updating a `friendRequest` from `status: "accepted"` back to `"pending"` or updating a `call` from `status: "ended"` back to `"active"`.
12. **Blanket List Query Scraping**: User `u3` running `list /friendRequests` or `list /calls` or `list /conversations` without matching `request.auth.uid` in `resource.data`.
