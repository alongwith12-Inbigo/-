import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  collection, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Event } from '../types';

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
  }
}

// Check if firebase configuration is completed
const isFirebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

let app;
let db: any = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    
    // Attempt robust persistent local caching. If fail (e.g. blocked in sandboxed iframe), fall back to default
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    } catch (cacheError) {
      console.warn("Firestore persistent cache is not supported in this frame, falling back to default.", cacheError);
      db = getFirestore(app);
    }
  } catch (error) {
    console.warn("Firebase initialization failed. Falling back to Local Storage mode.", error);
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {},
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection to Firestore with a fast 1.5-second timeout
export async function testConnection(): Promise<boolean> {
  if (!db) return false;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), 1500);
    });
    await Promise.race([getDocFromServer(doc(db, 'test', 'connection')), timeoutPromise]);
    return true;
  } catch (error) {
    console.warn("Could not connect to online Firestore.", error);
    return false;
  }
}

// ----------------------------------------------------
// LocalStorage Fallbacks
// ----------------------------------------------------
const LOCAL_STORAGE_KEY = "outdoor_attendance_events";

function getLocalEvents(): Event[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Local storage read failed", e);
    return [];
  }
}

function saveLocalEvents(events: Event[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(events));
  } catch (e) {
    console.error("Local storage write failed", e);
  }
}

// ----------------------------------------------------
// Public Unified Storage API
// ----------------------------------------------------

export async function loadAllEvents(): Promise<{ events: Event[]; isCloudConnected: boolean }> {
  if (!db) {
    return { events: getLocalEvents(), isCloudConnected: false };
  }

  try {
    const eventsCol = collection(db, 'events');
    
    // We race the getDocs call against a 2-second timeout to prevent the app from hanging 
    // when Firestore backend is unreachable (offline-first design).
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore connection timeout")), 2000);
    });
    
    const snapshot = (await Promise.race([getDocs(eventsCol), timeoutPromise])) as any;
    const cloudEvents: Event[] = [];
    
    snapshot.forEach((docSnap: any) => {
      cloudEvents.push(docSnap.data() as Event);
    });

    // Sync cloud data back to local storage for offline support
    if (cloudEvents.length > 0) {
      saveLocalEvents(cloudEvents);
      // Sort by creation or date descending
      cloudEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return { events: cloudEvents, isCloudConnected: true };
    }
    
    // If cloud is empty but local has data, push local data to cloud
    const local = getLocalEvents();
    if (local.length > 0) {
      for (const ev of local) {
        await saveEventToCloudOnly(ev);
      }
    }
    
    local.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { events: local, isCloudConnected: true };
  } catch (error) {
    console.warn("Failed to load events from Firestore, using local backup:", error);
    // Silent fallback to local storage
    const local = getLocalEvents();
    local.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { events: local, isCloudConnected: false };
  }
}

async function saveEventToCloudOnly(event: Event) {
  if (!db) return;
  const path = `events/${event.id}`;
  try {
    await setDoc(doc(db, 'events', event.id), event);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveEvent(event: Event): Promise<boolean> {
  // Always save locally first to guarantee zero data loss
  const local = getLocalEvents();
  const index = local.findIndex((ev) => ev.id === event.id);
  if (index >= 0) {
    local[index] = event;
  } else {
    local.push(event);
  }
  saveLocalEvents(local);

  if (!db) {
    return false; // local only
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore save timeout")), 2000);
    });
    await Promise.race([saveEventToCloudOnly(event), timeoutPromise]);
    return true;
  } catch (error) {
    console.warn("Failed to sync save with cloud, cached locally.", error);
    return false;
  }
}

async function deleteEventFromCloudOnly(id: string) {
  if (!db) return;
  const path = `events/${id}`;
  try {
    await deleteDoc(doc(db, 'events', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteEvent(id: string): Promise<boolean> {
  // Delete locally
  const local = getLocalEvents();
  const filtered = local.filter((ev) => ev.id !== id);
  saveLocalEvents(filtered);

  if (!db) {
    return false;
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore delete timeout")), 2000);
    });
    await Promise.race([deleteEventFromCloudOnly(id), timeoutPromise]);
    return true;
  } catch (error) {
    console.warn("Failed background delete from cloud:", error);
    return false;
  }
}
