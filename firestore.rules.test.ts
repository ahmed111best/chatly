import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesText = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

test('firestore.rules enforces Eight-Pillars baseline protections and zero insecure patterns', () => {
  // Default deny safety net
  assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);

  // Verified user helper & ID validation
  assert.match(rulesText, /function isVerifiedUser\(\)\s*\{\s*return isSignedIn\(\) && request\.auth\.token\.email_verified == true;/);
  assert.match(rulesText, /function isValidId\(id\)/);

  // No unguarded public write or legacy true/true wildcards
  assert.doesNotMatch(rulesText, /allow read, write:\s*if\s*true;/);
  assert.doesNotMatch(rulesText, /allow write:\s*if\s*isSignedIn\(\);/);

  // No get() or exists() inside allow list rules (prevents Firestore list query failure)
  const listRules = rulesText.match(/allow list:[^;]+;/g) || [];
  assert.ok(listRules.length >= 12, 'Expected allow list rules across collections');
  for (const rule of listRules) {
    assert.doesNotMatch(rule, /\bget\(/, `allow list must not call get(): ${rule}`);
    assert.doesNotMatch(rule, /\bexists\(/, `allow list must not call exists(): ${rule}`);
  }

  // Split PII enforced: users_private has no list rule and restricts get to owner
  const privateBlock = rulesText.slice(
    rulesText.indexOf('match /users_private/{uid}'),
    rulesText.indexOf('match /sessions/{sessionId}')
  );
  assert.match(privateBlock, /allow get:\s*if isValidId\(uid\) && isOwner\(uid\);/);
  assert.doesNotMatch(privateBlock, /allow list:/);

  // Channel updates restrict title/description edits to creatorUid
  const channelBlock = rulesText.slice(
    rulesText.indexOf('match /channels/{channelId}'),
    rulesText.indexOf('match /members/{memberUid}', rulesText.indexOf('match /channels/{channelId}'))
  );
  assert.match(channelBlock, /existing\(\)\.creatorUid == request\.auth\.uid/);

  // Timestamp enforcement on creates/updates
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
});

test('firebase-blueprint.json schema entities align with firestore.rules validators', () => {
  assert.ok(blueprint.entities && blueprint.firestore, 'Blueprint must define entities and firestore');
  const requiredEntities = [
    'UserPublicProfile',
    'UserPrivateAccount',
    'DeviceSessionRecord',
    'ContactRelation',
    'ConversationUserMeta',
    'SavedNoteRecord',
    'MessageReminderRecord',
    'EncryptedBackupRecord',
    'NotificationRecord',
    'E2eePublicKeyRecord',
    'ConversationDoc',
    'ConversationMember',
    'ChatMessageDoc',
    'TypingStateDoc',
  ];
  for (const name of requiredEntities) {
    assert.ok(blueprint.entities[name], `Missing blueprint entity: ${name}`);
  }
});
