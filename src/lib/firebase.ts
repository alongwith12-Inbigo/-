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
    
    // We use safe getFirestore initializer which leverages standard SDK cache fallback
    // and completely bypasses the persistentMultipleTabManager locking bugs in sandboxed iframes.
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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

// Test Connection to Firestore with a reliable 15-second timeout
export async function testConnection(): Promise<boolean> {
  if (!db) return false;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), 15000);
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
    
    // We race the getDocs call against a 15-second timeout to allow slow online connections 
    // plenty of time to resolve during cold loads or iframe proxy delays.
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore connection timeout")), 15000);
    });
    
    const snapshot = (await Promise.race([getDocs(eventsCol), timeoutPromise])) as any;
    const cloudEvents: Event[] = [];
    
    snapshot.forEach((docSnap: any) => {
      const data = docSnap.data() as Event;
      cloudEvents.push(data);
    });

    let deletedIds: string[] = [];
    try {
      const d = localStorage.getItem("deleted_event_ids");
      if (d) deletedIds = JSON.parse(d);
    } catch (e) {}
    const deletedSet = new Set(deletedIds);

    const local = getLocalEvents();
    const mergedEventsMap = new Map<string, Event>();

    // Seed map with cloud events
    cloudEvents.forEach((ev) => {
      mergedEventsMap.set(ev.id, ev);
    });

    // Reconcile with local events
    for (const localEv of local) {
      if (deletedSet.has(localEv.id)) {
        continue;
      }
      const cloudEv = mergedEventsMap.get(localEv.id);
      if (!cloudEv) {
        // Not present in cloud - upload in background
        saveEventToCloudOnly(localEv).catch((err) => {
          console.warn("Failed background upload of unsynced offline event:", err);
        });
        mergedEventsMap.set(localEv.id, localEv);
      } else {
        // Exists in both: compare updatedAt
        const localTime = localEv.updatedAt ? new Date(localEv.updatedAt).getTime() : 0;
        const cloudTime = cloudEv.updatedAt ? new Date(cloudEv.updatedAt).getTime() : 0;
        if (localTime > cloudTime) {
          // Local is newer: use local and upload in background
          saveEventToCloudOnly(localEv).catch((err) => {
            console.warn("Failed background update with newer local event:", err);
          });
          mergedEventsMap.set(localEv.id, localEv);
        }
      }
    }

    const mergedEvents = Array.from(mergedEventsMap.values());
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
      setTimeout(() => reject(new Error("Firestore save timeout")), 15000);
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
      setTimeout(() => reject(new Error("Firestore delete timeout")), 15000);
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
      setTimeout(() => reject(new Error("Firestore connection timeout")), 15000);
    });
    
    const docSnap: any = await Promise.race([getDocFromServer(docRef), timeoutPromise]);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && Array.isArray(data.students)) {
        let localUpdatedAt: string | null = null;
        try {
          const lMeta = localStorage.getItem("default_student_roster_metadata");
          if (lMeta) {
            const parsed = JSON.parse(lMeta);
            if (parsed && parsed.updatedAt) localUpdatedAt = parsed.updatedAt;
          }
        } catch (e) {}

        const localTime = localUpdatedAt ? new Date(localUpdatedAt).getTime() : 0;
        const cloudTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;

        if (localTime > cloudTime) {
          await setDoc(docRef, {
            id: "default",
            students: localRoster,
            updatedAt: localUpdatedAt
          });
          return { roster: localRoster, isCloudConnected: true };
        } else {
          localStorage.setItem("default_student_roster", JSON.stringify(data.students));
          if (data.updatedAt) {
            localStorage.setItem("default_student_roster_metadata", JSON.stringify({ updatedAt: data.updatedAt }));
          }
          return { roster: data.students, isCloudConnected: true };
        }
      }
    } else {
      if (localRoster.length > 0) {
        const now = new Date().toISOString();
        await setDoc(docRef, {
          id: "default",
          students: localRoster,
          updatedAt: now
        });
        localStorage.setItem("default_student_roster_metadata", JSON.stringify({ updatedAt: now }));
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
    const now = new Date().toISOString();
    localStorage.setItem("default_student_roster", JSON.stringify(students));
    localStorage.setItem("default_student_roster_metadata", JSON.stringify({ updatedAt: now }));

    if (!db) {
      return false;
    }

    const docRef = doc(db, 'rosters', 'default');
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore save timeout")), 15000);
    });

    await Promise.race([
      setDoc(docRef, {
        id: "default",
        students: students,
        updatedAt: now
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
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as Event;
      cloudEvents.push(data);
    });

    cloudEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    saveLocalEvents(cloudEvents);
    callback(cloudEvents);
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
        if (data.updatedAt) {
          localStorage.setItem("default_student_roster_metadata", JSON.stringify({ updatedAt: data.updatedAt }));
        }
        callback(data.students);
      }
    } else {
      // If the cloud document doesn't exist yet, push the current local roster up to keep it online
      if (localRoster.length > 0) {
        const now = new Date().toISOString();
        localStorage.setItem("default_student_roster_metadata", JSON.stringify({ updatedAt: now }));
        setDoc(docRef, {
          id: "default",
          students: localRoster,
          updatedAt: now
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
