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
  getDocFromServer,
  onSnapshot
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
    
    // Attempt robust persistent local caching with custom databaseId.
    // If fail (e.g. blocked in sandboxed iframe), fall back to default
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      }, firebaseConfig.firestoreDatabaseId);
    } catch (cacheError) {
      console.warn("Firestore persistent cache is not supported in this frame, falling back to default.", cacheError);
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
    const cloudIds = new Set<string>();
    
    snapshot.forEach((docSnap: any) => {
      const data = docSnap.data() as Event;
      cloudEvents.push(data);
      cloudIds.add(data.id);
    });

    let deletedIds: string[] = [];
    try {
      const d = localStorage.getItem("deleted_event_ids");
      if (d) deletedIds = JSON.parse(d);
    } catch (e) {}
    const deletedSet = new Set(deletedIds);

    const local = getLocalEvents();
    const mergedEvents = [...cloudEvents];

    // If local has events not present in cloud and not explicitly deleted, auto-upload to Firestore
    for (const localEv of local) {
      if (!cloudIds.has(localEv.id) && !deletedSet.has(localEv.id)) {
        await saveEventToCloudOnly(localEv);
        mergedEvents.push(localEv);
      }
    }

    mergedEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    saveLocalEvents(mergedEvents);
    return { events: mergedEvents, isCloudConnected: true };
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
  // Always remove from local deleted_event_ids tracker if re-saved
  try {
    const d = localStorage.getItem("deleted_event_ids");
    if (d) {
      let deletedIds: string[] = JSON.parse(d);
      if (deletedIds.includes(event.id)) {
        deletedIds = deletedIds.filter(id => id !== event.id);
        localStorage.setItem("deleted_event_ids", JSON.stringify(deletedIds));
      }
    }
  } catch (e) {}

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
  // Add to local deleted_event_ids tracker to prevent re-syncing from local list
  try {
    const d = localStorage.getItem("deleted_event_ids");
    const deletedIds: string[] = d ? JSON.parse(d) : [];
    if (!deletedIds.includes(id)) {
      deletedIds.push(id);
      localStorage.setItem("deleted_event_ids", JSON.stringify(deletedIds));
    }
  } catch (e) {}

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

// ----------------------------------------------------
// Default Roster Sync APIs (No Device Lock, Shared Across All Sessions)
// ----------------------------------------------------
import { Student as RosterStudent } from '../types';

export async function loadDefaultRoster(): Promise<{ roster: RosterStudent[]; isCloudConnected: boolean }> {
  try {
    const localSaved = localStorage.getItem("default_student_roster");
    let localRoster: RosterStudent[] = localSaved ? JSON.parse(localSaved) : [];

    if (!db) {
      return { roster: localRoster, isCloudConnected: false };
    }

    const docRef = doc(db, 'rosters', 'default');
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore connection timeout")), 2000);
    });
    
    const docSnap: any = await Promise.race([getDocFromServer(docRef), timeoutPromise]);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && Array.isArray(data.students)) {
        localStorage.setItem("default_student_roster", JSON.stringify(data.students));
        return { roster: data.students, isCloudConnected: true };
      }
    } else {
      if (localRoster.length > 0) {
        await setDoc(docRef, {
          id: "default",
          students: localRoster,
          updatedAt: new Date().toISOString()
        });
      }
    }
    return { roster: localRoster, isCloudConnected: true };
  } catch (error) {
    console.warn("Failed to load default roster from cloud, using local:", error);
    const localSaved = localStorage.getItem("default_student_roster");
    let localRoster: RosterStudent[] = localSaved ? JSON.parse(localSaved) : [];
    return { roster: localRoster, isCloudConnected: false };
  }
}

export async function saveDefaultRoster(students: RosterStudent[]): Promise<boolean> {
  try {
    localStorage.setItem("default_student_roster", JSON.stringify(students));

    if (!db) {
      return false;
    }

    const docRef = doc(db, 'rosters', 'default');
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore save timeout")), 2000);
    });

    await Promise.race([
      setDoc(docRef, {
        id: "default",
        students: students,
        updatedAt: new Date().toISOString()
      }),
      timeoutPromise
    ]);
    return true;
  } catch (error) {
    console.warn("Failed to save roster to cloud:", error);
    return false;
  }
}

// Real-time Firestore sync subscriptions
export function subscribeToEvents(callback: (events: Event[]) => void): () => void {
  if (!db) {
    return () => {};
  }
  const eventsCol = collection(db, 'events');
  return onSnapshot(eventsCol, (snapshot) => {
    const cloudEvents: Event[] = [];
    const cloudIds = new Set<string>();
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Event;
      cloudEvents.push(data);
      cloudIds.add(data.id);
    });

    let deletedIds: string[] = [];
    try {
      const d = localStorage.getItem("deleted_event_ids");
      if (d) deletedIds = JSON.parse(d);
    } catch (e) {}
    const deletedSet = new Set(deletedIds);

    const local = getLocalEvents();
    const mergedEvents = [...cloudEvents];

    // Reconciliation: If there are local events not present in the cloud and not deleted,
    // upload them to the cloud in the background.
    for (const localEv of local) {
      if (!cloudIds.has(localEv.id)) {
        if (deletedSet.has(localEv.id)) {
          continue;
        }
        // Save to Firestore in background
        saveEventToCloudOnly(localEv).catch((err) => {
          console.warn("Failed to auto-reconcile local event to cloud:", localEv.id, err);
        });
        mergedEvents.push(localEv);
      }
    }

    mergedEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    saveLocalEvents(mergedEvents);
    callback(mergedEvents);
  }, (error) => {
    console.warn("Firestore events sub error:", error);
  });
}

export function subscribeToDefaultRoster(callback: (roster: RosterStudent[]) => void): () => void {
  if (!db) {
    return () => {};
  }
  const docRef = doc(db, 'rosters', 'default');
  return onSnapshot(docRef, (docSnap) => {
    const localSaved = localStorage.getItem("default_student_roster");
    const localRoster: RosterStudent[] = localSaved ? JSON.parse(localSaved) : [];

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && Array.isArray(data.students)) {
        localStorage.setItem("default_student_roster", JSON.stringify(data.students));
        callback(data.students);
      }
    } else {
      // If the cloud document doesn't exist yet, push the current local roster up to keep it online
      if (localRoster.length > 0) {
        setDoc(docRef, {
          id: "default",
          students: localRoster,
          updatedAt: new Date().toISOString()
        }).catch((err) => {
          console.warn("Failed to auto-upload default roster:", err);
        });
        callback(localRoster);
      }
    }
  }, (error) => {
    console.warn("Firestore roster sub error:", error);
  });
}
