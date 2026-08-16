const DATABASE_NAME = 'h5-emu-storage';
const DATABASE_VERSION = 1;
const STORE_NAME = 'binary-states';

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('此瀏覽器不支援 IndexedDB'));
  }
  if (databasePromise) return databasePromise;

  const requestPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 開啟失敗'));
  });
  databasePromise = requestPromise.catch(error => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

function asBytes(value: unknown): Uint8Array | null {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  return null;
}

export async function readBinaryState(key: string): Promise<Uint8Array | null> {
  const database = await openDatabase();
  return new Promise<Uint8Array | null>((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(asBytes(request.result));
      request.onerror = () => reject(request.error ?? new Error('IndexedDB 讀取失敗'));
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 讀取交易失敗'));
    } catch (error) {
      reject(error);
    }
  });
}

export async function writeBinaryState(key: string, data: Uint8Array): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 寫入交易失敗'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 寫入交易中止'));
      transaction.objectStore(STORE_NAME).put(data.slice().buffer, key);
    } catch (error) {
      reject(error);
    }
  });
}