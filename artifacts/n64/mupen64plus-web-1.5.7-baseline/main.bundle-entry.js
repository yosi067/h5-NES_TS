export const mainMupen64PlusWebJsFileName = "index.7f0ebbf78c.js";
import createModule from "./index.7f0ebbf78c.cjs"
// The correct import for createModule will be injected during the build process
import baseModule from './module';
import { getFile, putFile } from './idbfs-file-utils';
import { findAutoInputConfig, preloadAutoInputConfig, writeAutoInputConfig } from './gamepad-utils';

/*
 * Saves the specified file to the IndexedDB store where 
 * the emulator can pick it up. Will overwrite any existing
 * file with the same fileName. Shouldn't be done while the 
 * emulator is running.
 *
 * - fileName should be the rom 'goodname' for the title the save is 
 * for, along with the appropriate extension for the save type. 
 * For example: `Super Smash Bros. (U) [!].sra'
 * - fileData should be an arraybuffer containing the file data.
 */
const putSaveFile = function(fileName, fileData) {

  return putFile('/mupen64plus/saves/' + fileName, new Int8Array(fileData));
}

const getAllSaveFiles = function() {
  return new Promise(function(resolve, reject) {
    
    const connection = indexedDB.open('/mupen64plus');

    connection.onupgradeneeded = function(e) {
      console.log("onupgradeneeded");
      var db = e.target.result;

      if (!db.objectStoreNames.contains('FILE_DATA')) {
        const objectStore = db.createObjectStore('FILE_DATA');
        objectStore.createIndex('timestamp', 'timestamp', { unique: false, multiEntry: false });

        // Create savefile folder
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
    
    connection.onsuccess = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('FILE_DATA')) {
        resolve([]);
        return;
      }
      
      const transaction = db.transaction('FILE_DATA', 'readonly');
      const store = transaction.objectStore('FILE_DATA');

      const request = store.getAllKeys();

      request.onerror = function(event) {
        console.error("Error while querying keys from IDBFS: %o", event);
        reject(event);
      }
      
      request.onsuccess = function(event) {

        const keys = event.target.result;

        const saveFileKeys = keys.filter((key) => {
          return key !== '/mupen64plus/saves' && key.includes("/mupen64plus/saves");
        });

        const getFilePromises = saveFileKeys.map((key) => {
          return getFile(key);
        });

        Promise.all(getFilePromises).then((results) => {
          resolve(results);
        });
      }
    }    
  });
}

const createMupen64PlusWeb = function(extraModuleArgs) {

  console.log(baseModule);
  const m = Object.assign({}, baseModule, extraModuleArgs);

  console.log(m);
  console.log("createMupen64PlusWeb main");

  if (!m.canvas) {
    throw "No canvas element provided for mupen64PlusWeb to use!";
  }

  if (!m.romData) {
    throw "No rom specified for emulation!";
  }

  if (!m.coreConfig.emuMode || m.coreConfig.emuMode < 0 || m.coreConfig.emuMode > 3) {
    m.coreConfig.emuMode = 0;
  }

  if (m.netplayConfig.player !== 0 && m.netplayConfig.registrationId == null) {
    m.netplayConfig.registrationId = Math.floor(Math.random() * (Math.pow(2, 31) - 1));
  }
  
  // As a default initial behavior, pop up an alert when webgl context is lost. To make your
  // application robust, you may want to override this behavior before shipping!
  // See http://www.khronos.org/registry/webgl/specs/latest/1.0/#5.15.2
  m.canvas.addEventListener("webglcontextlost", function(e) { alert('WebGL context lost. You will need to reload the page.'); e.preventDefault(); }, false);

  console.log("module: %o", m);

  window.onerror = function(event) {
    // TODO: do not warn on ok events like simulating an infinite loop or exitStatus
    console.error('Exception thrown: ', event);
    m.setErrorStatus(event);
  };

  return createModule(m).then((module) => {
    return module.emulatorControls;
  });
}

export {
  putSaveFile,
  getAllSaveFiles,
  findAutoInputConfig,
  preloadAutoInputConfig,
  writeAutoInputConfig
}
export default createMupen64PlusWeb;


