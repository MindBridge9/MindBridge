const DB_NAME = 'mindbridge-local-db';
const DB_VERSION = 1;
const PAGES_STORE = 'saved_pages';
const IMAGES_STORE = 'page_images';
const SESSIONS_STORE = 'learning_sessions';

function isIndexedDbAvailable() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PAGES_STORE)) {
        db.createObjectStore(PAGES_STORE, { keyPath: 'page_id' });
      }
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE, { keyPath: 'image_key' });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'page_id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open local storage database'));
  });
}

function runTx(db, storeNames, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    result = fn(tx);
  });
}

function reqPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isValidSavedRecord(record) {
  return Boolean(
    record &&
      typeof record === 'object' &&
      record.schema_version === 1 &&
      record.page &&
      typeof record.page.id === 'string' &&
      Array.isArray(record.page.chunks)
  );
}

export async function savePageLocal({
  page,
  imageBlob = null,
  simplifications = [],
  definitions = [],
}) {
  if (!page?.id || !isIndexedDbAvailable()) {
    return { ok: false, error: 'Local persistence unavailable' };
  }
  try {
    const db = await openDb();
    const imageKey = imageBlob instanceof Blob ? `img_${page.id}` : null;
    const savedRecord = {
      page_id: page.id,
      schema_version: 1,
      page,
      image_key: imageKey,
      simplifications,
      definitions,
      saved_at: new Date().toISOString(),
    };

    await runTx(db, [PAGES_STORE, IMAGES_STORE], 'readwrite', (tx) => {
      tx.objectStore(PAGES_STORE).put(savedRecord);
      if (imageKey && imageBlob instanceof Blob) {
        tx.objectStore(IMAGES_STORE).put({
          image_key: imageKey,
          blob: imageBlob,
        });
      }
    });
    db.close();
    return { ok: true, record: savedRecord };
  } catch (err) {
    return { ok: false, error: err?.message || 'Unable to save page locally' };
  }
}

export async function saveLearningSessionLocal(sessionSnapshot) {
  if (!sessionSnapshot?.page_id || !isIndexedDbAvailable()) {
    return { ok: false };
  }
  try {
    const db = await openDb();
    await runTx(db, [SESSIONS_STORE], 'readwrite', (tx) => {
      tx.objectStore(SESSIONS_STORE).put({
        ...sessionSnapshot,
        updated_at: new Date().toISOString(),
      });
    });
    db.close();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function getSavedPage(pageId) {
  if (!pageId || !isIndexedDbAvailable()) {
    return { ok: false, item: null };
  }
  try {
    const db = await openDb();
    const tx = db.transaction([PAGES_STORE, SESSIONS_STORE], 'readonly');
    const pageRecord = await reqPromise(tx.objectStore(PAGES_STORE).get(pageId));
    const sessionRecord = await reqPromise(tx.objectStore(SESSIONS_STORE).get(pageId));
    db.close();

    if (!isValidSavedRecord(pageRecord)) {
      return { ok: false, item: null };
    }
    return {
      ok: true,
      item: {
        ...pageRecord,
        learningSession: sessionRecord || null,
      },
    };
  } catch {
    return { ok: false, item: null };
  }
}

export async function listSavedPages() {
  if (!isIndexedDbAvailable()) {
    return { ok: false, items: [] };
  }
  try {
    const db = await openDb();
    const tx = db.transaction([PAGES_STORE, SESSIONS_STORE], 'readonly');
    const pages = await reqPromise(tx.objectStore(PAGES_STORE).getAll());
    const sessions = await reqPromise(tx.objectStore(SESSIONS_STORE).getAll());
    db.close();

    const sessionByPageId = new Map((sessions || []).map((s) => [s.page_id, s]));
    const items = (pages || [])
      .filter(isValidSavedRecord)
      .map((p) => ({
        ...p,
        learningSession: sessionByPageId.get(p.page_id) || null,
      }))
      .sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at)));

    return { ok: true, items };
  } catch {
    return { ok: false, items: [] };
  }
}

export async function loadSavedPageImage(imageKey) {
  if (!imageKey || !isIndexedDbAvailable()) return null;
  try {
    const db = await openDb();
    const tx = db.transaction([IMAGES_STORE], 'readonly');
    const entry = await reqPromise(tx.objectStore(IMAGES_STORE).get(imageKey));
    db.close();
    return entry?.blob instanceof Blob ? entry.blob : null;
  } catch {
    return null;
  }
}

export async function deleteSavedPage(pageId) {
  if (!pageId || !isIndexedDbAvailable()) return { ok: false };
  try {
    const db = await openDb();
    await runTx(db, [PAGES_STORE, IMAGES_STORE, SESSIONS_STORE], 'readwrite', (tx) => {
      tx.objectStore(PAGES_STORE).delete(pageId);
      tx.objectStore(IMAGES_STORE).delete(`img_${pageId}`);
      tx.objectStore(SESSIONS_STORE).delete(pageId);
    });
    db.close();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function clearAllSavedData() {
  if (!isIndexedDbAvailable()) return { ok: false };
  try {
    const db = await openDb();
    await runTx(db, [PAGES_STORE, IMAGES_STORE, SESSIONS_STORE], 'readwrite', (tx) => {
      tx.objectStore(PAGES_STORE).clear();
      tx.objectStore(IMAGES_STORE).clear();
      tx.objectStore(SESSIONS_STORE).clear();
    });
    db.close();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
