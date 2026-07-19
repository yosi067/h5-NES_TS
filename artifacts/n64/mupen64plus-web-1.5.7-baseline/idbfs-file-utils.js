const onUpgradeNeeded = function(event) {
  var db = event.target.result;

  if (!db.objectStoreNames.contains('FILE_DATA')) {
    const objectStore = db.createObjectStore('FILE_DATA');
    objectStore.createIndex('timestamp', 'timestamp', { unique: false, multiEntry: false });

    objectStore.add({
      timestamp: new Date(Date.now()),
      mode: 16832
    }, "/mupen64plus/saves");

    objectStore.add({
      timestamp: new Date(Date.now()),
      mode: 16832
    }, "/mupen64plus/data");
  }
}

export const getFile = function(fileKey) {
  
  return new Promise(function(resolve, reject) {

    const connection = indexedDB.open('/mupen64plus');
    
    connection.onupgradeneeded = onUpgradeNeeded;
    
    connection.onerror = (event) => {
      console.error("Error while updating IDBFS store: %o", event);
      reject(event);
    }

    connection.onsuccess = (e) => {      
      const db = e.target.result;

      const transaction = db.transaction('FILE_DATA', 'readonly');
      const store = transaction.objectStore('FILE_DATA');
      
      const request = store.get(fileKey);

      request.onerror = function(event) {
        console.error("Error while loading file %s from IDBFS: %o", fileKey, event);
        reject(event);
      }
      
      request.onsuccess = function(event) {
        //console.log(event); <- this bit cost me a weekend

        const contents = event.target.result
                       ? event.target.result.contents
                       : null;

        resolve({ fileKey, contents });
      }
    }
  });
}

export const putFile = function(fileKey, data) {
  
  return new Promise(function(resolve, reject) {

    const connection = indexedDB.open('/mupen64plus');

    connection.onupgradeneeded = onUpgradeNeeded;

    connection.onerror = function(event) {
      console.error("Error while updating IDBFS store: %o", event);
      reject(event);
    }

    connection.onsuccess = (e) => {      
      const db = e.target.result;

      const transaction = db.transaction('FILE_DATA', 'readwrite');
      const store = transaction.objectStore('FILE_DATA');

      const toSave = {
        contents: data,
        timestamp: new Date(Date.now()),
        mode: 33206 // whatever this means
      };

      const request = store.put(toSave, fileKey);
      request.onerror = function(event) {
        console.error("Error while loading file %s from IDBFS: %o", fileKey, event);
        reject(event);
      }
      
      request.onsuccess = function(event) {
        //console.log(event); <- this bit cost me a weekend

        const contents = event.target.result
                       ? event.target.result.contents
                       : null;

        resolve({ fileKey, contents });

      }
    };
  });
}
