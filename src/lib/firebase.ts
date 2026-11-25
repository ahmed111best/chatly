import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signOut,
  type UserCredential,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.useDeviceLanguage();

function createPersistentFirestore(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

// Initialize Firestore with the exact named database ID and offline IndexedDB cache persistence.
export const db = createPersistentFirestore();

// Persist Firebase session across browser refreshes, Electron restarts, and Capacitor launches.
export const authPersistenceReady: Promise<void> = setPersistence(
  auth,
  browserLocalPersistence
).catch(() => {
  // Fallback safely if third-party storage is restricted in embedded frames
});

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('email');
googleAuthProvider.addScope('profile');
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
}

export function formatAndLogFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): Error {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return new Error(errInfo.error || 'Firestore request failed.');
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore client is currently offline; using local cache.');
    }
    return false;
  }
}

export async function signInWithGooglePopup(): Promise<UserCredential> {
  await authPersistenceReady;
  return signInWithPopup(auth, googleAuthProvider);
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export { firebaseConfig };
