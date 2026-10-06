// The library on this device: records and result files in the browser's IndexedDB.
// Records are made by libraryEntry() (library.js). Result files are Blobs, kept apart so listing
// the records stays cheap. If storage fails or is full, tools keep working: the failure is
// remembered as a short note that the library page shows.

const DB = "ftt-library";
const NOTE_KEY = "ftt:library-note";

/** @type {Promise<IDBDatabase> | null} */
let opened = null;

function open() {
  opened ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser has no local storage for the library."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("entries", { keyPath: "id" });
      req.result.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("The library could not be opened."));
    req.onblocked = () => reject(new Error("The library is open in another tab that must be reloaded."));
  });
  opened.catch(() => { opened = null; });
  return opened;
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve(undefined);
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error("The write was cancelled."));
});
const wait = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** Remember that saving failed, for the library page to show. Never throws. */
export function setNote(text) {
  try {
    if (text) localStorage.setItem(NOTE_KEY, JSON.stringify({ text, time: new Date().toISOString() }));
    else localStorage.removeItem(NOTE_KEY);
  } catch {}
}

/** The last storage problem, if any. @returns {{ text: string, time: string } | null} */
export function getNote() {
  try { return JSON.parse(localStorage.getItem(NOTE_KEY) || "null"); } catch { return null; }
}

const quotaMessage = (e) =>
  e?.name === "QuotaExceededError"
    ? "The library is full, so the last job's files were not kept. Clear some records to make room."
    : `The library could not save the last job (${e?.message || e?.name || "unknown error"}).`;

/**
 * Save a record with its result files. If the files don't fit, the record is kept without them.
 * Never throws: a failed save sets the note and returns false.
 * @param {import("./library.js").LibraryEntry} entry
 * @param {Blob[]} blobs one per entry.outputs item, same order
 * @returns {Promise<boolean>} true when everything was kept
 */
export async function saveEntry(entry, blobs = []) {
  try {
    const db = await open();
    try {
      const tx = db.transaction(["entries", "blobs"], "readwrite");
      tx.objectStore("entries").put(entry);
      blobs.forEach((b, i) => tx.objectStore("blobs").put(b, `${entry.id}/${i}`));
      await done(tx);
      return true;
    } catch (e) {
      setNote(quotaMessage(e));
      const tx = db.transaction("entries", "readwrite");
      tx.objectStore("entries").put(entry);
      await done(tx);
      return false;
    }
  } catch (e) {
    setNote(quotaMessage(e));
    return false;
  }
}

/** All records, newest first. @returns {Promise<import("./library.js").LibraryEntry[]>} */
export async function listEntries() {
  const db = await open();
  const all = await wait(db.transaction("entries").objectStore("entries").getAll());
  return all.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : a.id < b.id ? 1 : -1));
}

/** The result file at `index` of record `id`, or undefined if it was not kept. */
export async function getBlob(id, index) {
  const db = await open();
  return wait(db.transaction("blobs").objectStore("blobs").get(`${id}/${index}`));
}

/** Keys of the files that were kept, as a set of "id/index". */
export async function keptKeys() {
  const db = await open();
  return new Set(await wait(db.transaction("blobs").objectStore("blobs").getAllKeys()));
}

export async function deleteEntry(id) {
  const db = await open();
  const tx = db.transaction(["entries", "blobs"], "readwrite");
  tx.objectStore("entries").delete(id);
  tx.objectStore("blobs").delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`));
  await done(tx);
}

export async function clearAll() {
  const db = await open();
  const tx = db.transaction(["entries", "blobs"], "readwrite");
  tx.objectStore("entries").clear();
  tx.objectStore("blobs").clear();
  await done(tx);
  setNote("");
}

/** Space this site uses and may use, in bytes. */
export async function usage() {
  try {
    const e = await navigator.storage.estimate();
    return { used: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
