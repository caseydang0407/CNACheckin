import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'] as const;

const app = initializeApp(firebaseConfig);

const FIRESTORE_DATABASE_ID =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-cnaunioncheckinc-e5edd97e-f5b0-4b64-acb8-08a390b0e68f';

export const db = getFirestore(app, FIRESTORE_DATABASE_ID);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  googleProvider.addScope(scope);
}
googleProvider.setCustomParameters({ prompt: 'select_account' });

// In-memory only cache for Google Workspace OAuth access token (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

function notifyTokenListeners(token: string | null): void {
  for (const listener of tokenListeners) {
    listener(token);
  }
}

export function getGoogleAccessToken(): string | null {
  return cachedAccessToken;
}

export function subscribeGoogleAccessToken(listener: (token: string | null) => void): () => void {
  tokenListeners.add(listener);
  listener(cachedAccessToken);
  return () => {
    tokenListeners.delete(listener);
  };
}

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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

// Clear in-memory Google access token whenever user signs out
onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedAccessToken = null;
    notifyTokenListeners(null);
  }
});

export async function signInWithGoogle(): Promise<{ user: User; accessToken: string | null }> {
  const cred = await signInWithPopup(auth, googleProvider);
  const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
  cachedAccessToken = oauthCred?.accessToken ?? null;
  notifyTokenListeners(cachedAccessToken);
  return { user: cred.user, accessToken: cachedAccessToken };
}

export async function signOutFirebase(): Promise<void> {
  cachedAccessToken = null;
  notifyTokenListeners(null);
  await signOut(auth);
}

export { onAuthStateChanged, type User };
