var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all3) => {
  for (var name in all3)
    __defProp(target, name, { get: all3[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// artifacts/n64/mupen64plus-web-1.5.7-baseline/index.7f0ebbf78c.cjs
var require_index_7f0ebbf78c = __commonJS({
  "artifacts/n64/mupen64plus-web-1.5.7-baseline/index.7f0ebbf78c.cjs"(exports, module) {
    "use strict";
    var createModule2 = (() => {
      var _scriptDir = typeof document !== "undefined" && document.currentScript ? document.currentScript.src : void 0;
      return function(createModule3) {
        createModule3 = createModule3 || {};
        var Module2 = typeof createModule3 != "undefined" ? createModule3 : {};
        var readyPromiseResolve, readyPromiseReject;
        Module2["ready"] = new Promise(function(resolve, reject) {
          readyPromiseResolve = resolve;
          readyPromiseReject = reject;
        });
        if (!Module2.expectedDataFileDownloads) {
          Module2.expectedDataFileDownloads = 0;
        }
        Module2.expectedDataFileDownloads++;
        (function() {
          if (Module2["ENVIRONMENT_IS_PTHREAD"]) return;
          var loadPackage = function(metadata) {
            var PACKAGE_PATH = "";
            if (typeof window === "object") {
              PACKAGE_PATH = window["encodeURIComponent"](window.location.pathname.toString().substring(0, window.location.pathname.toString().lastIndexOf("/")) + "/");
            } else if (typeof process === "undefined" && typeof location !== "undefined") {
              PACKAGE_PATH = encodeURIComponent(location.pathname.toString().substring(0, location.pathname.toString().lastIndexOf("/")) + "/");
            }
            var PACKAGE_NAME = "/src/bin/web/index.7f0ebbf78c.data";
            var REMOTE_PACKAGE_BASE = "index.7f0ebbf78c.data";
            if (typeof Module2["locateFilePackage"] === "function" && !Module2["locateFile"]) {
              Module2["locateFile"] = Module2["locateFilePackage"];
              err("warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)");
            }
            var REMOTE_PACKAGE_NAME = Module2["locateFile"] ? Module2["locateFile"](REMOTE_PACKAGE_BASE, "") : REMOTE_PACKAGE_BASE;
            var REMOTE_PACKAGE_SIZE = metadata["remote_package_size"];
            function fetchRemotePackage(packageName, packageSize, callback, errback) {
              var xhr = new XMLHttpRequest();
              xhr.open("GET", packageName, true);
              xhr.responseType = "arraybuffer";
              xhr.onprogress = function(event2) {
                var url = packageName;
                var size = packageSize;
                if (event2.total) size = event2.total;
                if (event2.loaded) {
                  if (!xhr.addedTotal) {
                    xhr.addedTotal = true;
                    if (!Module2.dataFileDownloads) Module2.dataFileDownloads = {};
                    Module2.dataFileDownloads[url] = { loaded: event2.loaded, total: size };
                  } else {
                    Module2.dataFileDownloads[url].loaded = event2.loaded;
                  }
                  var total = 0;
                  var loaded = 0;
                  var num = 0;
                  for (var download in Module2.dataFileDownloads) {
                    var data = Module2.dataFileDownloads[download];
                    total += data.total;
                    loaded += data.loaded;
                    num++;
                  }
                  total = Math.ceil(total * Module2.expectedDataFileDownloads / num);
                  if (Module2["setStatus"]) Module2["setStatus"]("Downloading data... (" + loaded + "/" + total + ")");
                } else if (!Module2.dataFileDownloads) {
                  if (Module2["setStatus"]) Module2["setStatus"]("Downloading data...");
                }
              };
              xhr.onerror = function(event2) {
                throw new Error("NetworkError for: " + packageName);
              };
              xhr.onload = function(event2) {
                if (xhr.status == 200 || xhr.status == 304 || xhr.status == 206 || xhr.status == 0 && xhr.response) {
                  var packageData = xhr.response;
                  callback(packageData);
                } else {
                  throw new Error(xhr.statusText + " : " + xhr.responseURL);
                }
              };
              xhr.send(null);
            }
            function handleError(error) {
              console.error("package error:", error);
            }
            var fetchedCallback = null;
            var fetched = Module2["getPreloadedPackage"] ? Module2["getPreloadedPackage"](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE) : null;
            if (!fetched) fetchRemotePackage(REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE, function(data) {
              if (fetchedCallback) {
                fetchedCallback(data);
                fetchedCallback = null;
              } else {
                fetched = data;
              }
            }, handleError);
            function runWithFS() {
              function assert2(check, msg) {
                if (!check) throw msg + new Error().stack;
              }
              Module2["FS_createPath"]("/", "data", true, true);
              function DataRequest(start, end, audio) {
                this.start = start;
                this.end = end;
                this.audio = audio;
              }
              DataRequest.prototype = { requests: {}, open: function(mode, name) {
                this.name = name;
                this.requests[name] = this;
                Module2["addRunDependency"]("fp " + this.name);
              }, send: function() {
              }, onload: function() {
                var byteArray = this.byteArray.subarray(this.start, this.end);
                this.finish(byteArray);
              }, finish: function(byteArray) {
                var that = this;
                Module2["FS_createPreloadedFile"](this.name, null, byteArray, true, true, function() {
                  Module2["removeRunDependency"]("fp " + that.name);
                }, function() {
                  if (that.audio) {
                    Module2["removeRunDependency"]("fp " + that.name);
                  } else {
                    err("Preloading file " + that.name + " failed");
                  }
                }, false, true);
                this.requests[this.name] = null;
              } };
              var files = metadata["files"];
              for (var i2 = 0; i2 < files.length; ++i2) {
                new DataRequest(files[i2]["start"], files[i2]["end"], files[i2]["audio"] || 0).open("GET", files[i2]["filename"]);
              }
              function processPackageData(arrayBuffer) {
                assert2(arrayBuffer, "Loading data file failed.");
                assert2(arrayBuffer.constructor.name === ArrayBuffer.name, "bad input to processPackageData");
                var byteArray = new Uint8Array(arrayBuffer);
                DataRequest.prototype.byteArray = byteArray;
                var files2 = metadata["files"];
                for (var i3 = 0; i3 < files2.length; ++i3) {
                  DataRequest.prototype.requests[files2[i3].filename].onload();
                }
                Module2["removeRunDependency"]("datafile_/src/bin/web/index.7f0ebbf78c.data");
              }
              Module2["addRunDependency"]("datafile_/src/bin/web/index.7f0ebbf78c.data");
              if (!Module2.preloadResults) Module2.preloadResults = {};
              Module2.preloadResults[PACKAGE_NAME] = { fromCache: false };
              if (fetched) {
                processPackageData(fetched);
                fetched = null;
              } else {
                fetchedCallback = processPackageData;
              }
            }
            if (Module2["calledRun"]) {
              runWithFS();
            } else {
              if (!Module2["preRun"]) Module2["preRun"] = [];
              Module2["preRun"].push(runWithFS);
            }
          };
          loadPackage({ "files": [{ "filename": "/data/InputAutoCfg.ini", "start": 0, "end": 41267 }, { "filename": "/data/RiceVideoLinux.ini", "start": 41267, "end": 66089 }, { "filename": "/data/mupen64plus.cfg", "start": 66089, "end": 82449 }, { "filename": "/data/mupen64plus.ini", "start": 82449, "end": 537524 }], "remote_package_size": 537524 });
        })();
        var moduleOverrides = Object.assign({}, Module2);
        var arguments_ = [];
        var thisProgram = "./this.program";
        var quit_ = (status, toThrow) => {
          throw toThrow;
        };
        var ENVIRONMENT_IS_WEB = typeof window == "object";
        var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
        var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";
        var scriptDirectory = "";
        function locateFile(path) {
          if (Module2["locateFile"]) {
            return Module2["locateFile"](path, scriptDirectory);
          }
          return scriptDirectory + path;
        }
        var read_, readAsync, readBinary, setWindowTitle;
        if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
          if (ENVIRONMENT_IS_WORKER) {
            scriptDirectory = self.location.href;
          } else if (typeof document != "undefined" && document.currentScript) {
            scriptDirectory = document.currentScript.src;
          }
          if (_scriptDir) {
            scriptDirectory = _scriptDir;
          }
          if (scriptDirectory.indexOf("blob:") !== 0) {
            scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
          } else {
            scriptDirectory = "";
          }
          {
            read_ = (url) => {
              var xhr = new XMLHttpRequest();
              xhr.open("GET", url, false);
              xhr.send(null);
              return xhr.responseText;
            };
            if (ENVIRONMENT_IS_WORKER) {
              readBinary = (url) => {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", url, false);
                xhr.responseType = "arraybuffer";
                xhr.send(null);
                return new Uint8Array(xhr.response);
              };
            }
            readAsync = (url, onload, onerror) => {
              var xhr = new XMLHttpRequest();
              xhr.open("GET", url, true);
              xhr.responseType = "arraybuffer";
              xhr.onload = () => {
                if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                  onload(xhr.response);
                  return;
                }
                onerror();
              };
              xhr.onerror = onerror;
              xhr.send(null);
            };
          }
          setWindowTitle = (title) => document.title = title;
        } else {
        }
        var out = Module2["print"] || console.log.bind(console);
        var err = Module2["printErr"] || console.warn.bind(console);
        Object.assign(Module2, moduleOverrides);
        moduleOverrides = null;
        if (Module2["arguments"]) arguments_ = Module2["arguments"];
        if (Module2["thisProgram"]) thisProgram = Module2["thisProgram"];
        if (Module2["quit"]) quit_ = Module2["quit"];
        var POINTER_SIZE = 4;
        var wasmBinary;
        if (Module2["wasmBinary"]) wasmBinary = Module2["wasmBinary"];
        var noExitRuntime = Module2["noExitRuntime"] || true;
        if (typeof WebAssembly != "object") {
          abort("no native wasm support detected");
        }
        var wasmMemory;
        var ABORT = false;
        var EXITSTATUS;
        function assert(condition, text) {
          if (!condition) {
            abort(text);
          }
        }
        var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder("utf8") : void 0;
        function UTF8ArrayToString(heapOrArray, idx, maxBytesToRead) {
          var endIdx = idx + maxBytesToRead;
          var endPtr = idx;
          while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
          if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
            return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
          }
          var str = "";
          while (idx < endPtr) {
            var u0 = heapOrArray[idx++];
            if (!(u0 & 128)) {
              str += String.fromCharCode(u0);
              continue;
            }
            var u1 = heapOrArray[idx++] & 63;
            if ((u0 & 224) == 192) {
              str += String.fromCharCode((u0 & 31) << 6 | u1);
              continue;
            }
            var u2 = heapOrArray[idx++] & 63;
            if ((u0 & 240) == 224) {
              u0 = (u0 & 15) << 12 | u1 << 6 | u2;
            } else {
              u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
            }
            if (u0 < 65536) {
              str += String.fromCharCode(u0);
            } else {
              var ch = u0 - 65536;
              str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
            }
          }
          return str;
        }
        function UTF8ToString(ptr, maxBytesToRead) {
          return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
        }
        function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) {
          if (!(maxBytesToWrite > 0)) return 0;
          var startIdx = outIdx;
          var endIdx = outIdx + maxBytesToWrite - 1;
          for (var i2 = 0; i2 < str.length; ++i2) {
            var u = str.charCodeAt(i2);
            if (u >= 55296 && u <= 57343) {
              var u1 = str.charCodeAt(++i2);
              u = 65536 + ((u & 1023) << 10) | u1 & 1023;
            }
            if (u <= 127) {
              if (outIdx >= endIdx) break;
              heap[outIdx++] = u;
            } else if (u <= 2047) {
              if (outIdx + 1 >= endIdx) break;
              heap[outIdx++] = 192 | u >> 6;
              heap[outIdx++] = 128 | u & 63;
            } else if (u <= 65535) {
              if (outIdx + 2 >= endIdx) break;
              heap[outIdx++] = 224 | u >> 12;
              heap[outIdx++] = 128 | u >> 6 & 63;
              heap[outIdx++] = 128 | u & 63;
            } else {
              if (outIdx + 3 >= endIdx) break;
              heap[outIdx++] = 240 | u >> 18;
              heap[outIdx++] = 128 | u >> 12 & 63;
              heap[outIdx++] = 128 | u >> 6 & 63;
              heap[outIdx++] = 128 | u & 63;
            }
          }
          heap[outIdx] = 0;
          return outIdx - startIdx;
        }
        function stringToUTF8(str, outPtr, maxBytesToWrite) {
          return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
        }
        function lengthBytesUTF8(str) {
          var len = 0;
          for (var i2 = 0; i2 < str.length; ++i2) {
            var c = str.charCodeAt(i2);
            if (c <= 127) {
              len++;
            } else if (c <= 2047) {
              len += 2;
            } else if (c >= 55296 && c <= 57343) {
              len += 4;
              ++i2;
            } else {
              len += 3;
            }
          }
          return len;
        }
        var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
        function updateGlobalBufferAndViews(buf) {
          buffer = buf;
          Module2["HEAP8"] = HEAP8 = new Int8Array(buf);
          Module2["HEAP16"] = HEAP16 = new Int16Array(buf);
          Module2["HEAP32"] = HEAP32 = new Int32Array(buf);
          Module2["HEAPU8"] = HEAPU8 = new Uint8Array(buf);
          Module2["HEAPU16"] = HEAPU16 = new Uint16Array(buf);
          Module2["HEAPU32"] = HEAPU32 = new Uint32Array(buf);
          Module2["HEAPF32"] = HEAPF32 = new Float32Array(buf);
          Module2["HEAPF64"] = HEAPF64 = new Float64Array(buf);
        }
        var INITIAL_MEMORY = Module2["INITIAL_MEMORY"] || 38535168;
        var wasmTable;
        var __ATPRERUN__ = [];
        var __ATINIT__ = [];
        var __ATMAIN__ = [];
        var __ATEXIT__ = [];
        var __ATPOSTRUN__ = [];
        var runtimeInitialized = false;
        function keepRuntimeAlive() {
          return noExitRuntime;
        }
        function preRun() {
          if (Module2["preRun"]) {
            if (typeof Module2["preRun"] == "function") Module2["preRun"] = [Module2["preRun"]];
            while (Module2["preRun"].length) {
              addOnPreRun(Module2["preRun"].shift());
            }
          }
          callRuntimeCallbacks(__ATPRERUN__);
        }
        function initRuntime() {
          runtimeInitialized = true;
          if (!Module2["noFSInit"] && !FS.init.initialized) FS.init();
          FS.ignorePermissions = false;
          TTY.init();
          callRuntimeCallbacks(__ATINIT__);
        }
        function preMain() {
          callRuntimeCallbacks(__ATMAIN__);
        }
        function postRun() {
          if (Module2["postRun"]) {
            if (typeof Module2["postRun"] == "function") Module2["postRun"] = [Module2["postRun"]];
            while (Module2["postRun"].length) {
              addOnPostRun(Module2["postRun"].shift());
            }
          }
          callRuntimeCallbacks(__ATPOSTRUN__);
        }
        function addOnPreRun(cb) {
          __ATPRERUN__.unshift(cb);
        }
        function addOnInit(cb) {
          __ATINIT__.unshift(cb);
        }
        function addOnPostRun(cb) {
          __ATPOSTRUN__.unshift(cb);
        }
        var runDependencies = 0;
        var runDependencyWatcher = null;
        var dependenciesFulfilled = null;
        function getUniqueRunDependency(id) {
          return id;
        }
        function addRunDependency(id) {
          runDependencies++;
          if (Module2["monitorRunDependencies"]) {
            Module2["monitorRunDependencies"](runDependencies);
          }
        }
        function removeRunDependency(id) {
          runDependencies--;
          if (Module2["monitorRunDependencies"]) {
            Module2["monitorRunDependencies"](runDependencies);
          }
          if (runDependencies == 0) {
            if (runDependencyWatcher !== null) {
              clearInterval(runDependencyWatcher);
              runDependencyWatcher = null;
            }
            if (dependenciesFulfilled) {
              var callback = dependenciesFulfilled;
              dependenciesFulfilled = null;
              callback();
            }
          }
        }
        function abort(what) {
          if (Module2["onAbort"]) {
            Module2["onAbort"](what);
          }
          what = "Aborted(" + what + ")";
          err(what);
          ABORT = true;
          EXITSTATUS = 1;
          what += ". Build with -sASSERTIONS for more info.";
          var e = new WebAssembly.RuntimeError(what);
          readyPromiseReject(e);
          throw e;
        }
        var dataURIPrefix = "data:application/octet-stream;base64,";
        function isDataURI(filename) {
          return filename.startsWith(dataURIPrefix);
        }
        var wasmBinaryFile;
        wasmBinaryFile = "index.7f0ebbf78c.wasm";
        if (!isDataURI(wasmBinaryFile)) {
          wasmBinaryFile = locateFile(wasmBinaryFile);
        }
        function getBinary(file) {
          try {
            if (file == wasmBinaryFile && wasmBinary) {
              return new Uint8Array(wasmBinary);
            }
            if (readBinary) {
              return readBinary(file);
            }
            throw "both async and sync fetching of the wasm failed";
          } catch (err2) {
            abort(err2);
          }
        }
        function getBinaryPromise() {
          if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
            if (typeof fetch == "function") {
              return fetch(wasmBinaryFile, { credentials: "same-origin" }).then(function(response) {
                if (!response["ok"]) {
                  throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
                }
                return response["arrayBuffer"]();
              }).catch(function() {
                return getBinary(wasmBinaryFile);
              });
            }
          }
          return Promise.resolve().then(function() {
            return getBinary(wasmBinaryFile);
          });
        }
        function createWasm() {
          var info = { "env": asmLibraryArg, "wasi_snapshot_preview1": asmLibraryArg };
          function receiveInstance(instance, module2) {
            var exports3 = instance.exports;
            exports3 = Asyncify.instrumentWasmExports(exports3);
            Module2["asm"] = exports3;
            wasmMemory = Module2["asm"]["memory"];
            updateGlobalBufferAndViews(wasmMemory.buffer);
            wasmTable = Module2["asm"]["__indirect_function_table"];
            addOnInit(Module2["asm"]["__wasm_call_ctors"]);
            removeRunDependency("wasm-instantiate");
          }
          addRunDependency("wasm-instantiate");
          function receiveInstantiationResult(result) {
            receiveInstance(result["instance"]);
          }
          function instantiateArrayBuffer(receiver) {
            return getBinaryPromise().then(function(binary) {
              return WebAssembly.instantiate(binary, info);
            }).then(function(instance) {
              return instance;
            }).then(receiver, function(reason) {
              err("failed to asynchronously prepare wasm: " + reason);
              abort(reason);
            });
          }
          function instantiateAsync() {
            if (!wasmBinary && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(wasmBinaryFile) && typeof fetch == "function") {
              return fetch(wasmBinaryFile, { credentials: "same-origin" }).then(function(response) {
                var result = WebAssembly.instantiateStreaming(response, info);
                return result.then(receiveInstantiationResult, function(reason) {
                  err("wasm streaming compile failed: " + reason);
                  err("falling back to ArrayBuffer instantiation");
                  return instantiateArrayBuffer(receiveInstantiationResult);
                });
              });
            } else {
              return instantiateArrayBuffer(receiveInstantiationResult);
            }
          }
          if (Module2["instantiateWasm"]) {
            try {
              var exports2 = Module2["instantiateWasm"](info, receiveInstance);
              exports2 = Asyncify.instrumentWasmExports(exports2);
              return exports2;
            } catch (e) {
              err("Module.instantiateWasm callback failed with error: " + e);
              readyPromiseReject(e);
            }
          }
          instantiateAsync().catch(readyPromiseReject);
          return {};
        }
        var tempDouble;
        var tempI64;
        var ASM_CONSTS = { 1718756: () => {
          window.addEventListener("keydown", function(e) {
            if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) > -1) {
              e.preventDefault();
            }
          });
          const start = function() {
            const doStart = Module2.cwrap("start", "number", ["number"], { async: true });
            const doStartPromise = new Promise(function(resolve, reject) {
              doStart(0).then(function() {
                resolve();
              }).catch(function(err2) {
                if (err2 === "unwind") {
                  resolve();
                } else {
                  console.error(err2);
                  reject(err2);
                }
              });
            });
            Module2.asyncAction = doStartPromise;
            return doStartPromise;
          };
          const stop = function() {
            const doStop = Module2.cwrap("stopEmulator", null, null);
            doStop();
          };
          const pause = function(pauseTargets) {
            const netplayEnabled = Module2.netplayConfig && Module2.netplayConfig.player !== 0;
            if (netplayEnabled) {
              const netplayPause = Module2.cwrap("netplay_request_pause", null, ["number"], { async: true });
              const pauseTargetBufferPtr = _malloc(4 * 4);
              pauseTargets.forEach(function(target, index) {
                Module2.setValue(pauseTargetBufferPtr + index * 4, target, "i32");
              });
              if (Module2.asyncAction) {
                return Module2.asyncAction.then(() => {
                  const pausePromise = new Promise(function(resolve, reject) {
                    Module2.netplay.pausePromiseResolve = resolve;
                    Module2.netplay.pausePromiseReject = reject;
                  });
                  return netplayPause(pauseTargetBufferPtr).then(() => {
                    _free(pauseTargetBufferPtr);
                  }).then(() => pausePromise);
                });
              } else {
                const pausePromise = new Promise(function(resolve, reject) {
                  Module2.netplay.pausePromiseResolve = resolve;
                  Module2.netplay.pausePromiseReject = reject;
                });
                const actionPromise = netplayPause(pauseTargetBufferPtr).then(() => {
                  _free(pauseTargetBufferPtr);
                }).then(() => {
                  return pausePromise;
                }).then((counts) => {
                  return counts;
                });
                Module2.asyncAction = actionPromise;
                return actionPromise;
              }
            } else {
              const pauseEmulator = Module2.cwrap("pauseEmulator", null, null, { async: true });
              if (Module2.asyncAction) {
                return Module2.asyncAction.then(() => pauseEmulator());
              } else {
                const asyncAction = pauseEmulator();
                Module2.asyncAction = asyncAction;
                return asyncAction;
              }
            }
          };
          const resume = function() {
            const netplayEnabled = Module2.netplayConfig && Module2.netplayConfig.player !== 0;
            if (netplayEnabled) {
              const netplayResume = Module2.cwrap("netplay_request_resume", null, null, { async: true });
              if (Module2.asyncAction) {
                Module2.asyncAction.then(() => netplayResume());
              } else {
                Module2.asyncAction = netplayResume();
              }
            } else {
              const resumeEmulator = Module2.cwrap("resumeEmulator", null, null, { async: true });
              if (Module2.asyncAction) {
                Module2.asyncAction.then(() => resumeEmulator());
              } else {
                Module2.asyncAction = resumeEmulator();
              }
            }
          };
          const forceDumpSaveFiles = function() {
            const doForceDumpSaveFiles = Module2.cwrap("dump_save_files", null, null, { async: true });
            if (Module2.asyncAction) {
              return Module2.asyncAction.then(() => doForceDumpSaveFiles());
            } else {
              const asyncAction = doForceDumpSaveFiles();
              Module2.asyncAction = asyncAction;
              return asyncAction;
            }
          };
          const resumeAudio = function() {
            if (Module2.SDL2 && Module2.SDL2.audioContext && Module2.SDL2.audioContext.state !== "running") {
              return Module2.SDL2.audioContext.resume();
            }
            return Promise.resolve();
          };
          const emulatorControls = {};
          emulatorControls.start = start;
          emulatorControls.stop = stop;
          emulatorControls.pause = pause;
          emulatorControls.resume = resume;
          emulatorControls.forceDumpSaveFiles = forceDumpSaveFiles;
          emulatorControls.resumeAudio = resumeAudio;
          Module2.emulatorControls = emulatorControls;
          return 0;
        }, 1722232: () => {
          return Module2.canvas.width;
        }, 1722264: () => {
          return Module2.canvas.height;
        }, 1722297: () => {
          const emuMode = Module2.coreConfig.emuMode;
          if (emuMode == 2 && Module2.netplayConfig.player !== 0) {
            throw "Invalid parameters! Cannnot use dynarec when netplay is enabled!";
          }
          return emuMode;
        }, 1722493: () => {
          return Module2.netplayConfig.player;
        }, 1722532: () => {
          FS.mkdir("/mupen64plus");
          FS.mount(IDBFS, {}, "/mupen64plus");
          return 0;
        }, 1722609: () => {
          return Module2.netplayConfig.registrationId;
        }, 1722657: ($0, $1) => {
          console.error("BAiLING on alist command processing due to acmd index: ", $0 | 0, " with pointer ", $1 | 0);
        }, 1722760: () => {
          return Module2.coreConfig.mainLoopTimingMode;
        }, 1722809: () => {
          return Module2.coreConfig.mainLoopTimingMode;
        }, 1722858: () => {
          return Module2.netplayConfig.registrationId;
        }, 1722906: ($0) => {
          const pauseCountsPtr = $0;
          const pauseCounts = [];
          for (let i2 = 0; i2 < 4; i2++) {
            pauseCounts[i2] = Module2.getValue(pauseCountsPtr + i2 * 4, "i32");
          }
          if (Module2.netplay.pausePromiseResolve) {
            Module2.netplay.pausePromiseResolve(pauseCounts);
          }
          return 0;
        }, 1723163: ($0) => {
          var str = UTF8ToString($0) + "\n\nAbort/Retry/Ignore/AlwaysIgnore? [ariA] :";
          var reply = window.prompt(str, "i");
          if (reply === null) {
            reply = "i";
          }
          return allocate(intArrayFromString(reply), "i8", ALLOC_NORMAL);
        }, 1723388: () => {
          if (typeof AudioContext !== "undefined") {
            return true;
          } else if (typeof webkitAudioContext !== "undefined") {
            return true;
          }
          return false;
        }, 1723535: () => {
          if (typeof navigator.mediaDevices !== "undefined" && typeof navigator.mediaDevices.getUserMedia !== "undefined") {
            return true;
          } else if (typeof navigator.webkitGetUserMedia !== "undefined") {
            return true;
          }
          return false;
        }, 1723769: ($0) => {
          if (typeof Module2["SDL2"] === "undefined") {
            Module2["SDL2"] = {};
          }
          var SDL2 = Module2["SDL2"];
          if (!$0) {
            SDL2.audio = {};
          } else {
            SDL2.capture = {};
          }
          if (!SDL2.audioContext) {
            if (typeof AudioContext !== "undefined") {
              SDL2.audioContext = new AudioContext();
            } else if (typeof webkitAudioContext !== "undefined") {
              SDL2.audioContext = new webkitAudioContext();
            }
            if (SDL2.audioContext) {
              autoResumeAudioContext(SDL2.audioContext);
            }
          }
          return SDL2.audioContext === void 0 ? -1 : 0;
        }, 1724262: () => {
          var SDL2 = Module2["SDL2"];
          return SDL2.audioContext.sampleRate;
        }, 1724330: ($0, $1, $2, $3) => {
          var SDL2 = Module2["SDL2"];
          var have_microphone = function(stream) {
            if (SDL2.capture.silenceTimer !== void 0) {
              clearTimeout(SDL2.capture.silenceTimer);
              SDL2.capture.silenceTimer = void 0;
            }
            SDL2.capture.mediaStreamNode = SDL2.audioContext.createMediaStreamSource(stream);
            SDL2.capture.scriptProcessorNode = SDL2.audioContext.createScriptProcessor($1, $0, 1);
            SDL2.capture.scriptProcessorNode.onaudioprocess = function(audioProcessingEvent) {
              if (SDL2 === void 0 || SDL2.capture === void 0) {
                return;
              }
              audioProcessingEvent.outputBuffer.getChannelData(0).fill(0);
              SDL2.capture.currentCaptureBuffer = audioProcessingEvent.inputBuffer;
              dynCall("vi", $2, [$3]);
            };
            SDL2.capture.mediaStreamNode.connect(SDL2.capture.scriptProcessorNode);
            SDL2.capture.scriptProcessorNode.connect(SDL2.audioContext.destination);
            SDL2.capture.stream = stream;
          };
          var no_microphone = function(error) {
          };
          SDL2.capture.silenceBuffer = SDL2.audioContext.createBuffer($0, $1, SDL2.audioContext.sampleRate);
          SDL2.capture.silenceBuffer.getChannelData(0).fill(0);
          var silence_callback = function() {
            SDL2.capture.currentCaptureBuffer = SDL2.capture.silenceBuffer;
            dynCall("vi", $2, [$3]);
          };
          SDL2.capture.silenceTimer = setTimeout(silence_callback, $1 / SDL2.audioContext.sampleRate * 1e3);
          if (navigator.mediaDevices !== void 0 && navigator.mediaDevices.getUserMedia !== void 0) {
            navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(have_microphone).catch(no_microphone);
          } else if (navigator.webkitGetUserMedia !== void 0) {
            navigator.webkitGetUserMedia({ audio: true, video: false }, have_microphone, no_microphone);
          }
        }, 1725982: ($0, $1, $2, $3) => {
          var SDL2 = Module2["SDL2"];
          SDL2.audio.scriptProcessorNode = SDL2.audioContext["createScriptProcessor"]($1, 0, $0);
          SDL2.audio.scriptProcessorNode["onaudioprocess"] = function(e) {
            if (SDL2 === void 0 || SDL2.audio === void 0) {
              return;
            }
            SDL2.audio.currentOutputBuffer = e["outputBuffer"];
            dynCall("vi", $2, [$3]);
          };
          SDL2.audio.scriptProcessorNode["connect"](SDL2.audioContext["destination"]);
        }, 1726392: ($0, $1) => {
          var SDL2 = Module2["SDL2"];
          var numChannels = SDL2.capture.currentCaptureBuffer.numberOfChannels;
          for (var c = 0; c < numChannels; ++c) {
            var channelData = SDL2.capture.currentCaptureBuffer.getChannelData(c);
            if (channelData.length != $1) {
              throw "Web Audio capture buffer length mismatch! Destination size: " + channelData.length + " samples vs expected " + $1 + " samples!";
            }
            if (numChannels == 1) {
              for (var j = 0; j < $1; ++j) {
                setValue($0 + j * 4, channelData[j], "float");
              }
            } else {
              for (var j = 0; j < $1; ++j) {
                setValue($0 + (j * numChannels + c) * 4, channelData[j], "float");
              }
            }
          }
        }, 1726997: ($0, $1) => {
          var SDL2 = Module2["SDL2"];
          var numChannels = SDL2.audio.currentOutputBuffer["numberOfChannels"];
          for (var c = 0; c < numChannels; ++c) {
            var channelData = SDL2.audio.currentOutputBuffer["getChannelData"](c);
            if (channelData.length != $1) {
              throw "Web Audio output buffer length mismatch! Destination size: " + channelData.length + " samples vs expected " + $1 + " samples!";
            }
            for (var j = 0; j < $1; ++j) {
              channelData[j] = HEAPF32[$0 + (j * numChannels + c << 2) >> 2];
            }
          }
        }, 1727477: ($0) => {
          var SDL2 = Module2["SDL2"];
          if ($0) {
            if (SDL2.capture.silenceTimer !== void 0) {
              clearTimeout(SDL2.capture.silenceTimer);
            }
            if (SDL2.capture.stream !== void 0) {
              var tracks = SDL2.capture.stream.getAudioTracks();
              for (var i2 = 0; i2 < tracks.length; i2++) {
                SDL2.capture.stream.removeTrack(tracks[i2]);
              }
              SDL2.capture.stream = void 0;
            }
            if (SDL2.capture.scriptProcessorNode !== void 0) {
              SDL2.capture.scriptProcessorNode.onaudioprocess = function(audioProcessingEvent) {
              };
              SDL2.capture.scriptProcessorNode.disconnect();
              SDL2.capture.scriptProcessorNode = void 0;
            }
            if (SDL2.capture.mediaStreamNode !== void 0) {
              SDL2.capture.mediaStreamNode.disconnect();
              SDL2.capture.mediaStreamNode = void 0;
            }
            if (SDL2.capture.silenceBuffer !== void 0) {
              SDL2.capture.silenceBuffer = void 0;
            }
            SDL2.capture = void 0;
          } else {
            if (SDL2.audio.scriptProcessorNode != void 0) {
              SDL2.audio.scriptProcessorNode.disconnect();
              SDL2.audio.scriptProcessorNode = void 0;
            }
            SDL2.audio = void 0;
          }
          if (SDL2.audioContext !== void 0 && SDL2.audio === void 0 && SDL2.capture === void 0) {
            SDL2.audioContext.close();
            SDL2.audioContext = void 0;
          }
        }, 1728649: ($0, $1, $2) => {
          var w = $0;
          var h = $1;
          var pixels = $2;
          if (!Module2["SDL2"]) Module2["SDL2"] = {};
          var SDL2 = Module2["SDL2"];
          if (SDL2.ctxCanvas !== Module2["canvas"]) {
            SDL2.ctx = Module2["createContext"](Module2["canvas"], false, true);
            SDL2.ctxCanvas = Module2["canvas"];
          }
          if (SDL2.w !== w || SDL2.h !== h || SDL2.imageCtx !== SDL2.ctx) {
            SDL2.image = SDL2.ctx.createImageData(w, h);
            SDL2.w = w;
            SDL2.h = h;
            SDL2.imageCtx = SDL2.ctx;
          }
          var data = SDL2.image.data;
          var src = pixels >> 2;
          var dst = 0;
          var num;
          if (typeof CanvasPixelArray !== "undefined" && data instanceof CanvasPixelArray) {
            num = data.length;
            while (dst < num) {
              var val = HEAP32[src];
              data[dst] = val & 255;
              data[dst + 1] = val >> 8 & 255;
              data[dst + 2] = val >> 16 & 255;
              data[dst + 3] = 255;
              src++;
              dst += 4;
            }
          } else {
            if (SDL2.data32Data !== data) {
              SDL2.data32 = new Int32Array(data.buffer);
              SDL2.data8 = new Uint8Array(data.buffer);
              SDL2.data32Data = data;
            }
            var data32 = SDL2.data32;
            num = data32.length;
            data32.set(HEAP32.subarray(src, src + num));
            var data8 = SDL2.data8;
            var i2 = 3;
            var j = i2 + 4 * num;
            if (num % 8 == 0) {
              while (i2 < j) {
                data8[i2] = 255;
                i2 = i2 + 4 | 0;
                data8[i2] = 255;
                i2 = i2 + 4 | 0;
                data8[i2] = 255;
                i2 = i2 + 4 | 0;
                data8[i2] = 255;
                i2 = i2 + 4 | 0;
                data8[i2] = 255;
                i2 = i2 + 4 | 0;
                data8[i2] = 255;
                i2 = i2 + 4 | 0;
                data8[i2] = 255;
                i2 = i2 + 4 | 0;
                data8[i2] = 255;
                i2 = i2 + 4 | 0;
              }
            } else {
              while (i2 < j) {
                data8[i2] = 255;
                i2 = i2 + 4 | 0;
              }
            }
          }
          SDL2.ctx.putImageData(SDL2.image, 0, 0);
        }, 1730118: ($0, $1, $2, $3, $4) => {
          var w = $0;
          var h = $1;
          var hot_x = $2;
          var hot_y = $3;
          var pixels = $4;
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          var image = ctx.createImageData(w, h);
          var data = image.data;
          var src = pixels >> 2;
          var dst = 0;
          var num;
          if (typeof CanvasPixelArray !== "undefined" && data instanceof CanvasPixelArray) {
            num = data.length;
            while (dst < num) {
              var val = HEAP32[src];
              data[dst] = val & 255;
              data[dst + 1] = val >> 8 & 255;
              data[dst + 2] = val >> 16 & 255;
              data[dst + 3] = val >> 24 & 255;
              src++;
              dst += 4;
            }
          } else {
            var data32 = new Int32Array(data.buffer);
            num = data32.length;
            data32.set(HEAP32.subarray(src, src + num));
          }
          ctx.putImageData(image, 0, 0);
          var url = hot_x === 0 && hot_y === 0 ? "url(" + canvas.toDataURL() + "), auto" : "url(" + canvas.toDataURL() + ") " + hot_x + " " + hot_y + ", auto";
          var urlBuf = _malloc(url.length + 1);
          stringToUTF8(url, urlBuf, url.length + 1);
          return urlBuf;
        }, 1731107: ($0) => {
          if (Module2["canvas"]) {
            Module2["canvas"].style["cursor"] = UTF8ToString($0);
          }
        }, 1731190: () => {
          if (Module2["canvas"]) {
            Module2["canvas"].style["cursor"] = "none";
          }
        }, 1731259: () => {
          return window.innerWidth;
        }, 1731289: () => {
          return window.innerHeight;
        } };
        function initIDBFS() {
          return Asyncify.handleAsync(function() {
            return new Promise(function(resolve, reject) {
              console.log("Initiating async IDBFS read from peristent storage.");
              FS.syncfs(true, function(err2) {
                console.log("sync complete!");
                if (err2) {
                  reject(err2);
                }
                resolve(0);
              });
            });
          });
        }
        function writeROM(romLocationStr) {
          return Asyncify.handleAsync(function() {
            return new Promise(function(resolve, reject) {
              const romLocation = UTF8ToString(romLocationStr);
              const path = romLocation.substr(0, romLocation.lastIndexOf("/"));
              const filename = romLocation.substr(romLocation.lastIndexOf("/") + 1);
              FS.writeFile(romLocation, new Uint8Array(Module2.romData));
              var contents = FS.readFile(romLocation, { encoding: "binary" });
              console.log("Written file contents: %o", contents);
              delete Module2.romData;
              resolve();
            });
          });
        }
        function copyInputAutoConfig() {
          return Asyncify.handleAsync(function() {
            return new Promise(function(resolve, reject) {
              const fileExists = FS.analyzePath("/mupen64plus/data/InputAutoCfg.ini", false).exists;
              if (!fileExists) {
                const contents = FS.readFile("/data/InputAutoCfg.ini", { encoding: "utf8" });
                const dataDirExists = FS.analyzePath("/mupen64plus/data", false).exists;
                if (!dataDirExists) {
                  FS.mkdir("/mupen64plus/data");
                }
                FS.writeFile("/mupen64plus/data/InputAutoCfg.ini", contents);
                FS.syncfs(false, function(err2) {
                  if (err2) {
                    reject(err2);
                  }
                  resolve();
                });
              } else {
                resolve();
              }
            });
          });
        }
        function startCore() {
          return Asyncify.handleAsync(function() {
            return new Promise(function(resolve, reject) {
              console.log("Starting game core");
              var doStartCore = Module2.cwrap("startEmulator", "number", ["number"], { async: true });
              doStartCore(0);
              console.log("Finished starting game core");
              resolve(0);
            });
          });
        }
        function loadRomConfigOptionOverride(configKey) {
          const config = UTF8ToString(configKey);
          const maybeRomConfigOptionOverrides = Module2.romConfigOptionOverrides;
          if (maybeRomConfigOptionOverrides) {
            const maybeRiceConfigOptionOverrides = maybeRomConfigOptionOverrides.videoRice;
            if (maybeRiceConfigOptionOverrides) {
              const maybeConfigOverride = maybeRiceConfigOptionOverrides[config];
              if (maybeConfigOverride != null) {
                return parseInt(maybeConfigOverride);
              }
            }
          }
          return -1;
        }
        function _emscripten_set_main_loop_timing(mode, value) {
          Browser.mainLoop.timingMode = mode;
          Browser.mainLoop.timingValue = value;
          if (!Browser.mainLoop.func) {
            return 1;
          }
          if (!Browser.mainLoop.running) {
            Browser.mainLoop.running = true;
          }
          if (mode == 0) {
            Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
              var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now()) | 0;
              setTimeout(Browser.mainLoop.runner, timeUntilNextTick);
            };
            Browser.mainLoop.method = "timeout";
          } else if (mode == 1) {
            Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
              Browser.requestAnimationFrame(Browser.mainLoop.runner);
            };
            Browser.mainLoop.method = "rAF";
          } else if (mode == 2) {
            if (typeof setImmediate == "undefined") {
              var setImmediates = [];
              var emscriptenMainLoopMessageId = "setimmediate";
              var Browser_setImmediate_messageHandler = (event2) => {
                if (event2.data === emscriptenMainLoopMessageId || event2.data.target === emscriptenMainLoopMessageId) {
                  event2.stopPropagation();
                  setImmediates.shift()();
                }
              };
              addEventListener("message", Browser_setImmediate_messageHandler, true);
              setImmediate = function Browser_emulated_setImmediate(func) {
                setImmediates.push(func);
                if (ENVIRONMENT_IS_WORKER) {
                  if (Module2["setImmediates"] === void 0) Module2["setImmediates"] = [];
                  Module2["setImmediates"].push(func);
                  postMessage({ target: emscriptenMainLoopMessageId });
                } else postMessage(emscriptenMainLoopMessageId, "*");
              };
            }
            Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
              setImmediate(Browser.mainLoop.runner);
            };
            Browser.mainLoop.method = "immediate";
          }
          return 0;
        }
        Module2["_emscripten_set_main_loop_timing"] = _emscripten_set_main_loop_timing;
        var _emscripten_get_now;
        _emscripten_get_now = () => performance.now();
        Module2["_emscripten_get_now"] = _emscripten_get_now;
        function ExitStatus(status) {
          this.name = "ExitStatus";
          this.message = "Program terminated with exit(" + status + ")";
          this.status = status;
        }
        Module2["ExitStatus"] = ExitStatus;
        var PATH = { isAbs: (path) => path.charAt(0) === "/", splitPath: (filename) => {
          var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
          return splitPathRe.exec(filename).slice(1);
        }, normalizeArray: (parts, allowAboveRoot) => {
          var up = 0;
          for (var i2 = parts.length - 1; i2 >= 0; i2--) {
            var last = parts[i2];
            if (last === ".") {
              parts.splice(i2, 1);
            } else if (last === "..") {
              parts.splice(i2, 1);
              up++;
            } else if (up) {
              parts.splice(i2, 1);
              up--;
            }
          }
          if (allowAboveRoot) {
            for (; up; up--) {
              parts.unshift("..");
            }
          }
          return parts;
        }, normalize: (path) => {
          var isAbsolute = PATH.isAbs(path), trailingSlash = path.substr(-1) === "/";
          path = PATH.normalizeArray(path.split("/").filter((p) => !!p), !isAbsolute).join("/");
          if (!path && !isAbsolute) {
            path = ".";
          }
          if (path && trailingSlash) {
            path += "/";
          }
          return (isAbsolute ? "/" : "") + path;
        }, dirname: (path) => {
          var result = PATH.splitPath(path), root = result[0], dir = result[1];
          if (!root && !dir) {
            return ".";
          }
          if (dir) {
            dir = dir.substr(0, dir.length - 1);
          }
          return root + dir;
        }, basename: (path) => {
          if (path === "/") return "/";
          path = PATH.normalize(path);
          path = path.replace(/\/$/, "");
          var lastSlash = path.lastIndexOf("/");
          if (lastSlash === -1) return path;
          return path.substr(lastSlash + 1);
        }, join: function() {
          var paths = Array.prototype.slice.call(arguments);
          return PATH.normalize(paths.join("/"));
        }, join2: (l, r) => {
          return PATH.normalize(l + "/" + r);
        } };
        Module2["PATH"] = PATH;
        function getRandomDevice() {
          if (typeof crypto == "object" && typeof crypto["getRandomValues"] == "function") {
            var randomBuffer = new Uint8Array(1);
            return () => {
              crypto.getRandomValues(randomBuffer);
              return randomBuffer[0];
            };
          } else return () => abort("randomDevice");
        }
        Module2["getRandomDevice"] = getRandomDevice;
        var PATH_FS = { resolve: function() {
          var resolvedPath = "", resolvedAbsolute = false;
          for (var i2 = arguments.length - 1; i2 >= -1 && !resolvedAbsolute; i2--) {
            var path = i2 >= 0 ? arguments[i2] : FS.cwd();
            if (typeof path != "string") {
              throw new TypeError("Arguments to path.resolve must be strings");
            } else if (!path) {
              return "";
            }
            resolvedPath = path + "/" + resolvedPath;
            resolvedAbsolute = PATH.isAbs(path);
          }
          resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter((p) => !!p), !resolvedAbsolute).join("/");
          return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
        }, relative: (from, to) => {
          from = PATH_FS.resolve(from).substr(1);
          to = PATH_FS.resolve(to).substr(1);
          function trim2(arr) {
            var start = 0;
            for (; start < arr.length; start++) {
              if (arr[start] !== "") break;
            }
            var end = arr.length - 1;
            for (; end >= 0; end--) {
              if (arr[end] !== "") break;
            }
            if (start > end) return [];
            return arr.slice(start, end - start + 1);
          }
          var fromParts = trim2(from.split("/"));
          var toParts = trim2(to.split("/"));
          var length = Math.min(fromParts.length, toParts.length);
          var samePartsLength = length;
          for (var i2 = 0; i2 < length; i2++) {
            if (fromParts[i2] !== toParts[i2]) {
              samePartsLength = i2;
              break;
            }
          }
          var outputParts = [];
          for (var i2 = samePartsLength; i2 < fromParts.length; i2++) {
            outputParts.push("..");
          }
          outputParts = outputParts.concat(toParts.slice(samePartsLength));
          return outputParts.join("/");
        } };
        Module2["PATH_FS"] = PATH_FS;
        function intArrayFromString(stringy, dontAddNull, length) {
          var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
          var u8array = new Array(len);
          var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
          if (dontAddNull) u8array.length = numBytesWritten;
          return u8array;
        }
        Module2["intArrayFromString"] = intArrayFromString;
        var TTY = { ttys: [], init: function() {
        }, shutdown: function() {
        }, register: function(dev, ops) {
          TTY.ttys[dev] = { input: [], output: [], ops };
          FS.registerDevice(dev, TTY.stream_ops);
        }, stream_ops: { open: function(stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(43);
          }
          stream.tty = tty;
          stream.seekable = false;
        }, close: function(stream) {
          stream.tty.ops.fsync(stream.tty);
        }, fsync: function(stream) {
          stream.tty.ops.fsync(stream.tty);
        }, read: function(stream, buffer2, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(60);
          }
          var bytesRead = 0;
          for (var i2 = 0; i2 < length; i2++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
            if (result === void 0 && bytesRead === 0) {
              throw new FS.ErrnoError(6);
            }
            if (result === null || result === void 0) break;
            bytesRead++;
            buffer2[offset + i2] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        }, write: function(stream, buffer2, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(60);
          }
          try {
            for (var i2 = 0; i2 < length; i2++) {
              stream.tty.ops.put_char(stream.tty, buffer2[offset + i2]);
            }
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i2;
        } }, default_tty_ops: { get_char: function(tty) {
          if (!tty.input.length) {
            var result = null;
            if (typeof window != "undefined" && typeof window.prompt == "function") {
              result = window.prompt("Input: ");
              if (result !== null) {
                result += "\n";
              }
            } else if (typeof readline == "function") {
              result = readline();
              if (result !== null) {
                result += "\n";
              }
            }
            if (!result) {
              return null;
            }
            tty.input = intArrayFromString(result, true);
          }
          return tty.input.shift();
        }, put_char: function(tty, val) {
          if (val === null || val === 10) {
            out(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        }, fsync: function(tty) {
          if (tty.output && tty.output.length > 0) {
            out(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        } }, default_tty1_ops: { put_char: function(tty, val) {
          if (val === null || val === 10) {
            err(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        }, fsync: function(tty) {
          if (tty.output && tty.output.length > 0) {
            err(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        } } };
        Module2["TTY"] = TTY;
        function zeroMemory(address, size) {
          HEAPU8.fill(0, address, address + size);
          return address;
        }
        Module2["zeroMemory"] = zeroMemory;
        function alignMemory(size, alignment) {
          return Math.ceil(size / alignment) * alignment;
        }
        Module2["alignMemory"] = alignMemory;
        function mmapAlloc(size) {
          size = alignMemory(size, 65536);
          var ptr = _emscripten_builtin_memalign(65536, size);
          if (!ptr) return 0;
          return zeroMemory(ptr, size);
        }
        Module2["mmapAlloc"] = mmapAlloc;
        var MEMFS = { ops_table: null, mount: function(mount) {
          return MEMFS.createNode(null, "/", 16384 | 511, 0);
        }, createNode: function(parent, name, mode, dev) {
          if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
            throw new FS.ErrnoError(63);
          }
          if (!MEMFS.ops_table) {
            MEMFS.ops_table = { dir: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr, lookup: MEMFS.node_ops.lookup, mknod: MEMFS.node_ops.mknod, rename: MEMFS.node_ops.rename, unlink: MEMFS.node_ops.unlink, rmdir: MEMFS.node_ops.rmdir, readdir: MEMFS.node_ops.readdir, symlink: MEMFS.node_ops.symlink }, stream: { llseek: MEMFS.stream_ops.llseek } }, file: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr }, stream: { llseek: MEMFS.stream_ops.llseek, read: MEMFS.stream_ops.read, write: MEMFS.stream_ops.write, allocate: MEMFS.stream_ops.allocate, mmap: MEMFS.stream_ops.mmap, msync: MEMFS.stream_ops.msync } }, link: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr, readlink: MEMFS.node_ops.readlink }, stream: {} }, chrdev: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr }, stream: FS.chrdev_stream_ops } };
          }
          var node = FS.createNode(parent, name, mode, dev);
          if (FS.isDir(node.mode)) {
            node.node_ops = MEMFS.ops_table.dir.node;
            node.stream_ops = MEMFS.ops_table.dir.stream;
            node.contents = {};
          } else if (FS.isFile(node.mode)) {
            node.node_ops = MEMFS.ops_table.file.node;
            node.stream_ops = MEMFS.ops_table.file.stream;
            node.usedBytes = 0;
            node.contents = null;
          } else if (FS.isLink(node.mode)) {
            node.node_ops = MEMFS.ops_table.link.node;
            node.stream_ops = MEMFS.ops_table.link.stream;
          } else if (FS.isChrdev(node.mode)) {
            node.node_ops = MEMFS.ops_table.chrdev.node;
            node.stream_ops = MEMFS.ops_table.chrdev.stream;
          }
          node.timestamp = Date.now();
          if (parent) {
            parent.contents[name] = node;
            parent.timestamp = node.timestamp;
          }
          return node;
        }, getFileDataAsTypedArray: function(node) {
          if (!node.contents) return new Uint8Array(0);
          if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
          return new Uint8Array(node.contents);
        }, expandFileStorage: function(node, newCapacity) {
          var prevCapacity = node.contents ? node.contents.length : 0;
          if (prevCapacity >= newCapacity) return;
          var CAPACITY_DOUBLING_MAX = 1024 * 1024;
          newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
          if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
          var oldContents = node.contents;
          node.contents = new Uint8Array(newCapacity);
          if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
        }, resizeFileStorage: function(node, newSize) {
          if (node.usedBytes == newSize) return;
          if (newSize == 0) {
            node.contents = null;
            node.usedBytes = 0;
          } else {
            var oldContents = node.contents;
            node.contents = new Uint8Array(newSize);
            if (oldContents) {
              node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
            }
            node.usedBytes = newSize;
          }
        }, node_ops: { getattr: function(node) {
          var attr = {};
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        }, setattr: function(node, attr) {
          if (attr.mode !== void 0) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== void 0) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== void 0) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        }, lookup: function(parent, name) {
          throw FS.genericErrors[44];
        }, mknod: function(parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        }, rename: function(old_node, new_dir, new_name) {
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i2 in new_node.contents) {
                throw new FS.ErrnoError(55);
              }
            }
          }
          delete old_node.parent.contents[old_node.name];
          old_node.parent.timestamp = Date.now();
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          new_dir.timestamp = old_node.parent.timestamp;
          old_node.parent = new_dir;
        }, unlink: function(parent, name) {
          delete parent.contents[name];
          parent.timestamp = Date.now();
        }, rmdir: function(parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i2 in node.contents) {
            throw new FS.ErrnoError(55);
          }
          delete parent.contents[name];
          parent.timestamp = Date.now();
        }, readdir: function(node) {
          var entries = [".", ".."];
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        }, symlink: function(parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
          node.link = oldpath;
          return node;
        }, readlink: function(node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(28);
          }
          return node.link;
        } }, stream_ops: { read: function(stream, buffer2, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          if (size > 8 && contents.subarray) {
            buffer2.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i2 = 0; i2 < size; i2++) buffer2[offset + i2] = contents[position + i2];
          }
          return size;
        }, write: function(stream, buffer2, offset, length, position, canOwn) {
          if (buffer2.buffer === HEAP8.buffer) {
            canOwn = false;
          }
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
          if (buffer2.subarray && (!node.contents || node.contents.subarray)) {
            if (canOwn) {
              node.contents = buffer2.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) {
              node.contents = buffer2.slice(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) {
              node.contents.set(buffer2.subarray(offset, offset + length), position);
              return length;
            }
          }
          MEMFS.expandFileStorage(node, position + length);
          if (node.contents.subarray && buffer2.subarray) {
            node.contents.set(buffer2.subarray(offset, offset + length), position);
          } else {
            for (var i2 = 0; i2 < length; i2++) {
              node.contents[position + i2] = buffer2[offset + i2];
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position + length);
          return length;
        }, llseek: function(stream, offset, whence) {
          var position = offset;
          if (whence === 1) {
            position += stream.position;
          } else if (whence === 2) {
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(28);
          }
          return position;
        }, allocate: function(stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        }, mmap: function(stream, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          if (!(flags & 2) && contents.buffer === buffer) {
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            if (position > 0 || position + length < contents.length) {
              if (contents.subarray) {
                contents = contents.subarray(position, position + length);
              } else {
                contents = Array.prototype.slice.call(contents, position, position + length);
              }
            }
            allocated = true;
            ptr = mmapAlloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(48);
            }
            HEAP8.set(contents, ptr);
          }
          return { ptr, allocated };
        }, msync: function(stream, buffer2, offset, length, mmapFlags) {
          MEMFS.stream_ops.write(stream, buffer2, 0, length, offset, false);
          return 0;
        } } };
        Module2["MEMFS"] = MEMFS;
        function asyncLoad(url, onload, onerror, noRunDep) {
          var dep = !noRunDep ? getUniqueRunDependency("al " + url) : "";
          readAsync(url, (arrayBuffer) => {
            assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
            onload(new Uint8Array(arrayBuffer));
            if (dep) removeRunDependency(dep);
          }, (event2) => {
            if (onerror) {
              onerror();
            } else {
              throw 'Loading data file "' + url + '" failed.';
            }
          });
          if (dep) addRunDependency(dep);
        }
        Module2["asyncLoad"] = asyncLoad;
        var IDBFS = { dbs: {}, indexedDB: () => {
          if (typeof indexedDB != "undefined") return indexedDB;
          var ret = null;
          if (typeof window == "object") ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
          assert(ret, "IDBFS used, but indexedDB not supported");
          return ret;
        }, DB_VERSION: 21, DB_STORE_NAME: "FILE_DATA", mount: function(mount) {
          return MEMFS.mount.apply(null, arguments);
        }, syncfs: (mount, populate, callback) => {
          IDBFS.getLocalSet(mount, (err2, local) => {
            if (err2) return callback(err2);
            IDBFS.getRemoteSet(mount, (err3, remote) => {
              if (err3) return callback(err3);
              var src = populate ? remote : local;
              var dst = populate ? local : remote;
              IDBFS.reconcile(src, dst, callback);
            });
          });
        }, quit: () => {
          Object.values(IDBFS.dbs).forEach((value) => value.close());
          IDBFS.dbs = {};
        }, getDB: (name, callback) => {
          var db = IDBFS.dbs[name];
          if (db) {
            return callback(null, db);
          }
          var req;
          try {
            req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
          } catch (e) {
            return callback(e);
          }
          if (!req) {
            return callback("Unable to connect to IndexedDB");
          }
          req.onupgradeneeded = (e) => {
            var db2 = e.target.result;
            var transaction = e.target.transaction;
            var fileStore;
            if (db2.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
              fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
            } else {
              fileStore = db2.createObjectStore(IDBFS.DB_STORE_NAME);
            }
            if (!fileStore.indexNames.contains("timestamp")) {
              fileStore.createIndex("timestamp", "timestamp", { unique: false });
            }
          };
          req.onsuccess = () => {
            db = req.result;
            IDBFS.dbs[name] = db;
            callback(null, db);
          };
          req.onerror = (e) => {
            callback(this.error);
            e.preventDefault();
          };
        }, getLocalSet: (mount, callback) => {
          var entries = {};
          function isRealDir(p) {
            return p !== "." && p !== "..";
          }
          function toAbsolute(root) {
            return (p) => {
              return PATH.join2(root, p);
            };
          }
          var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
          while (check.length) {
            var path = check.pop();
            var stat;
            try {
              stat = FS.stat(path);
            } catch (e) {
              return callback(e);
            }
            if (FS.isDir(stat.mode)) {
              check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
            }
            entries[path] = { "timestamp": stat.mtime };
          }
          return callback(null, { type: "local", entries });
        }, getRemoteSet: (mount, callback) => {
          var entries = {};
          IDBFS.getDB(mount.mountpoint, (err2, db) => {
            if (err2) return callback(err2);
            try {
              var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readonly");
              transaction.onerror = (e) => {
                callback(this.error);
                e.preventDefault();
              };
              var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
              var index = store.index("timestamp");
              index.openKeyCursor().onsuccess = (event2) => {
                var cursor = event2.target.result;
                if (!cursor) {
                  return callback(null, { type: "remote", db, entries });
                }
                entries[cursor.primaryKey] = { "timestamp": cursor.key };
                cursor.continue();
              };
            } catch (e) {
              return callback(e);
            }
          });
        }, loadLocalEntry: (path, callback) => {
          var stat, node;
          try {
            var lookup = FS.lookupPath(path);
            node = lookup.node;
            stat = FS.stat(path);
          } catch (e) {
            return callback(e);
          }
          if (FS.isDir(stat.mode)) {
            return callback(null, { "timestamp": stat.mtime, "mode": stat.mode });
          } else if (FS.isFile(stat.mode)) {
            node.contents = MEMFS.getFileDataAsTypedArray(node);
            return callback(null, { "timestamp": stat.mtime, "mode": stat.mode, "contents": node.contents });
          } else {
            return callback(new Error("node type not supported"));
          }
        }, storeLocalEntry: (path, entry, callback) => {
          try {
            if (FS.isDir(entry["mode"])) {
              FS.mkdirTree(path, entry["mode"]);
            } else if (FS.isFile(entry["mode"])) {
              FS.writeFile(path, entry["contents"], { canOwn: true });
            } else {
              return callback(new Error("node type not supported"));
            }
            FS.chmod(path, entry["mode"]);
            FS.utime(path, entry["timestamp"], entry["timestamp"]);
          } catch (e) {
            return callback(e);
          }
          callback(null);
        }, removeLocalEntry: (path, callback) => {
          try {
            var stat = FS.stat(path);
            if (FS.isDir(stat.mode)) {
              FS.rmdir(path);
            } else if (FS.isFile(stat.mode)) {
              FS.unlink(path);
            }
          } catch (e) {
            return callback(e);
          }
          callback(null);
        }, loadRemoteEntry: (store, path, callback) => {
          var req = store.get(path);
          req.onsuccess = (event2) => {
            callback(null, event2.target.result);
          };
          req.onerror = (e) => {
            callback(this.error);
            e.preventDefault();
          };
        }, storeRemoteEntry: (store, path, entry, callback) => {
          try {
            var req = store.put(entry, path);
          } catch (e) {
            callback(e);
            return;
          }
          req.onsuccess = () => {
            callback(null);
          };
          req.onerror = (e) => {
            callback(this.error);
            e.preventDefault();
          };
        }, removeRemoteEntry: (store, path, callback) => {
          var req = store.delete(path);
          req.onsuccess = () => {
            callback(null);
          };
          req.onerror = (e) => {
            callback(this.error);
            e.preventDefault();
          };
        }, reconcile: (src, dst, callback) => {
          var total = 0;
          var create = [];
          Object.keys(src.entries).forEach(function(key) {
            var e = src.entries[key];
            var e2 = dst.entries[key];
            if (!e2 || e["timestamp"].getTime() != e2["timestamp"].getTime()) {
              create.push(key);
              total++;
            }
          });
          var remove = [];
          Object.keys(dst.entries).forEach(function(key) {
            if (!src.entries[key]) {
              remove.push(key);
              total++;
            }
          });
          if (!total) {
            return callback(null);
          }
          var errored = false;
          var db = src.type === "remote" ? src.db : dst.db;
          var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readwrite");
          var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
          function done(err2) {
            if (err2 && !errored) {
              errored = true;
              return callback(err2);
            }
          }
          transaction.onerror = (e) => {
            done(this.error);
            e.preventDefault();
          };
          transaction.oncomplete = (e) => {
            if (!errored) {
              callback(null);
            }
          };
          create.sort().forEach((path) => {
            if (dst.type === "local") {
              IDBFS.loadRemoteEntry(store, path, (err2, entry) => {
                if (err2) return done(err2);
                IDBFS.storeLocalEntry(path, entry, done);
              });
            } else {
              IDBFS.loadLocalEntry(path, (err2, entry) => {
                if (err2) return done(err2);
                IDBFS.storeRemoteEntry(store, path, entry, done);
              });
            }
          });
          remove.sort().reverse().forEach((path) => {
            if (dst.type === "local") {
              IDBFS.removeLocalEntry(path, done);
            } else {
              IDBFS.removeRemoteEntry(store, path, done);
            }
          });
        } };
        Module2["IDBFS"] = IDBFS;
        var FS = { root: null, mounts: [], devices: {}, streams: [], nextInode: 1, nameTable: null, currentPath: "/", initialized: false, ignorePermissions: true, ErrnoError: null, genericErrors: {}, filesystems: null, syncFSRequests: 0, lookupPath: (path, opts = {}) => {
          path = PATH_FS.resolve(path);
          if (!path) return { path: "", node: null };
          var defaults2 = { follow_mount: true, recurse_count: 0 };
          opts = Object.assign(defaults2, opts);
          if (opts.recurse_count > 8) {
            throw new FS.ErrnoError(32);
          }
          var parts = path.split("/").filter((p) => !!p);
          var current = FS.root;
          var current_path = "/";
          for (var i2 = 0; i2 < parts.length; i2++) {
            var islast = i2 === parts.length - 1;
            if (islast && opts.parent) {
              break;
            }
            current = FS.lookupNode(current, parts[i2]);
            current_path = PATH.join2(current_path, parts[i2]);
            if (FS.isMountpoint(current)) {
              if (!islast || islast && opts.follow_mount) {
                current = current.mounted.root;
              }
            }
            if (!islast || opts.follow) {
              var count = 0;
              while (FS.isLink(current.mode)) {
                var link = FS.readlink(current_path);
                current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
                var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count + 1 });
                current = lookup.node;
                if (count++ > 40) {
                  throw new FS.ErrnoError(32);
                }
              }
            }
          }
          return { path: current_path, node: current };
        }, getPath: (node) => {
          var path;
          while (true) {
            if (FS.isRoot(node)) {
              var mount = node.mount.mountpoint;
              if (!path) return mount;
              return mount[mount.length - 1] !== "/" ? mount + "/" + path : mount + path;
            }
            path = path ? node.name + "/" + path : node.name;
            node = node.parent;
          }
        }, hashName: (parentid, name) => {
          var hash = 0;
          for (var i2 = 0; i2 < name.length; i2++) {
            hash = (hash << 5) - hash + name.charCodeAt(i2) | 0;
          }
          return (parentid + hash >>> 0) % FS.nameTable.length;
        }, hashAddNode: (node) => {
          var hash = FS.hashName(node.parent.id, node.name);
          node.name_next = FS.nameTable[hash];
          FS.nameTable[hash] = node;
        }, hashRemoveNode: (node) => {
          var hash = FS.hashName(node.parent.id, node.name);
          if (FS.nameTable[hash] === node) {
            FS.nameTable[hash] = node.name_next;
          } else {
            var current = FS.nameTable[hash];
            while (current) {
              if (current.name_next === node) {
                current.name_next = node.name_next;
                break;
              }
              current = current.name_next;
            }
          }
        }, lookupNode: (parent, name) => {
          var errCode = FS.mayLookup(parent);
          if (errCode) {
            throw new FS.ErrnoError(errCode, parent);
          }
          var hash = FS.hashName(parent.id, name);
          for (var node = FS.nameTable[hash]; node; node = node.name_next) {
            var nodeName = node.name;
            if (node.parent.id === parent.id && nodeName === name) {
              return node;
            }
          }
          return FS.lookup(parent, name);
        }, createNode: (parent, name, mode, rdev) => {
          var node = new FS.FSNode(parent, name, mode, rdev);
          FS.hashAddNode(node);
          return node;
        }, destroyNode: (node) => {
          FS.hashRemoveNode(node);
        }, isRoot: (node) => {
          return node === node.parent;
        }, isMountpoint: (node) => {
          return !!node.mounted;
        }, isFile: (mode) => {
          return (mode & 61440) === 32768;
        }, isDir: (mode) => {
          return (mode & 61440) === 16384;
        }, isLink: (mode) => {
          return (mode & 61440) === 40960;
        }, isChrdev: (mode) => {
          return (mode & 61440) === 8192;
        }, isBlkdev: (mode) => {
          return (mode & 61440) === 24576;
        }, isFIFO: (mode) => {
          return (mode & 61440) === 4096;
        }, isSocket: (mode) => {
          return (mode & 49152) === 49152;
        }, flagModes: { "r": 0, "r+": 2, "w": 577, "w+": 578, "a": 1089, "a+": 1090 }, modeStringToFlags: (str) => {
          var flags = FS.flagModes[str];
          if (typeof flags == "undefined") {
            throw new Error("Unknown file open mode: " + str);
          }
          return flags;
        }, flagsToPermissionString: (flag) => {
          var perms = ["r", "w", "rw"][flag & 3];
          if (flag & 512) {
            perms += "w";
          }
          return perms;
        }, nodePermissions: (node, perms) => {
          if (FS.ignorePermissions) {
            return 0;
          }
          if (perms.includes("r") && !(node.mode & 292)) {
            return 2;
          } else if (perms.includes("w") && !(node.mode & 146)) {
            return 2;
          } else if (perms.includes("x") && !(node.mode & 73)) {
            return 2;
          }
          return 0;
        }, mayLookup: (dir) => {
          var errCode = FS.nodePermissions(dir, "x");
          if (errCode) return errCode;
          if (!dir.node_ops.lookup) return 2;
          return 0;
        }, mayCreate: (dir, name) => {
          try {
            var node = FS.lookupNode(dir, name);
            return 20;
          } catch (e) {
          }
          return FS.nodePermissions(dir, "wx");
        }, mayDelete: (dir, name, isdir) => {
          var node;
          try {
            node = FS.lookupNode(dir, name);
          } catch (e) {
            return e.errno;
          }
          var errCode = FS.nodePermissions(dir, "wx");
          if (errCode) {
            return errCode;
          }
          if (isdir) {
            if (!FS.isDir(node.mode)) {
              return 54;
            }
            if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
              return 10;
            }
          } else {
            if (FS.isDir(node.mode)) {
              return 31;
            }
          }
          return 0;
        }, mayOpen: (node, flags) => {
          if (!node) {
            return 44;
          }
          if (FS.isLink(node.mode)) {
            return 32;
          } else if (FS.isDir(node.mode)) {
            if (FS.flagsToPermissionString(flags) !== "r" || flags & 512) {
              return 31;
            }
          }
          return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
        }, MAX_OPEN_FDS: 4096, nextfd: (fd_start = 0, fd_end = FS.MAX_OPEN_FDS) => {
          for (var fd = fd_start; fd <= fd_end; fd++) {
            if (!FS.streams[fd]) {
              return fd;
            }
          }
          throw new FS.ErrnoError(33);
        }, getStream: (fd) => FS.streams[fd], createStream: (stream, fd_start, fd_end) => {
          if (!FS.FSStream) {
            FS.FSStream = function() {
              this.shared = {};
            };
            FS.FSStream.prototype = {};
            Object.defineProperties(FS.FSStream.prototype, { object: { get: function() {
              return this.node;
            }, set: function(val) {
              this.node = val;
            } }, isRead: { get: function() {
              return (this.flags & 2097155) !== 1;
            } }, isWrite: { get: function() {
              return (this.flags & 2097155) !== 0;
            } }, isAppend: { get: function() {
              return this.flags & 1024;
            } }, flags: { get: function() {
              return this.shared.flags;
            }, set: function(val) {
              this.shared.flags = val;
            } }, position: { get: function() {
              return this.shared.position;
            }, set: function(val) {
              this.shared.position = val;
            } } });
          }
          stream = Object.assign(new FS.FSStream(), stream);
          var fd = FS.nextfd(fd_start, fd_end);
          stream.fd = fd;
          FS.streams[fd] = stream;
          return stream;
        }, closeStream: (fd) => {
          FS.streams[fd] = null;
        }, chrdev_stream_ops: { open: (stream) => {
          var device = FS.getDevice(stream.node.rdev);
          stream.stream_ops = device.stream_ops;
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
        }, llseek: () => {
          throw new FS.ErrnoError(70);
        } }, major: (dev) => dev >> 8, minor: (dev) => dev & 255, makedev: (ma, mi) => ma << 8 | mi, registerDevice: (dev, ops) => {
          FS.devices[dev] = { stream_ops: ops };
        }, getDevice: (dev) => FS.devices[dev], getMounts: (mount) => {
          var mounts = [];
          var check = [mount];
          while (check.length) {
            var m = check.pop();
            mounts.push(m);
            check.push.apply(check, m.mounts);
          }
          return mounts;
        }, syncfs: (populate, callback) => {
          if (typeof populate == "function") {
            callback = populate;
            populate = false;
          }
          FS.syncFSRequests++;
          if (FS.syncFSRequests > 1) {
            err("warning: " + FS.syncFSRequests + " FS.syncfs operations in flight at once, probably just doing extra work");
          }
          var mounts = FS.getMounts(FS.root.mount);
          var completed = 0;
          function doCallback(errCode) {
            FS.syncFSRequests--;
            return callback(errCode);
          }
          function done(errCode) {
            if (errCode) {
              if (!done.errored) {
                done.errored = true;
                return doCallback(errCode);
              }
              return;
            }
            if (++completed >= mounts.length) {
              doCallback(null);
            }
          }
          mounts.forEach((mount) => {
            if (!mount.type.syncfs) {
              return done(null);
            }
            mount.type.syncfs(mount, populate, done);
          });
        }, mount: (type, opts, mountpoint) => {
          var root = mountpoint === "/";
          var pseudo = !mountpoint;
          var node;
          if (root && FS.root) {
            throw new FS.ErrnoError(10);
          } else if (!root && !pseudo) {
            var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
            mountpoint = lookup.path;
            node = lookup.node;
            if (FS.isMountpoint(node)) {
              throw new FS.ErrnoError(10);
            }
            if (!FS.isDir(node.mode)) {
              throw new FS.ErrnoError(54);
            }
          }
          var mount = { type, opts, mountpoint, mounts: [] };
          var mountRoot = type.mount(mount);
          mountRoot.mount = mount;
          mount.root = mountRoot;
          if (root) {
            FS.root = mountRoot;
          } else if (node) {
            node.mounted = mount;
            if (node.mount) {
              node.mount.mounts.push(mount);
            }
          }
          return mountRoot;
        }, unmount: (mountpoint) => {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
          if (!FS.isMountpoint(lookup.node)) {
            throw new FS.ErrnoError(28);
          }
          var node = lookup.node;
          var mount = node.mounted;
          var mounts = FS.getMounts(mount);
          Object.keys(FS.nameTable).forEach((hash) => {
            var current = FS.nameTable[hash];
            while (current) {
              var next = current.name_next;
              if (mounts.includes(current.mount)) {
                FS.destroyNode(current);
              }
              current = next;
            }
          });
          node.mounted = null;
          var idx = node.mount.mounts.indexOf(mount);
          node.mount.mounts.splice(idx, 1);
        }, lookup: (parent, name) => {
          return parent.node_ops.lookup(parent, name);
        }, mknod: (path, mode, dev) => {
          var lookup = FS.lookupPath(path, { parent: true });
          var parent = lookup.node;
          var name = PATH.basename(path);
          if (!name || name === "." || name === "..") {
            throw new FS.ErrnoError(28);
          }
          var errCode = FS.mayCreate(parent, name);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          if (!parent.node_ops.mknod) {
            throw new FS.ErrnoError(63);
          }
          return parent.node_ops.mknod(parent, name, mode, dev);
        }, create: (path, mode) => {
          mode = mode !== void 0 ? mode : 438;
          mode &= 4095;
          mode |= 32768;
          return FS.mknod(path, mode, 0);
        }, mkdir: (path, mode) => {
          mode = mode !== void 0 ? mode : 511;
          mode &= 511 | 512;
          mode |= 16384;
          return FS.mknod(path, mode, 0);
        }, mkdirTree: (path, mode) => {
          var dirs = path.split("/");
          var d = "";
          for (var i2 = 0; i2 < dirs.length; ++i2) {
            if (!dirs[i2]) continue;
            d += "/" + dirs[i2];
            try {
              FS.mkdir(d, mode);
            } catch (e) {
              if (e.errno != 20) throw e;
            }
          }
        }, mkdev: (path, mode, dev) => {
          if (typeof dev == "undefined") {
            dev = mode;
            mode = 438;
          }
          mode |= 8192;
          return FS.mknod(path, mode, dev);
        }, symlink: (oldpath, newpath) => {
          if (!PATH_FS.resolve(oldpath)) {
            throw new FS.ErrnoError(44);
          }
          var lookup = FS.lookupPath(newpath, { parent: true });
          var parent = lookup.node;
          if (!parent) {
            throw new FS.ErrnoError(44);
          }
          var newname = PATH.basename(newpath);
          var errCode = FS.mayCreate(parent, newname);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          if (!parent.node_ops.symlink) {
            throw new FS.ErrnoError(63);
          }
          return parent.node_ops.symlink(parent, newname, oldpath);
        }, rename: (old_path, new_path) => {
          var old_dirname = PATH.dirname(old_path);
          var new_dirname = PATH.dirname(new_path);
          var old_name = PATH.basename(old_path);
          var new_name = PATH.basename(new_path);
          var lookup, old_dir, new_dir;
          lookup = FS.lookupPath(old_path, { parent: true });
          old_dir = lookup.node;
          lookup = FS.lookupPath(new_path, { parent: true });
          new_dir = lookup.node;
          if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
          if (old_dir.mount !== new_dir.mount) {
            throw new FS.ErrnoError(75);
          }
          var old_node = FS.lookupNode(old_dir, old_name);
          var relative = PATH_FS.relative(old_path, new_dirname);
          if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(28);
          }
          relative = PATH_FS.relative(new_path, old_dirname);
          if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(55);
          }
          var new_node;
          try {
            new_node = FS.lookupNode(new_dir, new_name);
          } catch (e) {
          }
          if (old_node === new_node) {
            return;
          }
          var isdir = FS.isDir(old_node.mode);
          var errCode = FS.mayDelete(old_dir, old_name, isdir);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          errCode = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          if (!old_dir.node_ops.rename) {
            throw new FS.ErrnoError(63);
          }
          if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
            throw new FS.ErrnoError(10);
          }
          if (new_dir !== old_dir) {
            errCode = FS.nodePermissions(old_dir, "w");
            if (errCode) {
              throw new FS.ErrnoError(errCode);
            }
          }
          FS.hashRemoveNode(old_node);
          try {
            old_dir.node_ops.rename(old_node, new_dir, new_name);
          } catch (e) {
            throw e;
          } finally {
            FS.hashAddNode(old_node);
          }
        }, rmdir: (path) => {
          var lookup = FS.lookupPath(path, { parent: true });
          var parent = lookup.node;
          var name = PATH.basename(path);
          var node = FS.lookupNode(parent, name);
          var errCode = FS.mayDelete(parent, name, true);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          if (!parent.node_ops.rmdir) {
            throw new FS.ErrnoError(63);
          }
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
          parent.node_ops.rmdir(parent, name);
          FS.destroyNode(node);
        }, readdir: (path) => {
          var lookup = FS.lookupPath(path, { follow: true });
          var node = lookup.node;
          if (!node.node_ops.readdir) {
            throw new FS.ErrnoError(54);
          }
          return node.node_ops.readdir(node);
        }, unlink: (path) => {
          var lookup = FS.lookupPath(path, { parent: true });
          var parent = lookup.node;
          if (!parent) {
            throw new FS.ErrnoError(44);
          }
          var name = PATH.basename(path);
          var node = FS.lookupNode(parent, name);
          var errCode = FS.mayDelete(parent, name, false);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          if (!parent.node_ops.unlink) {
            throw new FS.ErrnoError(63);
          }
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
          parent.node_ops.unlink(parent, name);
          FS.destroyNode(node);
        }, readlink: (path) => {
          var lookup = FS.lookupPath(path);
          var link = lookup.node;
          if (!link) {
            throw new FS.ErrnoError(44);
          }
          if (!link.node_ops.readlink) {
            throw new FS.ErrnoError(28);
          }
          return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
        }, stat: (path, dontFollow) => {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          var node = lookup.node;
          if (!node) {
            throw new FS.ErrnoError(44);
          }
          if (!node.node_ops.getattr) {
            throw new FS.ErrnoError(63);
          }
          return node.node_ops.getattr(node);
        }, lstat: (path) => {
          return FS.stat(path, true);
        }, chmod: (path, mode, dontFollow) => {
          var node;
          if (typeof path == "string") {
            var lookup = FS.lookupPath(path, { follow: !dontFollow });
            node = lookup.node;
          } else {
            node = path;
          }
          if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(63);
          }
          node.node_ops.setattr(node, { mode: mode & 4095 | node.mode & ~4095, timestamp: Date.now() });
        }, lchmod: (path, mode) => {
          FS.chmod(path, mode, true);
        }, fchmod: (fd, mode) => {
          var stream = FS.getStream(fd);
          if (!stream) {
            throw new FS.ErrnoError(8);
          }
          FS.chmod(stream.node, mode);
        }, chown: (path, uid, gid, dontFollow) => {
          var node;
          if (typeof path == "string") {
            var lookup = FS.lookupPath(path, { follow: !dontFollow });
            node = lookup.node;
          } else {
            node = path;
          }
          if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(63);
          }
          node.node_ops.setattr(node, { timestamp: Date.now() });
        }, lchown: (path, uid, gid) => {
          FS.chown(path, uid, gid, true);
        }, fchown: (fd, uid, gid) => {
          var stream = FS.getStream(fd);
          if (!stream) {
            throw new FS.ErrnoError(8);
          }
          FS.chown(stream.node, uid, gid);
        }, truncate: (path, len) => {
          if (len < 0) {
            throw new FS.ErrnoError(28);
          }
          var node;
          if (typeof path == "string") {
            var lookup = FS.lookupPath(path, { follow: true });
            node = lookup.node;
          } else {
            node = path;
          }
          if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(63);
          }
          if (FS.isDir(node.mode)) {
            throw new FS.ErrnoError(31);
          }
          if (!FS.isFile(node.mode)) {
            throw new FS.ErrnoError(28);
          }
          var errCode = FS.nodePermissions(node, "w");
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          node.node_ops.setattr(node, { size: len, timestamp: Date.now() });
        }, ftruncate: (fd, len) => {
          var stream = FS.getStream(fd);
          if (!stream) {
            throw new FS.ErrnoError(8);
          }
          if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(28);
          }
          FS.truncate(stream.node, len);
        }, utime: (path, atime, mtime) => {
          var lookup = FS.lookupPath(path, { follow: true });
          var node = lookup.node;
          node.node_ops.setattr(node, { timestamp: Math.max(atime, mtime) });
        }, open: (path, flags, mode) => {
          if (path === "") {
            throw new FS.ErrnoError(44);
          }
          flags = typeof flags == "string" ? FS.modeStringToFlags(flags) : flags;
          mode = typeof mode == "undefined" ? 438 : mode;
          if (flags & 64) {
            mode = mode & 4095 | 32768;
          } else {
            mode = 0;
          }
          var node;
          if (typeof path == "object") {
            node = path;
          } else {
            path = PATH.normalize(path);
            try {
              var lookup = FS.lookupPath(path, { follow: !(flags & 131072) });
              node = lookup.node;
            } catch (e) {
            }
          }
          var created = false;
          if (flags & 64) {
            if (node) {
              if (flags & 128) {
                throw new FS.ErrnoError(20);
              }
            } else {
              node = FS.mknod(path, mode, 0);
              created = true;
            }
          }
          if (!node) {
            throw new FS.ErrnoError(44);
          }
          if (FS.isChrdev(node.mode)) {
            flags &= ~512;
          }
          if (flags & 65536 && !FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54);
          }
          if (!created) {
            var errCode = FS.mayOpen(node, flags);
            if (errCode) {
              throw new FS.ErrnoError(errCode);
            }
          }
          if (flags & 512 && !created) {
            FS.truncate(node, 0);
          }
          flags &= ~(128 | 512 | 131072);
          var stream = FS.createStream({ node, path: FS.getPath(node), flags, seekable: true, position: 0, stream_ops: node.stream_ops, ungotten: [], error: false });
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
          if (Module2["logReadFiles"] && !(flags & 1)) {
            if (!FS.readFiles) FS.readFiles = {};
            if (!(path in FS.readFiles)) {
              FS.readFiles[path] = 1;
            }
          }
          return stream;
        }, close: (stream) => {
          if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8);
          }
          if (stream.getdents) stream.getdents = null;
          try {
            if (stream.stream_ops.close) {
              stream.stream_ops.close(stream);
            }
          } catch (e) {
            throw e;
          } finally {
            FS.closeStream(stream.fd);
          }
          stream.fd = null;
        }, isClosed: (stream) => {
          return stream.fd === null;
        }, llseek: (stream, offset, whence) => {
          if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8);
          }
          if (!stream.seekable || !stream.stream_ops.llseek) {
            throw new FS.ErrnoError(70);
          }
          if (whence != 0 && whence != 1 && whence != 2) {
            throw new FS.ErrnoError(28);
          }
          stream.position = stream.stream_ops.llseek(stream, offset, whence);
          stream.ungotten = [];
          return stream.position;
        }, read: (stream, buffer2, offset, length, position) => {
          if (length < 0 || position < 0) {
            throw new FS.ErrnoError(28);
          }
          if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8);
          }
          if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(8);
          }
          if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(31);
          }
          if (!stream.stream_ops.read) {
            throw new FS.ErrnoError(28);
          }
          var seeking = typeof position != "undefined";
          if (!seeking) {
            position = stream.position;
          } else if (!stream.seekable) {
            throw new FS.ErrnoError(70);
          }
          var bytesRead = stream.stream_ops.read(stream, buffer2, offset, length, position);
          if (!seeking) stream.position += bytesRead;
          return bytesRead;
        }, write: (stream, buffer2, offset, length, position, canOwn) => {
          if (length < 0 || position < 0) {
            throw new FS.ErrnoError(28);
          }
          if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8);
          }
          if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(8);
          }
          if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(31);
          }
          if (!stream.stream_ops.write) {
            throw new FS.ErrnoError(28);
          }
          if (stream.seekable && stream.flags & 1024) {
            FS.llseek(stream, 0, 2);
          }
          var seeking = typeof position != "undefined";
          if (!seeking) {
            position = stream.position;
          } else if (!stream.seekable) {
            throw new FS.ErrnoError(70);
          }
          var bytesWritten = stream.stream_ops.write(stream, buffer2, offset, length, position, canOwn);
          if (!seeking) stream.position += bytesWritten;
          return bytesWritten;
        }, allocate: (stream, offset, length) => {
          if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8);
          }
          if (offset < 0 || length <= 0) {
            throw new FS.ErrnoError(28);
          }
          if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(8);
          }
          if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          if (!stream.stream_ops.allocate) {
            throw new FS.ErrnoError(138);
          }
          stream.stream_ops.allocate(stream, offset, length);
        }, mmap: (stream, length, position, prot, flags) => {
          if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
            throw new FS.ErrnoError(2);
          }
          if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(2);
          }
          if (!stream.stream_ops.mmap) {
            throw new FS.ErrnoError(43);
          }
          return stream.stream_ops.mmap(stream, length, position, prot, flags);
        }, msync: (stream, buffer2, offset, length, mmapFlags) => {
          if (!stream.stream_ops.msync) {
            return 0;
          }
          return stream.stream_ops.msync(stream, buffer2, offset, length, mmapFlags);
        }, munmap: (stream) => 0, ioctl: (stream, cmd, arg) => {
          if (!stream.stream_ops.ioctl) {
            throw new FS.ErrnoError(59);
          }
          return stream.stream_ops.ioctl(stream, cmd, arg);
        }, readFile: (path, opts = {}) => {
          opts.flags = opts.flags || 0;
          opts.encoding = opts.encoding || "binary";
          if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
            throw new Error('Invalid encoding type "' + opts.encoding + '"');
          }
          var ret;
          var stream = FS.open(path, opts.flags);
          var stat = FS.stat(path);
          var length = stat.size;
          var buf = new Uint8Array(length);
          FS.read(stream, buf, 0, length, 0);
          if (opts.encoding === "utf8") {
            ret = UTF8ArrayToString(buf, 0);
          } else if (opts.encoding === "binary") {
            ret = buf;
          }
          FS.close(stream);
          return ret;
        }, writeFile: (path, data, opts = {}) => {
          opts.flags = opts.flags || 577;
          var stream = FS.open(path, opts.flags, opts.mode);
          if (typeof data == "string") {
            var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
            var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
            FS.write(stream, buf, 0, actualNumBytes, void 0, opts.canOwn);
          } else if (ArrayBuffer.isView(data)) {
            FS.write(stream, data, 0, data.byteLength, void 0, opts.canOwn);
          } else {
            throw new Error("Unsupported data type");
          }
          FS.close(stream);
        }, cwd: () => FS.currentPath, chdir: (path) => {
          var lookup = FS.lookupPath(path, { follow: true });
          if (lookup.node === null) {
            throw new FS.ErrnoError(44);
          }
          if (!FS.isDir(lookup.node.mode)) {
            throw new FS.ErrnoError(54);
          }
          var errCode = FS.nodePermissions(lookup.node, "x");
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
          FS.currentPath = lookup.path;
        }, createDefaultDirectories: () => {
          FS.mkdir("/tmp");
          FS.mkdir("/home");
          FS.mkdir("/home/web_user");
        }, createDefaultDevices: () => {
          FS.mkdir("/dev");
          FS.registerDevice(FS.makedev(1, 3), { read: () => 0, write: (stream, buffer2, offset, length, pos) => length });
          FS.mkdev("/dev/null", FS.makedev(1, 3));
          TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
          TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
          FS.mkdev("/dev/tty", FS.makedev(5, 0));
          FS.mkdev("/dev/tty1", FS.makedev(6, 0));
          var random_device = getRandomDevice();
          FS.createDevice("/dev", "random", random_device);
          FS.createDevice("/dev", "urandom", random_device);
          FS.mkdir("/dev/shm");
          FS.mkdir("/dev/shm/tmp");
        }, createSpecialDirectories: () => {
          FS.mkdir("/proc");
          var proc_self = FS.mkdir("/proc/self");
          FS.mkdir("/proc/self/fd");
          FS.mount({ mount: () => {
            var node = FS.createNode(proc_self, "fd", 16384 | 511, 73);
            node.node_ops = { lookup: (parent, name) => {
              var fd = +name;
              var stream = FS.getStream(fd);
              if (!stream) throw new FS.ErrnoError(8);
              var ret = { parent: null, mount: { mountpoint: "fake" }, node_ops: { readlink: () => stream.path } };
              ret.parent = ret;
              return ret;
            } };
            return node;
          } }, {}, "/proc/self/fd");
        }, createStandardStreams: () => {
          if (Module2["stdin"]) {
            FS.createDevice("/dev", "stdin", Module2["stdin"]);
          } else {
            FS.symlink("/dev/tty", "/dev/stdin");
          }
          if (Module2["stdout"]) {
            FS.createDevice("/dev", "stdout", null, Module2["stdout"]);
          } else {
            FS.symlink("/dev/tty", "/dev/stdout");
          }
          if (Module2["stderr"]) {
            FS.createDevice("/dev", "stderr", null, Module2["stderr"]);
          } else {
            FS.symlink("/dev/tty1", "/dev/stderr");
          }
          var stdin = FS.open("/dev/stdin", 0);
          var stdout = FS.open("/dev/stdout", 1);
          var stderr = FS.open("/dev/stderr", 1);
        }, ensureErrnoError: () => {
          if (FS.ErrnoError) return;
          FS.ErrnoError = function ErrnoError(errno, node) {
            this.node = node;
            this.setErrno = function(errno2) {
              this.errno = errno2;
            };
            this.setErrno(errno);
            this.message = "FS error";
          };
          FS.ErrnoError.prototype = new Error();
          FS.ErrnoError.prototype.constructor = FS.ErrnoError;
          [44].forEach((code) => {
            FS.genericErrors[code] = new FS.ErrnoError(code);
            FS.genericErrors[code].stack = "<generic error, no stack>";
          });
        }, staticInit: () => {
          FS.ensureErrnoError();
          FS.nameTable = new Array(4096);
          FS.mount(MEMFS, {}, "/");
          FS.createDefaultDirectories();
          FS.createDefaultDevices();
          FS.createSpecialDirectories();
          FS.filesystems = { "MEMFS": MEMFS, "IDBFS": IDBFS };
        }, init: (input, output, error) => {
          FS.init.initialized = true;
          FS.ensureErrnoError();
          Module2["stdin"] = input || Module2["stdin"];
          Module2["stdout"] = output || Module2["stdout"];
          Module2["stderr"] = error || Module2["stderr"];
          FS.createStandardStreams();
        }, quit: () => {
          FS.init.initialized = false;
          for (var i2 = 0; i2 < FS.streams.length; i2++) {
            var stream = FS.streams[i2];
            if (!stream) {
              continue;
            }
            FS.close(stream);
          }
        }, getMode: (canRead, canWrite) => {
          var mode = 0;
          if (canRead) mode |= 292 | 73;
          if (canWrite) mode |= 146;
          return mode;
        }, findObject: (path, dontResolveLastLink) => {
          var ret = FS.analyzePath(path, dontResolveLastLink);
          if (!ret.exists) {
            return null;
          }
          return ret.object;
        }, analyzePath: (path, dontResolveLastLink) => {
          try {
            var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
            path = lookup.path;
          } catch (e) {
          }
          var ret = { isRoot: false, exists: false, error: 0, name: null, path: null, object: null, parentExists: false, parentPath: null, parentObject: null };
          try {
            var lookup = FS.lookupPath(path, { parent: true });
            ret.parentExists = true;
            ret.parentPath = lookup.path;
            ret.parentObject = lookup.node;
            ret.name = PATH.basename(path);
            lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
            ret.exists = true;
            ret.path = lookup.path;
            ret.object = lookup.node;
            ret.name = lookup.node.name;
            ret.isRoot = lookup.path === "/";
          } catch (e) {
            ret.error = e.errno;
          }
          return ret;
        }, createPath: (parent, path, canRead, canWrite) => {
          parent = typeof parent == "string" ? parent : FS.getPath(parent);
          var parts = path.split("/").reverse();
          while (parts.length) {
            var part = parts.pop();
            if (!part) continue;
            var current = PATH.join2(parent, part);
            try {
              FS.mkdir(current);
            } catch (e) {
            }
            parent = current;
          }
          return current;
        }, createFile: (parent, name, properties, canRead, canWrite) => {
          var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
          var mode = FS.getMode(canRead, canWrite);
          return FS.create(path, mode);
        }, createDataFile: (parent, name, data, canRead, canWrite, canOwn) => {
          var path = name;
          if (parent) {
            parent = typeof parent == "string" ? parent : FS.getPath(parent);
            path = name ? PATH.join2(parent, name) : parent;
          }
          var mode = FS.getMode(canRead, canWrite);
          var node = FS.create(path, mode);
          if (data) {
            if (typeof data == "string") {
              var arr = new Array(data.length);
              for (var i2 = 0, len = data.length; i2 < len; ++i2) arr[i2] = data.charCodeAt(i2);
              data = arr;
            }
            FS.chmod(node, mode | 146);
            var stream = FS.open(node, 577);
            FS.write(stream, data, 0, data.length, 0, canOwn);
            FS.close(stream);
            FS.chmod(node, mode);
          }
          return node;
        }, createDevice: (parent, name, input, output) => {
          var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
          var mode = FS.getMode(!!input, !!output);
          if (!FS.createDevice.major) FS.createDevice.major = 64;
          var dev = FS.makedev(FS.createDevice.major++, 0);
          FS.registerDevice(dev, { open: (stream) => {
            stream.seekable = false;
          }, close: (stream) => {
            if (output && output.buffer && output.buffer.length) {
              output(10);
            }
          }, read: (stream, buffer2, offset, length, pos) => {
            var bytesRead = 0;
            for (var i2 = 0; i2 < length; i2++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === void 0 && bytesRead === 0) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === void 0) break;
              bytesRead++;
              buffer2[offset + i2] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          }, write: (stream, buffer2, offset, length, pos) => {
            for (var i2 = 0; i2 < length; i2++) {
              try {
                output(buffer2[offset + i2]);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i2;
          } });
          return FS.mkdev(path, mode, dev);
        }, forceLoadFile: (obj) => {
          if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
          if (typeof XMLHttpRequest != "undefined") {
            throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
          } else if (read_) {
            try {
              obj.contents = intArrayFromString(read_(obj.url), true);
              obj.usedBytes = obj.contents.length;
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
          } else {
            throw new Error("Cannot load without read() or XMLHttpRequest.");
          }
        }, createLazyFile: (parent, name, url, canRead, canWrite) => {
          function LazyUint8Array() {
            this.lengthKnown = false;
            this.chunks = [];
          }
          LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
            if (idx > this.length - 1 || idx < 0) {
              return void 0;
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = idx / this.chunkSize | 0;
            return this.getter(chunkNum)[chunkOffset];
          };
          LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
            this.getter = getter;
          };
          LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
            var xhr = new XMLHttpRequest();
            xhr.open("HEAD", url, false);
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            var datalength = Number(xhr.getResponseHeader("Content-length"));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
            var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
            var chunkSize = 1024 * 1024;
            if (!hasByteServing) chunkSize = datalength;
            var doXHR = (from, to) => {
              if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
              if (to > datalength - 1) throw new Error("only " + datalength + " bytes available! programmer error!");
              var xhr2 = new XMLHttpRequest();
              xhr2.open("GET", url, false);
              if (datalength !== chunkSize) xhr2.setRequestHeader("Range", "bytes=" + from + "-" + to);
              xhr2.responseType = "arraybuffer";
              if (xhr2.overrideMimeType) {
                xhr2.overrideMimeType("text/plain; charset=x-user-defined");
              }
              xhr2.send(null);
              if (!(xhr2.status >= 200 && xhr2.status < 300 || xhr2.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr2.status);
              if (xhr2.response !== void 0) {
                return new Uint8Array(xhr2.response || []);
              }
              return intArrayFromString(xhr2.responseText || "", true);
            };
            var lazyArray2 = this;
            lazyArray2.setDataGetter((chunkNum) => {
              var start = chunkNum * chunkSize;
              var end = (chunkNum + 1) * chunkSize - 1;
              end = Math.min(end, datalength - 1);
              if (typeof lazyArray2.chunks[chunkNum] == "undefined") {
                lazyArray2.chunks[chunkNum] = doXHR(start, end);
              }
              if (typeof lazyArray2.chunks[chunkNum] == "undefined") throw new Error("doXHR failed!");
              return lazyArray2.chunks[chunkNum];
            });
            if (usesGzip || !datalength) {
              chunkSize = datalength = 1;
              datalength = this.getter(0).length;
              chunkSize = datalength;
              out("LazyFiles on gzip forces download of the whole file when length is accessed");
            }
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true;
          };
          if (typeof XMLHttpRequest != "undefined") {
            if (!ENVIRONMENT_IS_WORKER) throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
            var lazyArray = new LazyUint8Array();
            Object.defineProperties(lazyArray, { length: { get: function() {
              if (!this.lengthKnown) {
                this.cacheLength();
              }
              return this._length;
            } }, chunkSize: { get: function() {
              if (!this.lengthKnown) {
                this.cacheLength();
              }
              return this._chunkSize;
            } } });
            var properties = { isDevice: false, contents: lazyArray };
          } else {
            var properties = { isDevice: false, url };
          }
          var node = FS.createFile(parent, name, properties, canRead, canWrite);
          if (properties.contents) {
            node.contents = properties.contents;
          } else if (properties.url) {
            node.contents = null;
            node.url = properties.url;
          }
          Object.defineProperties(node, { usedBytes: { get: function() {
            return this.contents.length;
          } } });
          var stream_ops = {};
          var keys = Object.keys(node.stream_ops);
          keys.forEach((key) => {
            var fn = node.stream_ops[key];
            stream_ops[key] = function forceLoadLazyFile() {
              FS.forceLoadFile(node);
              return fn.apply(null, arguments);
            };
          });
          function writeChunks(stream, buffer2, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= contents.length) return 0;
            var size = Math.min(contents.length - position, length);
            if (contents.slice) {
              for (var i2 = 0; i2 < size; i2++) {
                buffer2[offset + i2] = contents[position + i2];
              }
            } else {
              for (var i2 = 0; i2 < size; i2++) {
                buffer2[offset + i2] = contents.get(position + i2);
              }
            }
            return size;
          }
          stream_ops.read = (stream, buffer2, offset, length, position) => {
            FS.forceLoadFile(node);
            return writeChunks(stream, buffer2, offset, length, position);
          };
          stream_ops.mmap = (stream, length, position, prot, flags) => {
            FS.forceLoadFile(node);
            var ptr = mmapAlloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(48);
            }
            writeChunks(stream, HEAP8, ptr, length, position);
            return { ptr, allocated: true };
          };
          node.stream_ops = stream_ops;
          return node;
        }, createPreloadedFile: (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
          var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
          var dep = getUniqueRunDependency("cp " + fullname);
          function processData(byteArray) {
            function finish(byteArray2) {
              if (preFinish) preFinish();
              if (!dontCreateFile) {
                FS.createDataFile(parent, name, byteArray2, canRead, canWrite, canOwn);
              }
              if (onload) onload();
              removeRunDependency(dep);
            }
            if (Browser.handledByPreloadPlugin(byteArray, fullname, finish, () => {
              if (onerror) onerror();
              removeRunDependency(dep);
            })) {
              return;
            }
            finish(byteArray);
          }
          addRunDependency(dep);
          if (typeof url == "string") {
            asyncLoad(url, (byteArray) => processData(byteArray), onerror);
          } else {
            processData(url);
          }
        }, indexedDB: () => {
          return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        }, DB_NAME: () => {
          return "EM_FS_" + window.location.pathname;
        }, DB_VERSION: 20, DB_STORE_NAME: "FILE_DATA", saveFilesToDB: (paths, onload, onerror) => {
          onload = onload || (() => {
          });
          onerror = onerror || (() => {
          });
          var indexedDB2 = FS.indexedDB();
          try {
            var openRequest = indexedDB2.open(FS.DB_NAME(), FS.DB_VERSION);
          } catch (e) {
            return onerror(e);
          }
          openRequest.onupgradeneeded = () => {
            out("creating db");
            var db = openRequest.result;
            db.createObjectStore(FS.DB_STORE_NAME);
          };
          openRequest.onsuccess = () => {
            var db = openRequest.result;
            var transaction = db.transaction([FS.DB_STORE_NAME], "readwrite");
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0, fail = 0, total = paths.length;
            function finish() {
              if (fail == 0) onload();
              else onerror();
            }
            paths.forEach((path) => {
              var putRequest = files.put(FS.analyzePath(path).object.contents, path);
              putRequest.onsuccess = () => {
                ok++;
                if (ok + fail == total) finish();
              };
              putRequest.onerror = () => {
                fail++;
                if (ok + fail == total) finish();
              };
            });
            transaction.onerror = onerror;
          };
          openRequest.onerror = onerror;
        }, loadFilesFromDB: (paths, onload, onerror) => {
          onload = onload || (() => {
          });
          onerror = onerror || (() => {
          });
          var indexedDB2 = FS.indexedDB();
          try {
            var openRequest = indexedDB2.open(FS.DB_NAME(), FS.DB_VERSION);
          } catch (e) {
            return onerror(e);
          }
          openRequest.onupgradeneeded = onerror;
          openRequest.onsuccess = () => {
            var db = openRequest.result;
            try {
              var transaction = db.transaction([FS.DB_STORE_NAME], "readonly");
            } catch (e) {
              onerror(e);
              return;
            }
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0, fail = 0, total = paths.length;
            function finish() {
              if (fail == 0) onload();
              else onerror();
            }
            paths.forEach((path) => {
              var getRequest = files.get(path);
              getRequest.onsuccess = () => {
                if (FS.analyzePath(path).exists) {
                  FS.unlink(path);
                }
                FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
                ok++;
                if (ok + fail == total) finish();
              };
              getRequest.onerror = () => {
                fail++;
                if (ok + fail == total) finish();
              };
            });
            transaction.onerror = onerror;
          };
          openRequest.onerror = onerror;
        } };
        Module2["FS"] = FS;
        var SYSCALLS = { DEFAULT_POLLMASK: 5, calculateAt: function(dirfd, path, allowEmpty) {
          if (PATH.isAbs(path)) {
            return path;
          }
          var dir;
          if (dirfd === -100) {
            dir = FS.cwd();
          } else {
            var dirstream = SYSCALLS.getStreamFromFD(dirfd);
            dir = dirstream.path;
          }
          if (path.length == 0) {
            if (!allowEmpty) {
              throw new FS.ErrnoError(44);
            }
            return dir;
          }
          return PATH.join2(dir, path);
        }, doStat: function(func, path, buf) {
          try {
            var stat = func(path);
          } catch (e) {
            if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
              return -54;
            }
            throw e;
          }
          HEAP32[buf >> 2] = stat.dev;
          HEAP32[buf + 8 >> 2] = stat.ino;
          HEAP32[buf + 12 >> 2] = stat.mode;
          HEAPU32[buf + 16 >> 2] = stat.nlink;
          HEAP32[buf + 20 >> 2] = stat.uid;
          HEAP32[buf + 24 >> 2] = stat.gid;
          HEAP32[buf + 28 >> 2] = stat.rdev;
          tempI64 = [stat.size >>> 0, (tempDouble = stat.size, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 40 >> 2] = tempI64[0], HEAP32[buf + 44 >> 2] = tempI64[1];
          HEAP32[buf + 48 >> 2] = 4096;
          HEAP32[buf + 52 >> 2] = stat.blocks;
          tempI64 = [Math.floor(stat.atime.getTime() / 1e3) >>> 0, (tempDouble = Math.floor(stat.atime.getTime() / 1e3), +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 56 >> 2] = tempI64[0], HEAP32[buf + 60 >> 2] = tempI64[1];
          HEAPU32[buf + 64 >> 2] = 0;
          tempI64 = [Math.floor(stat.mtime.getTime() / 1e3) >>> 0, (tempDouble = Math.floor(stat.mtime.getTime() / 1e3), +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 72 >> 2] = tempI64[0], HEAP32[buf + 76 >> 2] = tempI64[1];
          HEAPU32[buf + 80 >> 2] = 0;
          tempI64 = [Math.floor(stat.ctime.getTime() / 1e3) >>> 0, (tempDouble = Math.floor(stat.ctime.getTime() / 1e3), +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 88 >> 2] = tempI64[0], HEAP32[buf + 92 >> 2] = tempI64[1];
          HEAPU32[buf + 96 >> 2] = 0;
          tempI64 = [stat.ino >>> 0, (tempDouble = stat.ino, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 104 >> 2] = tempI64[0], HEAP32[buf + 108 >> 2] = tempI64[1];
          return 0;
        }, doMsync: function(addr, stream, len, flags, offset) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          if (flags & 2) {
            return 0;
          }
          var buffer2 = HEAPU8.slice(addr, addr + len);
          FS.msync(stream, buffer2, offset, len, flags);
        }, varargs: void 0, get: function() {
          SYSCALLS.varargs += 4;
          var ret = HEAP32[SYSCALLS.varargs - 4 >> 2];
          return ret;
        }, getStr: function(ptr) {
          var ret = UTF8ToString(ptr);
          return ret;
        }, getStreamFromFD: function(fd) {
          var stream = FS.getStream(fd);
          if (!stream) throw new FS.ErrnoError(8);
          return stream;
        } };
        Module2["SYSCALLS"] = SYSCALLS;
        function _proc_exit(code) {
          EXITSTATUS = code;
          if (!keepRuntimeAlive()) {
            if (Module2["onExit"]) Module2["onExit"](code);
            ABORT = true;
          }
          quit_(code, new ExitStatus(code));
        }
        Module2["_proc_exit"] = _proc_exit;
        function exitJS(status, implicit) {
          EXITSTATUS = status;
          _proc_exit(status);
        }
        Module2["exitJS"] = exitJS;
        var _exit = exitJS;
        Module2["_exit"] = _exit;
        function handleException(e) {
          if (e instanceof ExitStatus || e == "unwind") {
            return EXITSTATUS;
          }
          quit_(1, e);
        }
        Module2["handleException"] = handleException;
        function maybeExit() {
        }
        Module2["maybeExit"] = maybeExit;
        function setMainLoop(browserIterationFunc, fps, simulateInfiniteLoop, arg, noSetTiming) {
          assert(!Browser.mainLoop.func, "emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.");
          Browser.mainLoop.func = browserIterationFunc;
          Browser.mainLoop.arg = arg;
          var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
          function checkIsRunning() {
            if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) {
              maybeExit();
              return false;
            }
            return true;
          }
          Browser.mainLoop.running = false;
          Browser.mainLoop.runner = function Browser_mainLoop_runner() {
            if (ABORT) return;
            if (Browser.mainLoop.queue.length > 0) {
              var start = Date.now();
              var blocker = Browser.mainLoop.queue.shift();
              blocker.func(blocker.arg);
              if (Browser.mainLoop.remainingBlockers) {
                var remaining = Browser.mainLoop.remainingBlockers;
                var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
                if (blocker.counted) {
                  Browser.mainLoop.remainingBlockers = next;
                } else {
                  next = next + 0.5;
                  Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9;
                }
              }
              out('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + " ms");
              Browser.mainLoop.updateStatus();
              if (!checkIsRunning()) return;
              setTimeout(Browser.mainLoop.runner, 0);
              return;
            }
            if (!checkIsRunning()) return;
            Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
            if (Browser.mainLoop.timingMode == 1 && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
              Browser.mainLoop.scheduler();
              return;
            } else if (Browser.mainLoop.timingMode == 0) {
              Browser.mainLoop.tickStartTime = _emscripten_get_now();
            }
            GL.newRenderingFrameStarted();
            Browser.mainLoop.runIter(browserIterationFunc);
            if (!checkIsRunning()) return;
            if (typeof SDL == "object" && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();
            Browser.mainLoop.scheduler();
          };
          if (!noSetTiming) {
            if (fps && fps > 0) _emscripten_set_main_loop_timing(0, 1e3 / fps);
            else _emscripten_set_main_loop_timing(1, 1);
            Browser.mainLoop.scheduler();
          }
          if (simulateInfiniteLoop) {
            throw "unwind";
          }
        }
        Module2["setMainLoop"] = setMainLoop;
        function callUserCallback(func) {
          if (ABORT) {
            return;
          }
          try {
            func();
          } catch (e) {
            handleException(e);
          }
        }
        Module2["callUserCallback"] = callUserCallback;
        function safeSetTimeout(func, timeout) {
          return setTimeout(function() {
            callUserCallback(func);
          }, timeout);
        }
        Module2["safeSetTimeout"] = safeSetTimeout;
        function warnOnce(text) {
          if (!warnOnce.shown) warnOnce.shown = {};
          if (!warnOnce.shown[text]) {
            warnOnce.shown[text] = 1;
            err(text);
          }
        }
        Module2["warnOnce"] = warnOnce;
        var Browser = { mainLoop: { running: false, scheduler: null, method: "", currentlyRunningMainloop: 0, func: null, arg: 0, timingMode: 0, timingValue: 0, currentFrameNumber: 0, queue: [], pause: function() {
          Browser.mainLoop.scheduler = null;
          Browser.mainLoop.currentlyRunningMainloop++;
        }, resume: function() {
          Browser.mainLoop.currentlyRunningMainloop++;
          var timingMode = Browser.mainLoop.timingMode;
          var timingValue = Browser.mainLoop.timingValue;
          var func = Browser.mainLoop.func;
          Browser.mainLoop.func = null;
          setMainLoop(func, 0, false, Browser.mainLoop.arg, true);
          _emscripten_set_main_loop_timing(timingMode, timingValue);
          Browser.mainLoop.scheduler();
        }, updateStatus: function() {
          if (Module2["setStatus"]) {
            var message = Module2["statusMessage"] || "Please wait...";
            var remaining = Browser.mainLoop.remainingBlockers;
            var expected = Browser.mainLoop.expectedBlockers;
            if (remaining) {
              if (remaining < expected) {
                Module2["setStatus"](message + " (" + (expected - remaining) + "/" + expected + ")");
              } else {
                Module2["setStatus"](message);
              }
            } else {
              Module2["setStatus"]("");
            }
          }
        }, runIter: function(func) {
          if (ABORT) return;
          if (Module2["preMainLoop"]) {
            var preRet = Module2["preMainLoop"]();
            if (preRet === false) {
              return;
            }
          }
          callUserCallback(func);
          if (Module2["postMainLoop"]) Module2["postMainLoop"]();
        } }, isFullscreen: false, pointerLock: false, moduleContextCreatedCallbacks: [], workers: [], init: function() {
          if (!Module2["preloadPlugins"]) Module2["preloadPlugins"] = [];
          if (Browser.initted) return;
          Browser.initted = true;
          try {
            new Blob();
            Browser.hasBlobConstructor = true;
          } catch (e) {
            Browser.hasBlobConstructor = false;
            err("warning: no blob constructor, cannot create blobs with mimetypes");
          }
          Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : !Browser.hasBlobConstructor ? err("warning: no BlobBuilder") : null;
          Browser.URLObject = typeof window != "undefined" ? window.URL ? window.URL : window.webkitURL : void 0;
          if (!Module2.noImageDecoding && typeof Browser.URLObject == "undefined") {
            err("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
            Module2.noImageDecoding = true;
          }
          var imagePlugin = {};
          imagePlugin["canHandle"] = function imagePlugin_canHandle(name) {
            return !Module2.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
          };
          imagePlugin["handle"] = function imagePlugin_handle(byteArray, name, onload, onerror) {
            var b = null;
            if (Browser.hasBlobConstructor) {
              try {
                b = new Blob([byteArray], { type: Browser.getMimetype(name) });
                if (b.size !== byteArray.length) {
                  b = new Blob([new Uint8Array(byteArray).buffer], { type: Browser.getMimetype(name) });
                }
              } catch (e) {
                warnOnce("Blob constructor present but fails: " + e + "; falling back to blob builder");
              }
            }
            if (!b) {
              var bb = new Browser.BlobBuilder();
              bb.append(new Uint8Array(byteArray).buffer);
              b = bb.getBlob();
            }
            var url = Browser.URLObject.createObjectURL(b);
            var img = new Image();
            img.onload = () => {
              assert(img.complete, "Image " + name + " could not be decoded");
              var canvas2 = document.createElement("canvas");
              canvas2.width = img.width;
              canvas2.height = img.height;
              var ctx = canvas2.getContext("2d");
              ctx.drawImage(img, 0, 0);
              preloadedImages[name] = canvas2;
              Browser.URLObject.revokeObjectURL(url);
              if (onload) onload(byteArray);
            };
            img.onerror = (event2) => {
              out("Image " + url + " could not be decoded");
              if (onerror) onerror();
            };
            img.src = url;
          };
          Module2["preloadPlugins"].push(imagePlugin);
          var audioPlugin = {};
          audioPlugin["canHandle"] = function audioPlugin_canHandle(name) {
            return !Module2.noAudioDecoding && name.substr(-4) in { ".ogg": 1, ".wav": 1, ".mp3": 1 };
          };
          audioPlugin["handle"] = function audioPlugin_handle(byteArray, name, onload, onerror) {
            var done = false;
            function finish(audio2) {
              if (done) return;
              done = true;
              preloadedAudios[name] = audio2;
              if (onload) onload(byteArray);
            }
            function fail() {
              if (done) return;
              done = true;
              preloadedAudios[name] = new Audio();
              if (onerror) onerror();
            }
            if (Browser.hasBlobConstructor) {
              try {
                var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
              } catch (e) {
                return fail();
              }
              var url = Browser.URLObject.createObjectURL(b);
              var audio = new Audio();
              audio.addEventListener("canplaythrough", () => finish(audio), false);
              audio.onerror = function audio_onerror(event2) {
                if (done) return;
                err("warning: browser could not fully decode audio " + name + ", trying slower base64 approach");
                function encode64(data) {
                  var BASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                  var PAD = "=";
                  var ret = "";
                  var leftchar = 0;
                  var leftbits = 0;
                  for (var i2 = 0; i2 < data.length; i2++) {
                    leftchar = leftchar << 8 | data[i2];
                    leftbits += 8;
                    while (leftbits >= 6) {
                      var curr = leftchar >> leftbits - 6 & 63;
                      leftbits -= 6;
                      ret += BASE[curr];
                    }
                  }
                  if (leftbits == 2) {
                    ret += BASE[(leftchar & 3) << 4];
                    ret += PAD + PAD;
                  } else if (leftbits == 4) {
                    ret += BASE[(leftchar & 15) << 2];
                    ret += PAD;
                  }
                  return ret;
                }
                audio.src = "data:audio/x-" + name.substr(-3) + ";base64," + encode64(byteArray);
                finish(audio);
              };
              audio.src = url;
              safeSetTimeout(function() {
                finish(audio);
              }, 1e4);
            } else {
              return fail();
            }
          };
          Module2["preloadPlugins"].push(audioPlugin);
          function pointerLockChange() {
            Browser.pointerLock = document["pointerLockElement"] === Module2["canvas"] || document["mozPointerLockElement"] === Module2["canvas"] || document["webkitPointerLockElement"] === Module2["canvas"] || document["msPointerLockElement"] === Module2["canvas"];
          }
          var canvas = Module2["canvas"];
          if (canvas) {
            canvas.requestPointerLock = canvas["requestPointerLock"] || canvas["mozRequestPointerLock"] || canvas["webkitRequestPointerLock"] || canvas["msRequestPointerLock"] || (() => {
            });
            canvas.exitPointerLock = document["exitPointerLock"] || document["mozExitPointerLock"] || document["webkitExitPointerLock"] || document["msExitPointerLock"] || (() => {
            });
            canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
            document.addEventListener("pointerlockchange", pointerLockChange, false);
            document.addEventListener("mozpointerlockchange", pointerLockChange, false);
            document.addEventListener("webkitpointerlockchange", pointerLockChange, false);
            document.addEventListener("mspointerlockchange", pointerLockChange, false);
            if (Module2["elementPointerLock"]) {
              canvas.addEventListener("click", (ev) => {
                if (!Browser.pointerLock && Module2["canvas"].requestPointerLock) {
                  Module2["canvas"].requestPointerLock();
                  ev.preventDefault();
                }
              }, false);
            }
          }
        }, handledByPreloadPlugin: function(byteArray, fullname, finish, onerror) {
          Browser.init();
          var handled = false;
          Module2["preloadPlugins"].forEach(function(plugin) {
            if (handled) return;
            if (plugin["canHandle"](fullname)) {
              plugin["handle"](byteArray, fullname, finish, onerror);
              handled = true;
            }
          });
          return handled;
        }, createContext: function(canvas, useWebGL, setInModule, webGLContextAttributes) {
          if (useWebGL && Module2.ctx && canvas == Module2.canvas) return Module2.ctx;
          var ctx;
          var contextHandle;
          if (useWebGL) {
            var contextAttributes = { antialias: false, alpha: false, majorVersion: typeof WebGL2RenderingContext != "undefined" ? 2 : 1 };
            if (webGLContextAttributes) {
              for (var attribute in webGLContextAttributes) {
                contextAttributes[attribute] = webGLContextAttributes[attribute];
              }
            }
            if (typeof GL != "undefined") {
              contextHandle = GL.createContext(canvas, contextAttributes);
              if (contextHandle) {
                ctx = GL.getContext(contextHandle).GLctx;
              }
            }
          } else {
            ctx = canvas.getContext("2d");
          }
          if (!ctx) return null;
          if (setInModule) {
            if (!useWebGL) assert(typeof GLctx == "undefined", "cannot set in module if GLctx is used, but we are a non-GL context that would replace it");
            Module2.ctx = ctx;
            if (useWebGL) GL.makeContextCurrent(contextHandle);
            Module2.useWebGL = useWebGL;
            Browser.moduleContextCreatedCallbacks.forEach(function(callback) {
              callback();
            });
            Browser.init();
          }
          return ctx;
        }, destroyContext: function(canvas, useWebGL, setInModule) {
        }, fullscreenHandlersInstalled: false, lockPointer: void 0, resizeCanvas: void 0, requestFullscreen: function(lockPointer, resizeCanvas) {
          Browser.lockPointer = lockPointer;
          Browser.resizeCanvas = resizeCanvas;
          if (typeof Browser.lockPointer == "undefined") Browser.lockPointer = true;
          if (typeof Browser.resizeCanvas == "undefined") Browser.resizeCanvas = false;
          var canvas = Module2["canvas"];
          function fullscreenChange() {
            Browser.isFullscreen = false;
            var canvasContainer2 = canvas.parentNode;
            if ((document["fullscreenElement"] || document["mozFullScreenElement"] || document["msFullscreenElement"] || document["webkitFullscreenElement"] || document["webkitCurrentFullScreenElement"]) === canvasContainer2) {
              canvas.exitFullscreen = Browser.exitFullscreen;
              if (Browser.lockPointer) canvas.requestPointerLock();
              Browser.isFullscreen = true;
              if (Browser.resizeCanvas) {
                Browser.setFullscreenCanvasSize();
              } else {
                Browser.updateCanvasDimensions(canvas);
              }
            } else {
              canvasContainer2.parentNode.insertBefore(canvas, canvasContainer2);
              canvasContainer2.parentNode.removeChild(canvasContainer2);
              if (Browser.resizeCanvas) {
                Browser.setWindowedCanvasSize();
              } else {
                Browser.updateCanvasDimensions(canvas);
              }
            }
            if (Module2["onFullScreen"]) Module2["onFullScreen"](Browser.isFullscreen);
            if (Module2["onFullscreen"]) Module2["onFullscreen"](Browser.isFullscreen);
          }
          if (!Browser.fullscreenHandlersInstalled) {
            Browser.fullscreenHandlersInstalled = true;
            document.addEventListener("fullscreenchange", fullscreenChange, false);
            document.addEventListener("mozfullscreenchange", fullscreenChange, false);
            document.addEventListener("webkitfullscreenchange", fullscreenChange, false);
            document.addEventListener("MSFullscreenChange", fullscreenChange, false);
          }
          var canvasContainer = document.createElement("div");
          canvas.parentNode.insertBefore(canvasContainer, canvas);
          canvasContainer.appendChild(canvas);
          canvasContainer.requestFullscreen = canvasContainer["requestFullscreen"] || canvasContainer["mozRequestFullScreen"] || canvasContainer["msRequestFullscreen"] || (canvasContainer["webkitRequestFullscreen"] ? () => canvasContainer["webkitRequestFullscreen"](Element["ALLOW_KEYBOARD_INPUT"]) : null) || (canvasContainer["webkitRequestFullScreen"] ? () => canvasContainer["webkitRequestFullScreen"](Element["ALLOW_KEYBOARD_INPUT"]) : null);
          canvasContainer.requestFullscreen();
        }, exitFullscreen: function() {
          if (!Browser.isFullscreen) {
            return false;
          }
          var CFS = document["exitFullscreen"] || document["cancelFullScreen"] || document["mozCancelFullScreen"] || document["msExitFullscreen"] || document["webkitCancelFullScreen"] || function() {
          };
          CFS.apply(document, []);
          return true;
        }, nextRAF: 0, fakeRequestAnimationFrame: function(func) {
          var now = Date.now();
          if (Browser.nextRAF === 0) {
            Browser.nextRAF = now + 1e3 / 60;
          } else {
            while (now + 2 >= Browser.nextRAF) {
              Browser.nextRAF += 1e3 / 60;
            }
          }
          var delay = Math.max(Browser.nextRAF - now, 0);
          setTimeout(func, delay);
        }, requestAnimationFrame: function(func) {
          if (typeof requestAnimationFrame == "function") {
            requestAnimationFrame(func);
            return;
          }
          var RAF = Browser.fakeRequestAnimationFrame;
          RAF(func);
        }, safeSetTimeout: function(func, timeout) {
          return safeSetTimeout(func, timeout);
        }, safeRequestAnimationFrame: function(func) {
          return Browser.requestAnimationFrame(function() {
            callUserCallback(func);
          });
        }, getMimetype: function(name) {
          return { "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "bmp": "image/bmp", "ogg": "audio/ogg", "wav": "audio/wav", "mp3": "audio/mpeg" }[name.substr(name.lastIndexOf(".") + 1)];
        }, getUserMedia: function(func) {
          if (!window.getUserMedia) {
            window.getUserMedia = navigator["getUserMedia"] || navigator["mozGetUserMedia"];
          }
          window.getUserMedia(func);
        }, getMovementX: function(event2) {
          return event2["movementX"] || event2["mozMovementX"] || event2["webkitMovementX"] || 0;
        }, getMovementY: function(event2) {
          return event2["movementY"] || event2["mozMovementY"] || event2["webkitMovementY"] || 0;
        }, getMouseWheelDelta: function(event2) {
          var delta = 0;
          switch (event2.type) {
            case "DOMMouseScroll":
              delta = event2.detail / 3;
              break;
            case "mousewheel":
              delta = event2.wheelDelta / 120;
              break;
            case "wheel":
              delta = event2.deltaY;
              switch (event2.deltaMode) {
                case 0:
                  delta /= 100;
                  break;
                case 1:
                  delta /= 3;
                  break;
                case 2:
                  delta *= 80;
                  break;
                default:
                  throw "unrecognized mouse wheel delta mode: " + event2.deltaMode;
              }
              break;
            default:
              throw "unrecognized mouse wheel event: " + event2.type;
          }
          return delta;
        }, mouseX: 0, mouseY: 0, mouseMovementX: 0, mouseMovementY: 0, touches: {}, lastTouches: {}, calculateMouseEvent: function(event2) {
          if (Browser.pointerLock) {
            if (event2.type != "mousemove" && "mozMovementX" in event2) {
              Browser.mouseMovementX = Browser.mouseMovementY = 0;
            } else {
              Browser.mouseMovementX = Browser.getMovementX(event2);
              Browser.mouseMovementY = Browser.getMovementY(event2);
            }
            if (typeof SDL != "undefined") {
              Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
              Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
            } else {
              Browser.mouseX += Browser.mouseMovementX;
              Browser.mouseY += Browser.mouseMovementY;
            }
          } else {
            var rect = Module2["canvas"].getBoundingClientRect();
            var cw = Module2["canvas"].width;
            var ch = Module2["canvas"].height;
            var scrollX = typeof window.scrollX != "undefined" ? window.scrollX : window.pageXOffset;
            var scrollY = typeof window.scrollY != "undefined" ? window.scrollY : window.pageYOffset;
            if (event2.type === "touchstart" || event2.type === "touchend" || event2.type === "touchmove") {
              var touch = event2.touch;
              if (touch === void 0) {
                return;
              }
              var adjustedX = touch.pageX - (scrollX + rect.left);
              var adjustedY = touch.pageY - (scrollY + rect.top);
              adjustedX = adjustedX * (cw / rect.width);
              adjustedY = adjustedY * (ch / rect.height);
              var coords = { x: adjustedX, y: adjustedY };
              if (event2.type === "touchstart") {
                Browser.lastTouches[touch.identifier] = coords;
                Browser.touches[touch.identifier] = coords;
              } else if (event2.type === "touchend" || event2.type === "touchmove") {
                var last = Browser.touches[touch.identifier];
                if (!last) last = coords;
                Browser.lastTouches[touch.identifier] = last;
                Browser.touches[touch.identifier] = coords;
              }
              return;
            }
            var x = event2.pageX - (scrollX + rect.left);
            var y = event2.pageY - (scrollY + rect.top);
            x = x * (cw / rect.width);
            y = y * (ch / rect.height);
            Browser.mouseMovementX = x - Browser.mouseX;
            Browser.mouseMovementY = y - Browser.mouseY;
            Browser.mouseX = x;
            Browser.mouseY = y;
          }
        }, resizeListeners: [], updateResizeListeners: function() {
          var canvas = Module2["canvas"];
          Browser.resizeListeners.forEach(function(listener) {
            listener(canvas.width, canvas.height);
          });
        }, setCanvasSize: function(width, height, noUpdates) {
          var canvas = Module2["canvas"];
          Browser.updateCanvasDimensions(canvas, width, height);
          if (!noUpdates) Browser.updateResizeListeners();
        }, windowedWidth: 0, windowedHeight: 0, setFullscreenCanvasSize: function() {
          if (typeof SDL != "undefined") {
            var flags = HEAPU32[SDL.screen >> 2];
            flags = flags | 8388608;
            HEAP32[SDL.screen >> 2] = flags;
          }
          Browser.updateCanvasDimensions(Module2["canvas"]);
          Browser.updateResizeListeners();
        }, setWindowedCanvasSize: function() {
          if (typeof SDL != "undefined") {
            var flags = HEAPU32[SDL.screen >> 2];
            flags = flags & ~8388608;
            HEAP32[SDL.screen >> 2] = flags;
          }
          Browser.updateCanvasDimensions(Module2["canvas"]);
          Browser.updateResizeListeners();
        }, updateCanvasDimensions: function(canvas, wNative, hNative) {
          if (wNative && hNative) {
            canvas.widthNative = wNative;
            canvas.heightNative = hNative;
          } else {
            wNative = canvas.widthNative;
            hNative = canvas.heightNative;
          }
          var w = wNative;
          var h = hNative;
          if (Module2["forcedAspectRatio"] && Module2["forcedAspectRatio"] > 0) {
            if (w / h < Module2["forcedAspectRatio"]) {
              w = Math.round(h * Module2["forcedAspectRatio"]);
            } else {
              h = Math.round(w / Module2["forcedAspectRatio"]);
            }
          }
          if ((document["fullscreenElement"] || document["mozFullScreenElement"] || document["msFullscreenElement"] || document["webkitFullscreenElement"] || document["webkitCurrentFullScreenElement"]) === canvas.parentNode && typeof screen != "undefined") {
            var factor = Math.min(screen.width / w, screen.height / h);
            w = Math.round(w * factor);
            h = Math.round(h * factor);
          }
          if (Browser.resizeCanvas) {
            if (canvas.width != w) canvas.width = w;
            if (canvas.height != h) canvas.height = h;
            if (typeof canvas.style != "undefined") {
              canvas.style.removeProperty("width");
              canvas.style.removeProperty("height");
            }
          } else {
            if (canvas.width != wNative) canvas.width = wNative;
            if (canvas.height != hNative) canvas.height = hNative;
            if (typeof canvas.style != "undefined") {
              if (w != wNative || h != hNative) {
                canvas.style.setProperty("width", w + "px", "important");
                canvas.style.setProperty("height", h + "px", "important");
              } else {
                canvas.style.removeProperty("width");
                canvas.style.removeProperty("height");
              }
            }
          }
        } };
        Module2["Browser"] = Browser;
        function listenOnce(object, event2, func) {
          object.addEventListener(event2, func, { "once": true });
        }
        Module2["listenOnce"] = listenOnce;
        function autoResumeAudioContext(ctx, elements) {
          if (!elements) {
            elements = [document, document.getElementById("canvas")];
          }
          ["keydown", "mousedown", "touchstart"].forEach(function(event2) {
            elements.forEach(function(element) {
              if (element) {
                listenOnce(element, event2, () => {
                  if (ctx.state === "suspended") ctx.resume();
                });
              }
            });
          });
        }
        Module2["autoResumeAudioContext"] = autoResumeAudioContext;
        function callRuntimeCallbacks(callbacks) {
          while (callbacks.length > 0) {
            callbacks.shift()(Module2);
          }
        }
        Module2["callRuntimeCallbacks"] = callRuntimeCallbacks;
        function withStackSave(f) {
          var stack = stackSave();
          var ret = f();
          stackRestore(stack);
          return ret;
        }
        Module2["withStackSave"] = withStackSave;
        function demangle(func) {
          demangle.recursionGuard = (demangle.recursionGuard | 0) + 1;
          if (demangle.recursionGuard > 1) return func;
          return withStackSave(function() {
            try {
              var s = func;
              if (s.startsWith("__Z")) s = s.substr(1);
              var len = lengthBytesUTF8(s) + 1;
              var buf = stackAlloc(len);
              stringToUTF8(s, buf, len);
              var status = stackAlloc(4);
              var ret = ___cxa_demangle(buf, 0, 0, status);
              if (HEAP32[status >> 2] === 0 && ret) {
                return UTF8ToString(ret);
              }
            } catch (e) {
            } finally {
              _free(ret);
              if (demangle.recursionGuard < 2) --demangle.recursionGuard;
            }
            return func;
          });
        }
        Module2["demangle"] = demangle;
        function dynCallLegacy(sig, ptr, args) {
          var f = Module2["dynCall_" + sig];
          return args && args.length ? f.apply(null, [ptr].concat(args)) : f.call(null, ptr);
        }
        Module2["dynCallLegacy"] = dynCallLegacy;
        var wasmTableMirror = [];
        Module2["wasmTableMirror"] = wasmTableMirror;
        function getWasmTableEntry(funcPtr) {
          var func = wasmTableMirror[funcPtr];
          if (!func) {
            if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
            wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
          }
          return func;
        }
        Module2["getWasmTableEntry"] = getWasmTableEntry;
        function dynCall(sig, ptr, args) {
          return dynCallLegacy(sig, ptr, args);
        }
        Module2["dynCall"] = dynCall;
        function getValue(ptr, type = "i8") {
          if (type.endsWith("*")) type = "*";
          switch (type) {
            case "i1":
              return HEAP8[ptr >> 0];
            case "i8":
              return HEAP8[ptr >> 0];
            case "i16":
              return HEAP16[ptr >> 1];
            case "i32":
              return HEAP32[ptr >> 2];
            case "i64":
              return HEAP32[ptr >> 2];
            case "float":
              return HEAPF32[ptr >> 2];
            case "double":
              return HEAPF64[ptr >> 3];
            case "*":
              return HEAPU32[ptr >> 2];
            default:
              abort("invalid type for getValue: " + type);
          }
          return null;
        }
        Module2["getValue"] = getValue;
        function setValue(ptr, value, type = "i8") {
          if (type.endsWith("*")) type = "*";
          switch (type) {
            case "i1":
              HEAP8[ptr >> 0] = value;
              break;
            case "i8":
              HEAP8[ptr >> 0] = value;
              break;
            case "i16":
              HEAP16[ptr >> 1] = value;
              break;
            case "i32":
              HEAP32[ptr >> 2] = value;
              break;
            case "i64":
              tempI64 = [value >>> 0, (tempDouble = value, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
              break;
            case "float":
              HEAPF32[ptr >> 2] = value;
              break;
            case "double":
              HEAPF64[ptr >> 3] = value;
              break;
            case "*":
              HEAPU32[ptr >> 2] = value;
              break;
            default:
              abort("invalid type for setValue: " + type);
          }
        }
        Module2["setValue"] = setValue;
        function jsStackTrace() {
          var error = new Error();
          if (!error.stack) {
            try {
              throw new Error();
            } catch (e) {
              error = e;
            }
            if (!error.stack) {
              return "(no stack trace available)";
            }
          }
          return error.stack.toString();
        }
        Module2["jsStackTrace"] = jsStackTrace;
        function demangleAll(text) {
          var regex = /\b_Z[\w\d_]+/g;
          return text.replace(regex, function(x) {
            var y = demangle(x);
            return x === y ? x : y + " [" + x + "]";
          });
        }
        Module2["demangleAll"] = demangleAll;
        function stackTrace() {
          var js = jsStackTrace();
          if (Module2["extraStackTrace"]) js += "\n" + Module2["extraStackTrace"]();
          return demangleAll(js);
        }
        Module2["stackTrace"] = stackTrace;
        function ___assert_fail(condition, filename, line, func) {
          abort("Assertion failed: " + UTF8ToString(condition) + ", at: " + [filename ? UTF8ToString(filename) : "unknown filename", line, func ? UTF8ToString(func) : "unknown function"]);
        }
        Module2["___assert_fail"] = ___assert_fail;
        function ___cxa_allocate_exception(size) {
          return _malloc(size + 24) + 24;
        }
        Module2["___cxa_allocate_exception"] = ___cxa_allocate_exception;
        function ExceptionInfo(excPtr) {
          this.excPtr = excPtr;
          this.ptr = excPtr - 24;
          this.set_type = function(type) {
            HEAPU32[this.ptr + 4 >> 2] = type;
          };
          this.get_type = function() {
            return HEAPU32[this.ptr + 4 >> 2];
          };
          this.set_destructor = function(destructor) {
            HEAPU32[this.ptr + 8 >> 2] = destructor;
          };
          this.get_destructor = function() {
            return HEAPU32[this.ptr + 8 >> 2];
          };
          this.set_refcount = function(refcount) {
            HEAP32[this.ptr >> 2] = refcount;
          };
          this.set_caught = function(caught) {
            caught = caught ? 1 : 0;
            HEAP8[this.ptr + 12 >> 0] = caught;
          };
          this.get_caught = function() {
            return HEAP8[this.ptr + 12 >> 0] != 0;
          };
          this.set_rethrown = function(rethrown) {
            rethrown = rethrown ? 1 : 0;
            HEAP8[this.ptr + 13 >> 0] = rethrown;
          };
          this.get_rethrown = function() {
            return HEAP8[this.ptr + 13 >> 0] != 0;
          };
          this.init = function(type, destructor) {
            this.set_adjusted_ptr(0);
            this.set_type(type);
            this.set_destructor(destructor);
            this.set_refcount(0);
            this.set_caught(false);
            this.set_rethrown(false);
          };
          this.add_ref = function() {
            var value = HEAP32[this.ptr >> 2];
            HEAP32[this.ptr >> 2] = value + 1;
          };
          this.release_ref = function() {
            var prev = HEAP32[this.ptr >> 2];
            HEAP32[this.ptr >> 2] = prev - 1;
            return prev === 1;
          };
          this.set_adjusted_ptr = function(adjustedPtr) {
            HEAPU32[this.ptr + 16 >> 2] = adjustedPtr;
          };
          this.get_adjusted_ptr = function() {
            return HEAPU32[this.ptr + 16 >> 2];
          };
          this.get_exception_ptr = function() {
            var isPointer = ___cxa_is_pointer_type(this.get_type());
            if (isPointer) {
              return HEAPU32[this.excPtr >> 2];
            }
            var adjusted = this.get_adjusted_ptr();
            if (adjusted !== 0) return adjusted;
            return this.excPtr;
          };
        }
        Module2["ExceptionInfo"] = ExceptionInfo;
        var exceptionLast = 0;
        Module2["exceptionLast"] = exceptionLast;
        var uncaughtExceptionCount = 0;
        Module2["uncaughtExceptionCount"] = uncaughtExceptionCount;
        function ___cxa_throw(ptr, type, destructor) {
          var info = new ExceptionInfo(ptr);
          info.init(type, destructor);
          exceptionLast = ptr;
          uncaughtExceptionCount++;
          throw ptr;
        }
        Module2["___cxa_throw"] = ___cxa_throw;
        function setErrNo(value) {
          HEAP32[___errno_location() >> 2] = value;
          return value;
        }
        Module2["setErrNo"] = setErrNo;
        function ___syscall_fcntl64(fd, cmd, varargs) {
          SYSCALLS.varargs = varargs;
          try {
            var stream = SYSCALLS.getStreamFromFD(fd);
            switch (cmd) {
              case 0: {
                var arg = SYSCALLS.get();
                if (arg < 0) {
                  return -28;
                }
                var newStream;
                newStream = FS.createStream(stream, arg);
                return newStream.fd;
              }
              case 1:
              case 2:
                return 0;
              case 3:
                return stream.flags;
              case 4: {
                var arg = SYSCALLS.get();
                stream.flags |= arg;
                return 0;
              }
              case 5: {
                var arg = SYSCALLS.get();
                var offset = 0;
                HEAP16[arg + offset >> 1] = 2;
                return 0;
              }
              case 6:
              case 7:
                return 0;
              case 16:
              case 8:
                return -28;
              case 9:
                setErrNo(28);
                return -1;
              default: {
                return -28;
              }
            }
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["___syscall_fcntl64"] = ___syscall_fcntl64;
        function ___syscall_fstat64(fd, buf) {
          try {
            var stream = SYSCALLS.getStreamFromFD(fd);
            return SYSCALLS.doStat(FS.stat, stream.path, buf);
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["___syscall_fstat64"] = ___syscall_fstat64;
        function ___syscall_getdents64(fd, dirp, count) {
          try {
            var stream = SYSCALLS.getStreamFromFD(fd);
            if (!stream.getdents) {
              stream.getdents = FS.readdir(stream.path);
            }
            var struct_size = 280;
            var pos = 0;
            var off = FS.llseek(stream, 0, 1);
            var idx = Math.floor(off / struct_size);
            while (idx < stream.getdents.length && pos + struct_size <= count) {
              var id;
              var type;
              var name = stream.getdents[idx];
              if (name === ".") {
                id = stream.node.id;
                type = 4;
              } else if (name === "..") {
                var lookup = FS.lookupPath(stream.path, { parent: true });
                id = lookup.node.id;
                type = 4;
              } else {
                var child = FS.lookupNode(stream.node, name);
                id = child.id;
                type = FS.isChrdev(child.mode) ? 2 : FS.isDir(child.mode) ? 4 : FS.isLink(child.mode) ? 10 : 8;
              }
              tempI64 = [id >>> 0, (tempDouble = id, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[dirp + pos >> 2] = tempI64[0], HEAP32[dirp + pos + 4 >> 2] = tempI64[1];
              tempI64 = [(idx + 1) * struct_size >>> 0, (tempDouble = (idx + 1) * struct_size, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[dirp + pos + 8 >> 2] = tempI64[0], HEAP32[dirp + pos + 12 >> 2] = tempI64[1];
              HEAP16[dirp + pos + 16 >> 1] = 280;
              HEAP8[dirp + pos + 18 >> 0] = type;
              stringToUTF8(name, dirp + pos + 19, 256);
              pos += struct_size;
              idx += 1;
            }
            FS.llseek(stream, idx * struct_size, 0);
            return pos;
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["___syscall_getdents64"] = ___syscall_getdents64;
        function ___syscall_ioctl(fd, op, varargs) {
          SYSCALLS.varargs = varargs;
          try {
            var stream = SYSCALLS.getStreamFromFD(fd);
            switch (op) {
              case 21509:
              case 21505: {
                if (!stream.tty) return -59;
                return 0;
              }
              case 21510:
              case 21511:
              case 21512:
              case 21506:
              case 21507:
              case 21508: {
                if (!stream.tty) return -59;
                return 0;
              }
              case 21519: {
                if (!stream.tty) return -59;
                var argp = SYSCALLS.get();
                HEAP32[argp >> 2] = 0;
                return 0;
              }
              case 21520: {
                if (!stream.tty) return -59;
                return -28;
              }
              case 21531: {
                var argp = SYSCALLS.get();
                return FS.ioctl(stream, op, argp);
              }
              case 21523: {
                if (!stream.tty) return -59;
                return 0;
              }
              case 21524: {
                if (!stream.tty) return -59;
                return 0;
              }
              default:
                return -28;
            }
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["___syscall_ioctl"] = ___syscall_ioctl;
        function ___syscall_lstat64(path, buf) {
          try {
            path = SYSCALLS.getStr(path);
            return SYSCALLS.doStat(FS.lstat, path, buf);
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["___syscall_lstat64"] = ___syscall_lstat64;
        function ___syscall_mkdirat(dirfd, path, mode) {
          try {
            path = SYSCALLS.getStr(path);
            path = SYSCALLS.calculateAt(dirfd, path);
            path = PATH.normalize(path);
            if (path[path.length - 1] === "/") path = path.substr(0, path.length - 1);
            FS.mkdir(path, mode, 0);
            return 0;
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["___syscall_mkdirat"] = ___syscall_mkdirat;
        function ___syscall_mknodat(dirfd, path, mode, dev) {
          try {
            path = SYSCALLS.getStr(path);
            path = SYSCALLS.calculateAt(dirfd, path);
            switch (mode & 61440) {
              case 32768:
              case 8192:
              case 24576:
              case 4096:
              case 49152:
                break;
              default:
                return -28;
            }
            FS.mknod(path, mode, dev);
            return 0;
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["___syscall_mknodat"] = ___syscall_mknodat;
        function ___syscall_newfstatat(dirfd, path, buf, flags) {
          try {
            path = SYSCALLS.getStr(path);
            var nofollow = flags & 256;
            var allowEmpty = flags & 4096;
            flags = flags & ~4352;
            path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
            return SYSCALLS.doStat(nofollow ? FS.lstat : FS.stat, path, buf);
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["___syscall_newfstatat"] = ___syscall_newfstatat;
        function ___syscall_openat(dirfd, path, flags, varargs) {
          SYSCALLS.varargs = varargs;
          try {
            path = SYSCALLS.getStr(path);
            path = SYSCALLS.calculateAt(dirfd, path);
            var mode = varargs ? SYSCALLS.get() : 0;
            return FS.open(path, flags, mode).fd;
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["___syscall_openat"] = ___syscall_openat;
        function ___syscall_stat64(path, buf) {
          try {
            path = SYSCALLS.getStr(path);
            return SYSCALLS.doStat(FS.stat, path, buf);
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["___syscall_stat64"] = ___syscall_stat64;
        var dlopenMissingError = "To use dlopen, you need enable dynamic linking, see https://github.com/emscripten-core/emscripten/wiki/Linking";
        Module2["dlopenMissingError"] = dlopenMissingError;
        function __dlsym_js(handle, symbol) {
          abort(dlopenMissingError);
        }
        Module2["__dlsym_js"] = __dlsym_js;
        var nowIsMonotonic = true;
        Module2["nowIsMonotonic"] = nowIsMonotonic;
        function __emscripten_get_now_is_monotonic() {
          return nowIsMonotonic;
        }
        Module2["__emscripten_get_now_is_monotonic"] = __emscripten_get_now_is_monotonic;
        function __emscripten_throw_longjmp() {
          throw Infinity;
        }
        Module2["__emscripten_throw_longjmp"] = __emscripten_throw_longjmp;
        function readI53FromI64(ptr) {
          return HEAPU32[ptr >> 2] + HEAP32[ptr + 4 >> 2] * 4294967296;
        }
        Module2["readI53FromI64"] = readI53FromI64;
        function __isLeapYear(year) {
          return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        }
        Module2["__isLeapYear"] = __isLeapYear;
        var __MONTH_DAYS_LEAP_CUMULATIVE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
        Module2["__MONTH_DAYS_LEAP_CUMULATIVE"] = __MONTH_DAYS_LEAP_CUMULATIVE;
        var __MONTH_DAYS_REGULAR_CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        Module2["__MONTH_DAYS_REGULAR_CUMULATIVE"] = __MONTH_DAYS_REGULAR_CUMULATIVE;
        function __yday_from_date(date) {
          var isLeapYear = __isLeapYear(date.getFullYear());
          var monthDaysCumulative = isLeapYear ? __MONTH_DAYS_LEAP_CUMULATIVE : __MONTH_DAYS_REGULAR_CUMULATIVE;
          var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1;
          return yday;
        }
        Module2["__yday_from_date"] = __yday_from_date;
        function __localtime_js(time, tmPtr) {
          var date = new Date(readI53FromI64(time) * 1e3);
          HEAP32[tmPtr >> 2] = date.getSeconds();
          HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
          HEAP32[tmPtr + 8 >> 2] = date.getHours();
          HEAP32[tmPtr + 12 >> 2] = date.getDate();
          HEAP32[tmPtr + 16 >> 2] = date.getMonth();
          HEAP32[tmPtr + 20 >> 2] = date.getFullYear() - 1900;
          HEAP32[tmPtr + 24 >> 2] = date.getDay();
          var yday = __yday_from_date(date) | 0;
          HEAP32[tmPtr + 28 >> 2] = yday;
          HEAP32[tmPtr + 36 >> 2] = -(date.getTimezoneOffset() * 60);
          var start = new Date(date.getFullYear(), 0, 1);
          var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
          var winterOffset = start.getTimezoneOffset();
          var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
          HEAP32[tmPtr + 32 >> 2] = dst;
        }
        Module2["__localtime_js"] = __localtime_js;
        function __mmap_js(len, prot, flags, fd, off, allocated, addr) {
          try {
            var stream = SYSCALLS.getStreamFromFD(fd);
            var res = FS.mmap(stream, len, off, prot, flags);
            var ptr = res.ptr;
            HEAP32[allocated >> 2] = res.allocated;
            HEAPU32[addr >> 2] = ptr;
            return 0;
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["__mmap_js"] = __mmap_js;
        function __munmap_js(addr, len, prot, flags, fd, offset) {
          try {
            var stream = SYSCALLS.getStreamFromFD(fd);
            if (prot & 2) {
              SYSCALLS.doMsync(addr, stream, len, flags, offset);
            }
            FS.munmap(stream);
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return -e.errno;
          }
        }
        Module2["__munmap_js"] = __munmap_js;
        function allocateUTF8(str) {
          var size = lengthBytesUTF8(str) + 1;
          var ret = _malloc(size);
          if (ret) stringToUTF8Array(str, HEAP8, ret, size);
          return ret;
        }
        Module2["allocateUTF8"] = allocateUTF8;
        function __tzset_js(timezone, daylight, tzname) {
          var currentYear = (/* @__PURE__ */ new Date()).getFullYear();
          var winter = new Date(currentYear, 0, 1);
          var summer = new Date(currentYear, 6, 1);
          var winterOffset = winter.getTimezoneOffset();
          var summerOffset = summer.getTimezoneOffset();
          var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
          HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
          HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
          function extractZone(date) {
            var match = date.toTimeString().match(/\(([A-Za-z ]+)\)$/);
            return match ? match[1] : "GMT";
          }
          var winterName = extractZone(winter);
          var summerName = extractZone(summer);
          var winterNamePtr = allocateUTF8(winterName);
          var summerNamePtr = allocateUTF8(summerName);
          if (summerOffset < winterOffset) {
            HEAPU32[tzname >> 2] = winterNamePtr;
            HEAPU32[tzname + 4 >> 2] = summerNamePtr;
          } else {
            HEAPU32[tzname >> 2] = summerNamePtr;
            HEAPU32[tzname + 4 >> 2] = winterNamePtr;
          }
        }
        Module2["__tzset_js"] = __tzset_js;
        function _abort() {
          abort("");
        }
        Module2["_abort"] = _abort;
        function _beginStats() {
          if (Module2.beginStats) {
            Module2.beginStats();
          }
        }
        Module2["_beginStats"] = _beginStats;
        function _checkForUnreliableMessages(responseBufferPointer, maxNumberOfMessages, numberOfMessagesPresentPointer) {
          let numberOfMessages = 0;
          for (let i2 = 0; i2 < maxNumberOfMessages; i2++) {
            if (Module2.netplay.pendingUnreliableMessages[0]) {
              const messageData = Module2.netplay.pendingUnreliableMessages[0];
              Module2.netplay.pendingUnreliableMessages.splice(0, 1);
              const data = new Uint8Array(messageData);
              const offset = i2 * 512;
              for (let j = 0; j < data.length; j++) {
                HEAPU8[responseBufferPointer + j + offset] = data[j];
              }
              numberOfMessages++;
            } else {
              break;
            }
          }
          Module2.setValue(numberOfMessagesPresentPointer, numberOfMessages, "i32");
        }
        Module2["_checkForUnreliableMessages"] = _checkForUnreliableMessages;
        function _compileAndPatchModule(block, modulePointer, moduleLength, usedFunctionsPointerArray, numberOfFunctionsUsed, recompTargetFunctionPointers, numRecompTargets) {
          return Asyncify.handleAsync(function() {
            const indirectFunctionTable = Module2["asm"]["__indirect_function_table"];
            const memory = Module2["asm"]["memory"];
            const table = new WebAssembly.Table({ element: "anyfunc", initial: numberOfFunctionsUsed });
            for (let i2 = 0; i2 < numberOfFunctionsUsed; i2++) {
              const originalFunctionPointer = getValue(usedFunctionsPointerArray + i2 * 4, "i32");
              table.set(i2, indirectFunctionTable.get(originalFunctionPointer));
            }
            const env = { funcref: table, mem: memory };
            const imports = { env };
            const moduleBytes = HEAPU8.slice(modulePointer, modulePointer + moduleLength);
            return WebAssembly.instantiate(moduleBytes, imports).then(function({ instance }) {
              if (!Module2.blockToCompiledFunctionIndexes[block]) {
                Module2.blockToCompiledFunctionIndexes[block] = [];
              }
              for (let i2 = 0; i2 < numRecompTargets; i2++) {
                const exportedFunction = instance.exports[`f${i2}`];
                if (Module2.availableFunctionTableSlots.size < 1) {
                  const tableLengthBefore = indirectFunctionTable.length;
                  const numberOfSlotsToAdd = Module2.numberOfFunctionTableSlotsToGrowBy;
                  indirectFunctionTable.grow(numberOfSlotsToAdd);
                  for (let i3 = 0; i3 < numberOfSlotsToAdd; i3++) {
                    Module2.availableFunctionTableSlots.add(i3 + tableLengthBefore);
                  }
                }
                const functionIndex = Module2.availableFunctionTableSlots.values().next().value;
                if (!functionIndex) {
                  throw "Unexpectedly ran out of function indexes!";
                }
                Module2.availableFunctionTableSlots.delete(functionIndex);
                if (indirectFunctionTable.get(functionIndex) !== null) {
                  throw "Entry in the function table is already set!";
                }
                indirectFunctionTable.set(functionIndex, exportedFunction);
                Module2.blockToCompiledFunctionIndexes[block].push(functionIndex);
                const instructionOpsPointer = recompTargetFunctionPointers + i2 * 4;
                setValue(instructionOpsPointer, functionIndex, "i32");
              }
            }).catch((err2) => {
              console.error("failed to instantiate module!: ", err2);
            });
          });
        }
        Module2["_compileAndPatchModule"] = _compileAndPatchModule;
        var EGL = { errorCode: 12288, defaultDisplayInitialized: false, currentContext: 0, currentReadSurface: 0, currentDrawSurface: 0, contextAttributes: { alpha: false, depth: false, stencil: false, antialias: false }, stringCache: {}, setErrorCode: function(code) {
          EGL.errorCode = code;
        }, chooseConfig: function(display, attribList, config, config_size, numConfigs) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          if (attribList) {
            for (; ; ) {
              var param = HEAP32[attribList >> 2];
              if (param == 12321) {
                var alphaSize = HEAP32[attribList + 4 >> 2];
                EGL.contextAttributes.alpha = alphaSize > 0;
              } else if (param == 12325) {
                var depthSize = HEAP32[attribList + 4 >> 2];
                EGL.contextAttributes.depth = depthSize > 0;
              } else if (param == 12326) {
                var stencilSize = HEAP32[attribList + 4 >> 2];
                EGL.contextAttributes.stencil = stencilSize > 0;
              } else if (param == 12337) {
                var samples = HEAP32[attribList + 4 >> 2];
                EGL.contextAttributes.antialias = samples > 0;
              } else if (param == 12338) {
                var samples = HEAP32[attribList + 4 >> 2];
                EGL.contextAttributes.antialias = samples == 1;
              } else if (param == 12544) {
                var requestedPriority = HEAP32[attribList + 4 >> 2];
                EGL.contextAttributes.lowLatency = requestedPriority != 12547;
              } else if (param == 12344) {
                break;
              }
              attribList += 8;
            }
          }
          if ((!config || !config_size) && !numConfigs) {
            EGL.setErrorCode(12300);
            return 0;
          }
          if (numConfigs) {
            HEAP32[numConfigs >> 2] = 1;
          }
          if (config && config_size > 0) {
            HEAP32[config >> 2] = 62002;
          }
          EGL.setErrorCode(12288);
          return 1;
        } };
        Module2["EGL"] = EGL;
        function _eglBindAPI(api) {
          if (api == 12448) {
            EGL.setErrorCode(12288);
            return 1;
          }
          EGL.setErrorCode(12300);
          return 0;
        }
        Module2["_eglBindAPI"] = _eglBindAPI;
        function _eglChooseConfig(display, attrib_list, configs, config_size, numConfigs) {
          return EGL.chooseConfig(display, attrib_list, configs, config_size, numConfigs);
        }
        Module2["_eglChooseConfig"] = _eglChooseConfig;
        function __webgl_enable_ANGLE_instanced_arrays(ctx) {
          var ext = ctx.getExtension("ANGLE_instanced_arrays");
          if (ext) {
            ctx["vertexAttribDivisor"] = function(index, divisor) {
              ext["vertexAttribDivisorANGLE"](index, divisor);
            };
            ctx["drawArraysInstanced"] = function(mode, first, count, primcount) {
              ext["drawArraysInstancedANGLE"](mode, first, count, primcount);
            };
            ctx["drawElementsInstanced"] = function(mode, count, type, indices, primcount) {
              ext["drawElementsInstancedANGLE"](mode, count, type, indices, primcount);
            };
            return 1;
          }
        }
        Module2["__webgl_enable_ANGLE_instanced_arrays"] = __webgl_enable_ANGLE_instanced_arrays;
        function __webgl_enable_OES_vertex_array_object(ctx) {
          var ext = ctx.getExtension("OES_vertex_array_object");
          if (ext) {
            ctx["createVertexArray"] = function() {
              return ext["createVertexArrayOES"]();
            };
            ctx["deleteVertexArray"] = function(vao) {
              ext["deleteVertexArrayOES"](vao);
            };
            ctx["bindVertexArray"] = function(vao) {
              ext["bindVertexArrayOES"](vao);
            };
            ctx["isVertexArray"] = function(vao) {
              return ext["isVertexArrayOES"](vao);
            };
            return 1;
          }
        }
        Module2["__webgl_enable_OES_vertex_array_object"] = __webgl_enable_OES_vertex_array_object;
        function __webgl_enable_WEBGL_draw_buffers(ctx) {
          var ext = ctx.getExtension("WEBGL_draw_buffers");
          if (ext) {
            ctx["drawBuffers"] = function(n, bufs) {
              ext["drawBuffersWEBGL"](n, bufs);
            };
            return 1;
          }
        }
        Module2["__webgl_enable_WEBGL_draw_buffers"] = __webgl_enable_WEBGL_draw_buffers;
        function __webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(ctx) {
          return !!(ctx.dibvbi = ctx.getExtension("WEBGL_draw_instanced_base_vertex_base_instance"));
        }
        Module2["__webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance"] = __webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance;
        function __webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance(ctx) {
          return !!(ctx.mdibvbi = ctx.getExtension("WEBGL_multi_draw_instanced_base_vertex_base_instance"));
        }
        Module2["__webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance"] = __webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance;
        function __webgl_enable_WEBGL_multi_draw(ctx) {
          return !!(ctx.multiDrawWebgl = ctx.getExtension("WEBGL_multi_draw"));
        }
        Module2["__webgl_enable_WEBGL_multi_draw"] = __webgl_enable_WEBGL_multi_draw;
        var GL = { counter: 1, buffers: [], mappedBuffers: {}, programs: [], framebuffers: [], renderbuffers: [], textures: [], shaders: [], vaos: [], contexts: [], offscreenCanvases: {}, queries: [], samplers: [], transformFeedbacks: [], syncs: [], byteSizeByTypeRoot: 5120, byteSizeByType: [1, 1, 2, 2, 4, 4, 4, 2, 3, 4, 8], stringCache: {}, stringiCache: {}, unpackAlignment: 4, recordError: function recordError(errorCode) {
          if (!GL.lastError) {
            GL.lastError = errorCode;
          }
        }, getNewId: function(table) {
          var ret = GL.counter++;
          for (var i2 = table.length; i2 < ret; i2++) {
            table[i2] = null;
          }
          return ret;
        }, MAX_TEMP_BUFFER_SIZE: 2097152, numTempVertexBuffersPerSize: 64, log2ceilLookup: function(i2) {
          return 32 - Math.clz32(i2 === 0 ? 0 : i2 - 1);
        }, generateTempBuffers: function(quads, context) {
          var largestIndex = GL.log2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);
          context.tempVertexBufferCounters1 = [];
          context.tempVertexBufferCounters2 = [];
          context.tempVertexBufferCounters1.length = context.tempVertexBufferCounters2.length = largestIndex + 1;
          context.tempVertexBuffers1 = [];
          context.tempVertexBuffers2 = [];
          context.tempVertexBuffers1.length = context.tempVertexBuffers2.length = largestIndex + 1;
          context.tempIndexBuffers = [];
          context.tempIndexBuffers.length = largestIndex + 1;
          for (var i2 = 0; i2 <= largestIndex; ++i2) {
            context.tempIndexBuffers[i2] = null;
            context.tempVertexBufferCounters1[i2] = context.tempVertexBufferCounters2[i2] = 0;
            var ringbufferLength = GL.numTempVertexBuffersPerSize;
            context.tempVertexBuffers1[i2] = [];
            context.tempVertexBuffers2[i2] = [];
            var ringbuffer1 = context.tempVertexBuffers1[i2];
            var ringbuffer2 = context.tempVertexBuffers2[i2];
            ringbuffer1.length = ringbuffer2.length = ringbufferLength;
            for (var j = 0; j < ringbufferLength; ++j) {
              ringbuffer1[j] = ringbuffer2[j] = null;
            }
          }
          if (quads) {
            context.tempQuadIndexBuffer = GLctx.createBuffer();
            context.GLctx.bindBuffer(34963, context.tempQuadIndexBuffer);
            var numIndexes = GL.MAX_TEMP_BUFFER_SIZE >> 1;
            var quadIndexes = new Uint16Array(numIndexes);
            var i2 = 0, v = 0;
            while (1) {
              quadIndexes[i2++] = v;
              if (i2 >= numIndexes) break;
              quadIndexes[i2++] = v + 1;
              if (i2 >= numIndexes) break;
              quadIndexes[i2++] = v + 2;
              if (i2 >= numIndexes) break;
              quadIndexes[i2++] = v;
              if (i2 >= numIndexes) break;
              quadIndexes[i2++] = v + 2;
              if (i2 >= numIndexes) break;
              quadIndexes[i2++] = v + 3;
              if (i2 >= numIndexes) break;
              v += 4;
            }
            context.GLctx.bufferData(34963, quadIndexes, 35044);
            context.GLctx.bindBuffer(34963, null);
          }
        }, getTempVertexBuffer: function getTempVertexBuffer(sizeBytes) {
          var idx = GL.log2ceilLookup(sizeBytes);
          var ringbuffer = GL.currentContext.tempVertexBuffers1[idx];
          var nextFreeBufferIndex = GL.currentContext.tempVertexBufferCounters1[idx];
          GL.currentContext.tempVertexBufferCounters1[idx] = GL.currentContext.tempVertexBufferCounters1[idx] + 1 & GL.numTempVertexBuffersPerSize - 1;
          var vbo = ringbuffer[nextFreeBufferIndex];
          if (vbo) {
            return vbo;
          }
          var prevVBO = GLctx.getParameter(34964);
          ringbuffer[nextFreeBufferIndex] = GLctx.createBuffer();
          GLctx.bindBuffer(34962, ringbuffer[nextFreeBufferIndex]);
          GLctx.bufferData(34962, 1 << idx, 35048);
          GLctx.bindBuffer(34962, prevVBO);
          return ringbuffer[nextFreeBufferIndex];
        }, getTempIndexBuffer: function getTempIndexBuffer(sizeBytes) {
          var idx = GL.log2ceilLookup(sizeBytes);
          var ibo = GL.currentContext.tempIndexBuffers[idx];
          if (ibo) {
            return ibo;
          }
          var prevIBO = GLctx.getParameter(34965);
          GL.currentContext.tempIndexBuffers[idx] = GLctx.createBuffer();
          GLctx.bindBuffer(34963, GL.currentContext.tempIndexBuffers[idx]);
          GLctx.bufferData(34963, 1 << idx, 35048);
          GLctx.bindBuffer(34963, prevIBO);
          return GL.currentContext.tempIndexBuffers[idx];
        }, newRenderingFrameStarted: function newRenderingFrameStarted() {
          if (!GL.currentContext) {
            return;
          }
          var vb = GL.currentContext.tempVertexBuffers1;
          GL.currentContext.tempVertexBuffers1 = GL.currentContext.tempVertexBuffers2;
          GL.currentContext.tempVertexBuffers2 = vb;
          vb = GL.currentContext.tempVertexBufferCounters1;
          GL.currentContext.tempVertexBufferCounters1 = GL.currentContext.tempVertexBufferCounters2;
          GL.currentContext.tempVertexBufferCounters2 = vb;
          var largestIndex = GL.log2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);
          for (var i2 = 0; i2 <= largestIndex; ++i2) {
            GL.currentContext.tempVertexBufferCounters1[i2] = 0;
          }
        }, getSource: function(shader, count, string, length) {
          var source = "";
          for (var i2 = 0; i2 < count; ++i2) {
            var len = length ? HEAP32[length + i2 * 4 >> 2] : -1;
            source += UTF8ToString(HEAP32[string + i2 * 4 >> 2], len < 0 ? void 0 : len);
          }
          return source;
        }, calcBufLength: function calcBufLength(size, type, stride, count) {
          if (stride > 0) {
            return count * stride;
          }
          var typeSize = GL.byteSizeByType[type - GL.byteSizeByTypeRoot];
          return size * typeSize * count;
        }, usedTempBuffers: [], preDrawHandleClientVertexAttribBindings: function preDrawHandleClientVertexAttribBindings(count) {
          GL.resetBufferBinding = false;
          for (var i2 = 0; i2 < GL.currentContext.maxVertexAttribs; ++i2) {
            var cb = GL.currentContext.clientBuffers[i2];
            if (!cb.clientside || !cb.enabled) continue;
            GL.resetBufferBinding = true;
            var size = GL.calcBufLength(cb.size, cb.type, cb.stride, count);
            var buf = GL.getTempVertexBuffer(size);
            GLctx.bindBuffer(34962, buf);
            GLctx.bufferSubData(34962, 0, HEAPU8.subarray(cb.ptr, cb.ptr + size));
            cb.vertexAttribPointerAdaptor.call(GLctx, i2, cb.size, cb.type, cb.normalized, cb.stride, 0);
          }
        }, postDrawHandleClientVertexAttribBindings: function postDrawHandleClientVertexAttribBindings() {
          if (GL.resetBufferBinding) {
            GLctx.bindBuffer(34962, GL.buffers[GLctx.currentArrayBufferBinding]);
          }
        }, createContext: function(canvas, webGLContextAttributes) {
          if (!canvas.getContextSafariWebGL2Fixed) {
            let fixedGetContext2 = function(ver, attrs) {
              var gl = canvas.getContextSafariWebGL2Fixed(ver, attrs);
              return ver == "webgl" == gl instanceof WebGLRenderingContext ? gl : null;
            };
            var fixedGetContext = fixedGetContext2;
            canvas.getContextSafariWebGL2Fixed = canvas.getContext;
            canvas.getContext = fixedGetContext2;
          }
          var ctx = webGLContextAttributes.majorVersion > 1 ? canvas.getContext("webgl2", webGLContextAttributes) : canvas.getContext("webgl", webGLContextAttributes);
          if (!ctx) return 0;
          var handle = GL.registerContext(ctx, webGLContextAttributes);
          return handle;
        }, registerContext: function(ctx, webGLContextAttributes) {
          var handle = GL.getNewId(GL.contexts);
          var context = { handle, attributes: webGLContextAttributes, version: webGLContextAttributes.majorVersion, GLctx: ctx };
          if (ctx.canvas) ctx.canvas.GLctxObject = context;
          GL.contexts[handle] = context;
          if (typeof webGLContextAttributes.enableExtensionsByDefault == "undefined" || webGLContextAttributes.enableExtensionsByDefault) {
            GL.initExtensions(context);
          }
          context.maxVertexAttribs = context.GLctx.getParameter(34921);
          context.clientBuffers = [];
          for (var i2 = 0; i2 < context.maxVertexAttribs; i2++) {
            context.clientBuffers[i2] = { enabled: false, clientside: false, size: 0, type: 0, normalized: 0, stride: 0, ptr: 0, vertexAttribPointerAdaptor: null };
          }
          GL.generateTempBuffers(false, context);
          return handle;
        }, makeContextCurrent: function(contextHandle) {
          GL.currentContext = GL.contexts[contextHandle];
          Module2.ctx = GLctx = GL.currentContext && GL.currentContext.GLctx;
          return !(contextHandle && !GLctx);
        }, getContext: function(contextHandle) {
          return GL.contexts[contextHandle];
        }, deleteContext: function(contextHandle) {
          if (GL.currentContext === GL.contexts[contextHandle]) GL.currentContext = null;
          if (typeof JSEvents == "object") JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas);
          if (GL.contexts[contextHandle] && GL.contexts[contextHandle].GLctx.canvas) GL.contexts[contextHandle].GLctx.canvas.GLctxObject = void 0;
          GL.contexts[contextHandle] = null;
        }, initExtensions: function(context) {
          if (!context) context = GL.currentContext;
          if (context.initExtensionsDone) return;
          context.initExtensionsDone = true;
          var GLctx2 = context.GLctx;
          __webgl_enable_ANGLE_instanced_arrays(GLctx2);
          __webgl_enable_OES_vertex_array_object(GLctx2);
          __webgl_enable_WEBGL_draw_buffers(GLctx2);
          __webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(GLctx2);
          __webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance(GLctx2);
          if (context.version >= 2) {
            GLctx2.disjointTimerQueryExt = GLctx2.getExtension("EXT_disjoint_timer_query_webgl2");
          }
          if (context.version < 2 || !GLctx2.disjointTimerQueryExt) {
            GLctx2.disjointTimerQueryExt = GLctx2.getExtension("EXT_disjoint_timer_query");
          }
          __webgl_enable_WEBGL_multi_draw(GLctx2);
          var exts = GLctx2.getSupportedExtensions() || [];
          exts.forEach(function(ext) {
            if (!ext.includes("lose_context") && !ext.includes("debug")) {
              GLctx2.getExtension(ext);
            }
          });
        } };
        Module2["GL"] = GL;
        function _eglCreateContext(display, config, hmm, contextAttribs) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          var glesContextVersion = 1;
          for (; ; ) {
            var param = HEAP32[contextAttribs >> 2];
            if (param == 12440) {
              glesContextVersion = HEAP32[contextAttribs + 4 >> 2];
            } else if (param == 12344) {
              break;
            } else {
              EGL.setErrorCode(12292);
              return 0;
            }
            contextAttribs += 8;
          }
          if (glesContextVersion < 2 || glesContextVersion > 3) {
            EGL.setErrorCode(12293);
            return 0;
          }
          EGL.contextAttributes.majorVersion = glesContextVersion - 1;
          EGL.contextAttributes.minorVersion = 0;
          EGL.context = GL.createContext(Module2["canvas"], EGL.contextAttributes);
          if (EGL.context != 0) {
            EGL.setErrorCode(12288);
            GL.makeContextCurrent(EGL.context);
            Module2.useWebGL = true;
            Browser.moduleContextCreatedCallbacks.forEach(function(callback) {
              callback();
            });
            GL.makeContextCurrent(null);
            return 62004;
          } else {
            EGL.setErrorCode(12297);
            return 0;
          }
        }
        Module2["_eglCreateContext"] = _eglCreateContext;
        function _eglCreateWindowSurface(display, config, win, attrib_list) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          if (config != 62002) {
            EGL.setErrorCode(12293);
            return 0;
          }
          EGL.setErrorCode(12288);
          return 62006;
        }
        Module2["_eglCreateWindowSurface"] = _eglCreateWindowSurface;
        function _eglDestroyContext(display, context) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          if (context != 62004) {
            EGL.setErrorCode(12294);
            return 0;
          }
          GL.deleteContext(EGL.context);
          EGL.setErrorCode(12288);
          if (EGL.currentContext == context) {
            EGL.currentContext = 0;
          }
          return 1;
        }
        Module2["_eglDestroyContext"] = _eglDestroyContext;
        function _eglDestroySurface(display, surface) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          if (surface != 62006) {
            EGL.setErrorCode(12301);
            return 1;
          }
          if (EGL.currentReadSurface == surface) {
            EGL.currentReadSurface = 0;
          }
          if (EGL.currentDrawSurface == surface) {
            EGL.currentDrawSurface = 0;
          }
          EGL.setErrorCode(12288);
          return 1;
        }
        Module2["_eglDestroySurface"] = _eglDestroySurface;
        function _eglGetConfigAttrib(display, config, attribute, value) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          if (config != 62002) {
            EGL.setErrorCode(12293);
            return 0;
          }
          if (!value) {
            EGL.setErrorCode(12300);
            return 0;
          }
          EGL.setErrorCode(12288);
          switch (attribute) {
            case 12320:
              HEAP32[value >> 2] = EGL.contextAttributes.alpha ? 32 : 24;
              return 1;
            case 12321:
              HEAP32[value >> 2] = EGL.contextAttributes.alpha ? 8 : 0;
              return 1;
            case 12322:
              HEAP32[value >> 2] = 8;
              return 1;
            case 12323:
              HEAP32[value >> 2] = 8;
              return 1;
            case 12324:
              HEAP32[value >> 2] = 8;
              return 1;
            case 12325:
              HEAP32[value >> 2] = EGL.contextAttributes.depth ? 24 : 0;
              return 1;
            case 12326:
              HEAP32[value >> 2] = EGL.contextAttributes.stencil ? 8 : 0;
              return 1;
            case 12327:
              HEAP32[value >> 2] = 12344;
              return 1;
            case 12328:
              HEAP32[value >> 2] = 62002;
              return 1;
            case 12329:
              HEAP32[value >> 2] = 0;
              return 1;
            case 12330:
              HEAP32[value >> 2] = 4096;
              return 1;
            case 12331:
              HEAP32[value >> 2] = 16777216;
              return 1;
            case 12332:
              HEAP32[value >> 2] = 4096;
              return 1;
            case 12333:
              HEAP32[value >> 2] = 0;
              return 1;
            case 12334:
              HEAP32[value >> 2] = 0;
              return 1;
            case 12335:
              HEAP32[value >> 2] = 12344;
              return 1;
            case 12337:
              HEAP32[value >> 2] = EGL.contextAttributes.antialias ? 4 : 0;
              return 1;
            case 12338:
              HEAP32[value >> 2] = EGL.contextAttributes.antialias ? 1 : 0;
              return 1;
            case 12339:
              HEAP32[value >> 2] = 4;
              return 1;
            case 12340:
              HEAP32[value >> 2] = 12344;
              return 1;
            case 12341:
            case 12342:
            case 12343:
              HEAP32[value >> 2] = -1;
              return 1;
            case 12345:
            case 12346:
              HEAP32[value >> 2] = 0;
              return 1;
            case 12347:
              HEAP32[value >> 2] = 0;
              return 1;
            case 12348:
              HEAP32[value >> 2] = 1;
              return 1;
            case 12349:
            case 12350:
              HEAP32[value >> 2] = 0;
              return 1;
            case 12351:
              HEAP32[value >> 2] = 12430;
              return 1;
            case 12352:
              HEAP32[value >> 2] = 4;
              return 1;
            case 12354:
              HEAP32[value >> 2] = 0;
              return 1;
            default:
              EGL.setErrorCode(12292);
              return 0;
          }
        }
        Module2["_eglGetConfigAttrib"] = _eglGetConfigAttrib;
        function _eglGetDisplay(nativeDisplayType) {
          EGL.setErrorCode(12288);
          return 62e3;
        }
        Module2["_eglGetDisplay"] = _eglGetDisplay;
        function _eglGetError() {
          return EGL.errorCode;
        }
        Module2["_eglGetError"] = _eglGetError;
        function _eglInitialize(display, majorVersion, minorVersion) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          if (majorVersion) {
            HEAP32[majorVersion >> 2] = 1;
          }
          if (minorVersion) {
            HEAP32[minorVersion >> 2] = 4;
          }
          EGL.defaultDisplayInitialized = true;
          EGL.setErrorCode(12288);
          return 1;
        }
        Module2["_eglInitialize"] = _eglInitialize;
        function _eglMakeCurrent(display, draw, read, context) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          if (context != 0 && context != 62004) {
            EGL.setErrorCode(12294);
            return 0;
          }
          if (read != 0 && read != 62006 || draw != 0 && draw != 62006) {
            EGL.setErrorCode(12301);
            return 0;
          }
          GL.makeContextCurrent(context ? EGL.context : null);
          EGL.currentContext = context;
          EGL.currentDrawSurface = draw;
          EGL.currentReadSurface = read;
          EGL.setErrorCode(12288);
          return 1;
        }
        Module2["_eglMakeCurrent"] = _eglMakeCurrent;
        function _eglQueryString(display, name) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          EGL.setErrorCode(12288);
          if (EGL.stringCache[name]) return EGL.stringCache[name];
          var ret;
          switch (name) {
            case 12371:
              ret = allocateUTF8("Emscripten");
              break;
            case 12372:
              ret = allocateUTF8("1.4 Emscripten EGL");
              break;
            case 12373:
              ret = allocateUTF8("");
              break;
            case 12429:
              ret = allocateUTF8("OpenGL_ES");
              break;
            default:
              EGL.setErrorCode(12300);
              return 0;
          }
          EGL.stringCache[name] = ret;
          return ret;
        }
        Module2["_eglQueryString"] = _eglQueryString;
        function _eglSwapBuffers() {
          if (!EGL.defaultDisplayInitialized) {
            EGL.setErrorCode(12289);
          } else if (!Module2.ctx) {
            EGL.setErrorCode(12290);
          } else if (Module2.ctx.isContextLost()) {
            EGL.setErrorCode(12302);
          } else {
            EGL.setErrorCode(12288);
            return 1;
          }
          return 0;
        }
        Module2["_eglSwapBuffers"] = _eglSwapBuffers;
        function _eglSwapInterval(display, interval) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          if (interval == 0) _emscripten_set_main_loop_timing(0, 0);
          else _emscripten_set_main_loop_timing(1, interval);
          EGL.setErrorCode(12288);
          return 1;
        }
        Module2["_eglSwapInterval"] = _eglSwapInterval;
        function _eglTerminate(display) {
          if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0;
          }
          EGL.currentContext = 0;
          EGL.currentReadSurface = 0;
          EGL.currentDrawSurface = 0;
          EGL.defaultDisplayInitialized = false;
          EGL.setErrorCode(12288);
          return 1;
        }
        Module2["_eglTerminate"] = _eglTerminate;
        function _eglWaitClient() {
          EGL.setErrorCode(12288);
          return 1;
        }
        Module2["_eglWaitClient"] = _eglWaitClient;
        var _eglWaitGL = _eglWaitClient;
        Module2["_eglWaitGL"] = _eglWaitGL;
        function _eglWaitNative(nativeEngineId) {
          EGL.setErrorCode(12288);
          return 1;
        }
        Module2["_eglWaitNative"] = _eglWaitNative;
        var readAsmConstArgsArray = [];
        Module2["readAsmConstArgsArray"] = readAsmConstArgsArray;
        function readAsmConstArgs(sigPtr, buf) {
          readAsmConstArgsArray.length = 0;
          var ch;
          buf >>= 2;
          while (ch = HEAPU8[sigPtr++]) {
            buf += ch != 105 & buf;
            readAsmConstArgsArray.push(ch == 105 ? HEAP32[buf] : HEAPF64[buf++ >> 1]);
            ++buf;
          }
          return readAsmConstArgsArray;
        }
        Module2["readAsmConstArgs"] = readAsmConstArgs;
        function _emscripten_asm_const_int(code, sigPtr, argbuf) {
          var args = readAsmConstArgs(sigPtr, argbuf);
          return ASM_CONSTS[code].apply(null, args);
        }
        Module2["_emscripten_asm_const_int"] = _emscripten_asm_const_int;
        function mainThreadEM_ASM(code, sigPtr, argbuf, sync) {
          var args = readAsmConstArgs(sigPtr, argbuf);
          return ASM_CONSTS[code].apply(null, args);
        }
        Module2["mainThreadEM_ASM"] = mainThreadEM_ASM;
        function _emscripten_asm_const_int_sync_on_main_thread(code, sigPtr, argbuf) {
          return mainThreadEM_ASM(code, sigPtr, argbuf, 1);
        }
        Module2["_emscripten_asm_const_int_sync_on_main_thread"] = _emscripten_asm_const_int_sync_on_main_thread;
        function _emscripten_async_call(func, arg, millis) {
          function wrapper() {
            (function(a1) {
              dynCall_vi.apply(null, [func, a1]);
            })(arg);
          }
          if (millis >= 0) {
            safeSetTimeout(wrapper, millis);
          } else {
            Browser.safeRequestAnimationFrame(wrapper);
          }
        }
        Module2["_emscripten_async_call"] = _emscripten_async_call;
        function _emscripten_cancel_main_loop() {
          Browser.mainLoop.pause();
          Browser.mainLoop.func = null;
        }
        Module2["_emscripten_cancel_main_loop"] = _emscripten_cancel_main_loop;
        function _emscripten_date_now() {
          return Date.now();
        }
        Module2["_emscripten_date_now"] = _emscripten_date_now;
        var JSEvents = { inEventHandler: 0, removeAllEventListeners: function() {
          for (var i2 = JSEvents.eventHandlers.length - 1; i2 >= 0; --i2) {
            JSEvents._removeHandler(i2);
          }
          JSEvents.eventHandlers = [];
          JSEvents.deferredCalls = [];
        }, registerRemoveEventListeners: function() {
          if (!JSEvents.removeEventListenersRegistered) {
            __ATEXIT__.push(JSEvents.removeAllEventListeners);
            JSEvents.removeEventListenersRegistered = true;
          }
        }, deferredCalls: [], deferCall: function(targetFunction, precedence, argsList) {
          function arraysHaveEqualContent(arrA, arrB) {
            if (arrA.length != arrB.length) return false;
            for (var i3 in arrA) {
              if (arrA[i3] != arrB[i3]) return false;
            }
            return true;
          }
          for (var i2 in JSEvents.deferredCalls) {
            var call = JSEvents.deferredCalls[i2];
            if (call.targetFunction == targetFunction && arraysHaveEqualContent(call.argsList, argsList)) {
              return;
            }
          }
          JSEvents.deferredCalls.push({ targetFunction, precedence, argsList });
          JSEvents.deferredCalls.sort(function(x, y) {
            return x.precedence < y.precedence;
          });
        }, removeDeferredCalls: function(targetFunction) {
          for (var i2 = 0; i2 < JSEvents.deferredCalls.length; ++i2) {
            if (JSEvents.deferredCalls[i2].targetFunction == targetFunction) {
              JSEvents.deferredCalls.splice(i2, 1);
              --i2;
            }
          }
        }, canPerformEventHandlerRequests: function() {
          return JSEvents.inEventHandler && JSEvents.currentEventHandler.allowsDeferredCalls;
        }, runDeferredCalls: function() {
          if (!JSEvents.canPerformEventHandlerRequests()) {
            return;
          }
          for (var i2 = 0; i2 < JSEvents.deferredCalls.length; ++i2) {
            var call = JSEvents.deferredCalls[i2];
            JSEvents.deferredCalls.splice(i2, 1);
            --i2;
            call.targetFunction.apply(null, call.argsList);
          }
        }, eventHandlers: [], removeAllHandlersOnTarget: function(target, eventTypeString) {
          for (var i2 = 0; i2 < JSEvents.eventHandlers.length; ++i2) {
            if (JSEvents.eventHandlers[i2].target == target && (!eventTypeString || eventTypeString == JSEvents.eventHandlers[i2].eventTypeString)) {
              JSEvents._removeHandler(i2--);
            }
          }
        }, _removeHandler: function(i2) {
          var h = JSEvents.eventHandlers[i2];
          h.target.removeEventListener(h.eventTypeString, h.eventListenerFunc, h.useCapture);
          JSEvents.eventHandlers.splice(i2, 1);
        }, registerOrRemoveHandler: function(eventHandler) {
          var jsEventHandler = function jsEventHandler2(event2) {
            ++JSEvents.inEventHandler;
            JSEvents.currentEventHandler = eventHandler;
            JSEvents.runDeferredCalls();
            eventHandler.handlerFunc(event2);
            JSEvents.runDeferredCalls();
            --JSEvents.inEventHandler;
          };
          if (eventHandler.callbackfunc) {
            eventHandler.eventListenerFunc = jsEventHandler;
            eventHandler.target.addEventListener(eventHandler.eventTypeString, jsEventHandler, eventHandler.useCapture);
            JSEvents.eventHandlers.push(eventHandler);
            JSEvents.registerRemoveEventListeners();
          } else {
            for (var i2 = 0; i2 < JSEvents.eventHandlers.length; ++i2) {
              if (JSEvents.eventHandlers[i2].target == eventHandler.target && JSEvents.eventHandlers[i2].eventTypeString == eventHandler.eventTypeString) {
                JSEvents._removeHandler(i2--);
              }
            }
          }
        }, getNodeNameForTarget: function(target) {
          if (!target) return "";
          if (target == window) return "#window";
          if (target == screen) return "#screen";
          return target && target.nodeName ? target.nodeName : "";
        }, fullscreenEnabled: function() {
          return document.fullscreenEnabled || document.webkitFullscreenEnabled;
        } };
        Module2["JSEvents"] = JSEvents;
        var currentFullscreenStrategy = {};
        Module2["currentFullscreenStrategy"] = currentFullscreenStrategy;
        function maybeCStringToJsString(cString) {
          return cString > 2 ? UTF8ToString(cString) : cString;
        }
        Module2["maybeCStringToJsString"] = maybeCStringToJsString;
        var specialHTMLTargets = [0, typeof document != "undefined" ? document : 0, typeof window != "undefined" ? window : 0];
        Module2["specialHTMLTargets"] = specialHTMLTargets;
        function findEventTarget(target) {
          target = maybeCStringToJsString(target);
          var domElement = specialHTMLTargets[target] || (typeof document != "undefined" ? document.querySelector(target) : void 0);
          return domElement;
        }
        Module2["findEventTarget"] = findEventTarget;
        function findCanvasEventTarget(target) {
          return findEventTarget(target);
        }
        Module2["findCanvasEventTarget"] = findCanvasEventTarget;
        function _emscripten_get_canvas_element_size(target, width, height) {
          var canvas = findCanvasEventTarget(target);
          if (!canvas) return -4;
          HEAP32[width >> 2] = canvas.width;
          HEAP32[height >> 2] = canvas.height;
        }
        Module2["_emscripten_get_canvas_element_size"] = _emscripten_get_canvas_element_size;
        function getCanvasElementSize(target) {
          return withStackSave(function() {
            var w = stackAlloc(8);
            var h = w + 4;
            var targetInt = stackAlloc(target.id.length + 1);
            stringToUTF8(target.id, targetInt, target.id.length + 1);
            var ret = _emscripten_get_canvas_element_size(targetInt, w, h);
            var size = [HEAP32[w >> 2], HEAP32[h >> 2]];
            return size;
          });
        }
        Module2["getCanvasElementSize"] = getCanvasElementSize;
        function _emscripten_set_canvas_element_size(target, width, height) {
          var canvas = findCanvasEventTarget(target);
          if (!canvas) return -4;
          canvas.width = width;
          canvas.height = height;
          return 0;
        }
        Module2["_emscripten_set_canvas_element_size"] = _emscripten_set_canvas_element_size;
        function setCanvasElementSize(target, width, height) {
          if (!target.controlTransferredOffscreen) {
            target.width = width;
            target.height = height;
          } else {
            withStackSave(function() {
              var targetInt = stackAlloc(target.id.length + 1);
              stringToUTF8(target.id, targetInt, target.id.length + 1);
              _emscripten_set_canvas_element_size(targetInt, width, height);
            });
          }
        }
        Module2["setCanvasElementSize"] = setCanvasElementSize;
        function registerRestoreOldStyle(canvas) {
          var canvasSize = getCanvasElementSize(canvas);
          var oldWidth = canvasSize[0];
          var oldHeight = canvasSize[1];
          var oldCssWidth = canvas.style.width;
          var oldCssHeight = canvas.style.height;
          var oldBackgroundColor = canvas.style.backgroundColor;
          var oldDocumentBackgroundColor = document.body.style.backgroundColor;
          var oldPaddingLeft = canvas.style.paddingLeft;
          var oldPaddingRight = canvas.style.paddingRight;
          var oldPaddingTop = canvas.style.paddingTop;
          var oldPaddingBottom = canvas.style.paddingBottom;
          var oldMarginLeft = canvas.style.marginLeft;
          var oldMarginRight = canvas.style.marginRight;
          var oldMarginTop = canvas.style.marginTop;
          var oldMarginBottom = canvas.style.marginBottom;
          var oldDocumentBodyMargin = document.body.style.margin;
          var oldDocumentOverflow = document.documentElement.style.overflow;
          var oldDocumentScroll = document.body.scroll;
          var oldImageRendering = canvas.style.imageRendering;
          function restoreOldStyle() {
            var fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
            if (!fullscreenElement) {
              document.removeEventListener("fullscreenchange", restoreOldStyle);
              document.removeEventListener("webkitfullscreenchange", restoreOldStyle);
              setCanvasElementSize(canvas, oldWidth, oldHeight);
              canvas.style.width = oldCssWidth;
              canvas.style.height = oldCssHeight;
              canvas.style.backgroundColor = oldBackgroundColor;
              if (!oldDocumentBackgroundColor) document.body.style.backgroundColor = "white";
              document.body.style.backgroundColor = oldDocumentBackgroundColor;
              canvas.style.paddingLeft = oldPaddingLeft;
              canvas.style.paddingRight = oldPaddingRight;
              canvas.style.paddingTop = oldPaddingTop;
              canvas.style.paddingBottom = oldPaddingBottom;
              canvas.style.marginLeft = oldMarginLeft;
              canvas.style.marginRight = oldMarginRight;
              canvas.style.marginTop = oldMarginTop;
              canvas.style.marginBottom = oldMarginBottom;
              document.body.style.margin = oldDocumentBodyMargin;
              document.documentElement.style.overflow = oldDocumentOverflow;
              document.body.scroll = oldDocumentScroll;
              canvas.style.imageRendering = oldImageRendering;
              if (canvas.GLctxObject) canvas.GLctxObject.GLctx.viewport(0, 0, oldWidth, oldHeight);
              if (currentFullscreenStrategy.canvasResizedCallback) {
                (function(a1, a2, a3) {
                  return dynCall_iiii.apply(null, [currentFullscreenStrategy.canvasResizedCallback, a1, a2, a3]);
                })(37, 0, currentFullscreenStrategy.canvasResizedCallbackUserData);
              }
            }
          }
          document.addEventListener("fullscreenchange", restoreOldStyle);
          document.addEventListener("webkitfullscreenchange", restoreOldStyle);
          return restoreOldStyle;
        }
        Module2["registerRestoreOldStyle"] = registerRestoreOldStyle;
        function setLetterbox(element, topBottom, leftRight) {
          element.style.paddingLeft = element.style.paddingRight = leftRight + "px";
          element.style.paddingTop = element.style.paddingBottom = topBottom + "px";
        }
        Module2["setLetterbox"] = setLetterbox;
        function getBoundingClientRect(e) {
          return specialHTMLTargets.indexOf(e) < 0 ? e.getBoundingClientRect() : { "left": 0, "top": 0 };
        }
        Module2["getBoundingClientRect"] = getBoundingClientRect;
        function JSEvents_resizeCanvasForFullscreen(target, strategy) {
          var restoreOldStyle = registerRestoreOldStyle(target);
          var cssWidth = strategy.softFullscreen ? innerWidth : screen.width;
          var cssHeight = strategy.softFullscreen ? innerHeight : screen.height;
          var rect = getBoundingClientRect(target);
          var windowedCssWidth = rect.width;
          var windowedCssHeight = rect.height;
          var canvasSize = getCanvasElementSize(target);
          var windowedRttWidth = canvasSize[0];
          var windowedRttHeight = canvasSize[1];
          if (strategy.scaleMode == 3) {
            setLetterbox(target, (cssHeight - windowedCssHeight) / 2, (cssWidth - windowedCssWidth) / 2);
            cssWidth = windowedCssWidth;
            cssHeight = windowedCssHeight;
          } else if (strategy.scaleMode == 2) {
            if (cssWidth * windowedRttHeight < windowedRttWidth * cssHeight) {
              var desiredCssHeight = windowedRttHeight * cssWidth / windowedRttWidth;
              setLetterbox(target, (cssHeight - desiredCssHeight) / 2, 0);
              cssHeight = desiredCssHeight;
            } else {
              var desiredCssWidth = windowedRttWidth * cssHeight / windowedRttHeight;
              setLetterbox(target, 0, (cssWidth - desiredCssWidth) / 2);
              cssWidth = desiredCssWidth;
            }
          }
          if (!target.style.backgroundColor) target.style.backgroundColor = "black";
          if (!document.body.style.backgroundColor) document.body.style.backgroundColor = "black";
          target.style.width = cssWidth + "px";
          target.style.height = cssHeight + "px";
          if (strategy.filteringMode == 1) {
            target.style.imageRendering = "optimizeSpeed";
            target.style.imageRendering = "-moz-crisp-edges";
            target.style.imageRendering = "-o-crisp-edges";
            target.style.imageRendering = "-webkit-optimize-contrast";
            target.style.imageRendering = "optimize-contrast";
            target.style.imageRendering = "crisp-edges";
            target.style.imageRendering = "pixelated";
          }
          var dpiScale = strategy.canvasResolutionScaleMode == 2 ? devicePixelRatio : 1;
          if (strategy.canvasResolutionScaleMode != 0) {
            var newWidth = cssWidth * dpiScale | 0;
            var newHeight = cssHeight * dpiScale | 0;
            setCanvasElementSize(target, newWidth, newHeight);
            if (target.GLctxObject) target.GLctxObject.GLctx.viewport(0, 0, newWidth, newHeight);
          }
          return restoreOldStyle;
        }
        Module2["JSEvents_resizeCanvasForFullscreen"] = JSEvents_resizeCanvasForFullscreen;
        function JSEvents_requestFullscreen(target, strategy) {
          if (strategy.scaleMode != 0 || strategy.canvasResolutionScaleMode != 0) {
            JSEvents_resizeCanvasForFullscreen(target, strategy);
          }
          if (target.requestFullscreen) {
            target.requestFullscreen();
          } else if (target.webkitRequestFullscreen) {
            target.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
          } else {
            return JSEvents.fullscreenEnabled() ? -3 : -1;
          }
          currentFullscreenStrategy = strategy;
          if (strategy.canvasResizedCallback) {
            (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [strategy.canvasResizedCallback, a1, a2, a3]);
            })(37, 0, strategy.canvasResizedCallbackUserData);
          }
          return 0;
        }
        Module2["JSEvents_requestFullscreen"] = JSEvents_requestFullscreen;
        function _emscripten_exit_fullscreen() {
          if (!JSEvents.fullscreenEnabled()) return -1;
          JSEvents.removeDeferredCalls(JSEvents_requestFullscreen);
          var d = specialHTMLTargets[1];
          if (d.exitFullscreen) {
            d.fullscreenElement && d.exitFullscreen();
          } else if (d.webkitExitFullscreen) {
            d.webkitFullscreenElement && d.webkitExitFullscreen();
          } else {
            return -1;
          }
          return 0;
        }
        Module2["_emscripten_exit_fullscreen"] = _emscripten_exit_fullscreen;
        function requestPointerLock(target) {
          if (target.requestPointerLock) {
            target.requestPointerLock();
          } else if (target.msRequestPointerLock) {
            target.msRequestPointerLock();
          } else {
            if (document.body.requestPointerLock || document.body.msRequestPointerLock) {
              return -3;
            }
            return -1;
          }
          return 0;
        }
        Module2["requestPointerLock"] = requestPointerLock;
        function _emscripten_exit_pointerlock() {
          JSEvents.removeDeferredCalls(requestPointerLock);
          if (document.exitPointerLock) {
            document.exitPointerLock();
          } else if (document.msExitPointerLock) {
            document.msExitPointerLock();
          } else {
            return -1;
          }
          return 0;
        }
        Module2["_emscripten_exit_pointerlock"] = _emscripten_exit_pointerlock;
        function _emscripten_get_device_pixel_ratio() {
          return devicePixelRatio;
        }
        Module2["_emscripten_get_device_pixel_ratio"] = _emscripten_get_device_pixel_ratio;
        function _emscripten_get_element_css_size(target, width, height) {
          target = findEventTarget(target);
          if (!target) return -4;
          var rect = getBoundingClientRect(target);
          HEAPF64[width >> 3] = rect.width;
          HEAPF64[height >> 3] = rect.height;
          return 0;
        }
        Module2["_emscripten_get_element_css_size"] = _emscripten_get_element_css_size;
        function fillGamepadEventData(eventStruct, e) {
          HEAPF64[eventStruct >> 3] = e.timestamp;
          for (var i2 = 0; i2 < e.axes.length; ++i2) {
            HEAPF64[eventStruct + i2 * 8 + 16 >> 3] = e.axes[i2];
          }
          for (var i2 = 0; i2 < e.buttons.length; ++i2) {
            if (typeof e.buttons[i2] == "object") {
              HEAPF64[eventStruct + i2 * 8 + 528 >> 3] = e.buttons[i2].value;
            } else {
              HEAPF64[eventStruct + i2 * 8 + 528 >> 3] = e.buttons[i2];
            }
          }
          for (var i2 = 0; i2 < e.buttons.length; ++i2) {
            if (typeof e.buttons[i2] == "object") {
              HEAP32[eventStruct + i2 * 4 + 1040 >> 2] = e.buttons[i2].pressed;
            } else {
              HEAP32[eventStruct + i2 * 4 + 1040 >> 2] = e.buttons[i2] == 1;
            }
          }
          HEAP32[eventStruct + 1296 >> 2] = e.connected;
          HEAP32[eventStruct + 1300 >> 2] = e.index;
          HEAP32[eventStruct + 8 >> 2] = e.axes.length;
          HEAP32[eventStruct + 12 >> 2] = e.buttons.length;
          stringToUTF8(e.id, eventStruct + 1304, 64);
          stringToUTF8(e.mapping, eventStruct + 1368, 64);
        }
        Module2["fillGamepadEventData"] = fillGamepadEventData;
        function _emscripten_get_gamepad_status(index, gamepadState) {
          if (index < 0 || index >= JSEvents.lastGamepadState.length) return -5;
          if (!JSEvents.lastGamepadState[index]) return -7;
          fillGamepadEventData(gamepadState, JSEvents.lastGamepadState[index]);
          return 0;
        }
        Module2["_emscripten_get_gamepad_status"] = _emscripten_get_gamepad_status;
        function _emscripten_get_num_gamepads() {
          return JSEvents.lastGamepadState.length;
        }
        Module2["_emscripten_get_num_gamepads"] = _emscripten_get_num_gamepads;
        function _emscripten_get_screen_size(width, height) {
          HEAP32[width >> 2] = screen.width;
          HEAP32[height >> 2] = screen.height;
        }
        Module2["_emscripten_get_screen_size"] = _emscripten_get_screen_size;
        function _emscripten_glActiveTexture(x0) {
          GLctx["activeTexture"](x0);
        }
        Module2["_emscripten_glActiveTexture"] = _emscripten_glActiveTexture;
        function _emscripten_glAttachShader(program, shader) {
          GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
        }
        Module2["_emscripten_glAttachShader"] = _emscripten_glAttachShader;
        function _emscripten_glBeginQuery(target, id) {
          GLctx["beginQuery"](target, GL.queries[id]);
        }
        Module2["_emscripten_glBeginQuery"] = _emscripten_glBeginQuery;
        function _emscripten_glBeginQueryEXT(target, id) {
          GLctx.disjointTimerQueryExt["beginQueryEXT"](target, GL.queries[id]);
        }
        Module2["_emscripten_glBeginQueryEXT"] = _emscripten_glBeginQueryEXT;
        function _emscripten_glBeginTransformFeedback(x0) {
          GLctx["beginTransformFeedback"](x0);
        }
        Module2["_emscripten_glBeginTransformFeedback"] = _emscripten_glBeginTransformFeedback;
        function _emscripten_glBindAttribLocation(program, index, name) {
          GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name));
        }
        Module2["_emscripten_glBindAttribLocation"] = _emscripten_glBindAttribLocation;
        function _emscripten_glBindBuffer(target, buffer2) {
          if (target == 34962) {
            GLctx.currentArrayBufferBinding = buffer2;
          } else if (target == 34963) {
            GLctx.currentElementArrayBufferBinding = buffer2;
          }
          if (target == 35051) {
            GLctx.currentPixelPackBufferBinding = buffer2;
          } else if (target == 35052) {
            GLctx.currentPixelUnpackBufferBinding = buffer2;
          }
          GLctx.bindBuffer(target, GL.buffers[buffer2]);
        }
        Module2["_emscripten_glBindBuffer"] = _emscripten_glBindBuffer;
        function _emscripten_glBindBufferBase(target, index, buffer2) {
          GLctx["bindBufferBase"](target, index, GL.buffers[buffer2]);
        }
        Module2["_emscripten_glBindBufferBase"] = _emscripten_glBindBufferBase;
        function _emscripten_glBindBufferRange(target, index, buffer2, offset, ptrsize) {
          GLctx["bindBufferRange"](target, index, GL.buffers[buffer2], offset, ptrsize);
        }
        Module2["_emscripten_glBindBufferRange"] = _emscripten_glBindBufferRange;
        function _emscripten_glBindFramebuffer(target, framebuffer) {
          GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);
        }
        Module2["_emscripten_glBindFramebuffer"] = _emscripten_glBindFramebuffer;
        function _emscripten_glBindRenderbuffer(target, renderbuffer) {
          GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
        }
        Module2["_emscripten_glBindRenderbuffer"] = _emscripten_glBindRenderbuffer;
        function _emscripten_glBindSampler(unit, sampler) {
          GLctx["bindSampler"](unit, GL.samplers[sampler]);
        }
        Module2["_emscripten_glBindSampler"] = _emscripten_glBindSampler;
        function _emscripten_glBindTexture(target, texture) {
          GLctx.bindTexture(target, GL.textures[texture]);
        }
        Module2["_emscripten_glBindTexture"] = _emscripten_glBindTexture;
        function _emscripten_glBindTransformFeedback(target, id) {
          GLctx["bindTransformFeedback"](target, GL.transformFeedbacks[id]);
        }
        Module2["_emscripten_glBindTransformFeedback"] = _emscripten_glBindTransformFeedback;
        function _emscripten_glBindVertexArray(vao) {
          GLctx["bindVertexArray"](GL.vaos[vao]);
          var ibo = GLctx.getParameter(34965);
          GLctx.currentElementArrayBufferBinding = ibo ? ibo.name | 0 : 0;
        }
        Module2["_emscripten_glBindVertexArray"] = _emscripten_glBindVertexArray;
        function _emscripten_glBindVertexArrayOES(vao) {
          GLctx["bindVertexArray"](GL.vaos[vao]);
          var ibo = GLctx.getParameter(34965);
          GLctx.currentElementArrayBufferBinding = ibo ? ibo.name | 0 : 0;
        }
        Module2["_emscripten_glBindVertexArrayOES"] = _emscripten_glBindVertexArrayOES;
        function _emscripten_glBlendColor(x0, x1, x2, x3) {
          GLctx["blendColor"](x0, x1, x2, x3);
        }
        Module2["_emscripten_glBlendColor"] = _emscripten_glBlendColor;
        function _emscripten_glBlendEquation(x0) {
          GLctx["blendEquation"](x0);
        }
        Module2["_emscripten_glBlendEquation"] = _emscripten_glBlendEquation;
        function _emscripten_glBlendEquationSeparate(x0, x1) {
          GLctx["blendEquationSeparate"](x0, x1);
        }
        Module2["_emscripten_glBlendEquationSeparate"] = _emscripten_glBlendEquationSeparate;
        function _emscripten_glBlendFunc(x0, x1) {
          GLctx["blendFunc"](x0, x1);
        }
        Module2["_emscripten_glBlendFunc"] = _emscripten_glBlendFunc;
        function _emscripten_glBlendFuncSeparate(x0, x1, x2, x3) {
          GLctx["blendFuncSeparate"](x0, x1, x2, x3);
        }
        Module2["_emscripten_glBlendFuncSeparate"] = _emscripten_glBlendFuncSeparate;
        function _emscripten_glBlitFramebuffer(x0, x1, x2, x3, x4, x5, x6, x7, x8, x9) {
          GLctx["blitFramebuffer"](x0, x1, x2, x3, x4, x5, x6, x7, x8, x9);
        }
        Module2["_emscripten_glBlitFramebuffer"] = _emscripten_glBlitFramebuffer;
        function _emscripten_glBufferData(target, size, data, usage) {
          if (GL.currentContext.version >= 2) {
            if (data && size) {
              GLctx.bufferData(target, HEAPU8, usage, data, size);
            } else {
              GLctx.bufferData(target, size, usage);
            }
          } else {
            GLctx.bufferData(target, data ? HEAPU8.subarray(data, data + size) : size, usage);
          }
        }
        Module2["_emscripten_glBufferData"] = _emscripten_glBufferData;
        function _emscripten_glBufferSubData(target, offset, size, data) {
          if (GL.currentContext.version >= 2) {
            size && GLctx.bufferSubData(target, offset, HEAPU8, data, size);
            return;
          }
          GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data + size));
        }
        Module2["_emscripten_glBufferSubData"] = _emscripten_glBufferSubData;
        function _emscripten_glCheckFramebufferStatus(x0) {
          return GLctx["checkFramebufferStatus"](x0);
        }
        Module2["_emscripten_glCheckFramebufferStatus"] = _emscripten_glCheckFramebufferStatus;
        function _emscripten_glClear(x0) {
          GLctx["clear"](x0);
        }
        Module2["_emscripten_glClear"] = _emscripten_glClear;
        function _emscripten_glClearBufferfi(x0, x1, x2, x3) {
          GLctx["clearBufferfi"](x0, x1, x2, x3);
        }
        Module2["_emscripten_glClearBufferfi"] = _emscripten_glClearBufferfi;
        function _emscripten_glClearBufferfv(buffer2, drawbuffer, value) {
          GLctx["clearBufferfv"](buffer2, drawbuffer, HEAPF32, value >> 2);
        }
        Module2["_emscripten_glClearBufferfv"] = _emscripten_glClearBufferfv;
        function _emscripten_glClearBufferiv(buffer2, drawbuffer, value) {
          GLctx["clearBufferiv"](buffer2, drawbuffer, HEAP32, value >> 2);
        }
        Module2["_emscripten_glClearBufferiv"] = _emscripten_glClearBufferiv;
        function _emscripten_glClearBufferuiv(buffer2, drawbuffer, value) {
          GLctx["clearBufferuiv"](buffer2, drawbuffer, HEAPU32, value >> 2);
        }
        Module2["_emscripten_glClearBufferuiv"] = _emscripten_glClearBufferuiv;
        function _emscripten_glClearColor(x0, x1, x2, x3) {
          GLctx["clearColor"](x0, x1, x2, x3);
        }
        Module2["_emscripten_glClearColor"] = _emscripten_glClearColor;
        function _emscripten_glClearDepthf(x0) {
          GLctx["clearDepth"](x0);
        }
        Module2["_emscripten_glClearDepthf"] = _emscripten_glClearDepthf;
        function _emscripten_glClearStencil(x0) {
          GLctx["clearStencil"](x0);
        }
        Module2["_emscripten_glClearStencil"] = _emscripten_glClearStencil;
        function convertI32PairToI53(lo, hi) {
          return (lo >>> 0) + hi * 4294967296;
        }
        Module2["convertI32PairToI53"] = convertI32PairToI53;
        function _emscripten_glClientWaitSync(sync, flags, timeoutLo, timeoutHi) {
          return GLctx.clientWaitSync(GL.syncs[sync], flags, convertI32PairToI53(timeoutLo, timeoutHi));
        }
        Module2["_emscripten_glClientWaitSync"] = _emscripten_glClientWaitSync;
        function _emscripten_glColorMask(red, green, blue, alpha) {
          GLctx.colorMask(!!red, !!green, !!blue, !!alpha);
        }
        Module2["_emscripten_glColorMask"] = _emscripten_glColorMask;
        function _emscripten_glCompileShader(shader) {
          GLctx.compileShader(GL.shaders[shader]);
        }
        Module2["_emscripten_glCompileShader"] = _emscripten_glCompileShader;
        function _emscripten_glCompressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data) {
          if (GL.currentContext.version >= 2) {
            if (GLctx.currentPixelUnpackBufferBinding || !imageSize) {
              GLctx["compressedTexImage2D"](target, level, internalFormat, width, height, border, imageSize, data);
            } else {
              GLctx["compressedTexImage2D"](target, level, internalFormat, width, height, border, HEAPU8, data, imageSize);
            }
            return;
          }
          GLctx["compressedTexImage2D"](target, level, internalFormat, width, height, border, data ? HEAPU8.subarray(data, data + imageSize) : null);
        }
        Module2["_emscripten_glCompressedTexImage2D"] = _emscripten_glCompressedTexImage2D;
        function _emscripten_glCompressedTexImage3D(target, level, internalFormat, width, height, depth, border, imageSize, data) {
          if (GLctx.currentPixelUnpackBufferBinding) {
            GLctx["compressedTexImage3D"](target, level, internalFormat, width, height, depth, border, imageSize, data);
          } else {
            GLctx["compressedTexImage3D"](target, level, internalFormat, width, height, depth, border, HEAPU8, data, imageSize);
          }
        }
        Module2["_emscripten_glCompressedTexImage3D"] = _emscripten_glCompressedTexImage3D;
        function _emscripten_glCompressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data) {
          if (GL.currentContext.version >= 2) {
            if (GLctx.currentPixelUnpackBufferBinding || !imageSize) {
              GLctx["compressedTexSubImage2D"](target, level, xoffset, yoffset, width, height, format, imageSize, data);
            } else {
              GLctx["compressedTexSubImage2D"](target, level, xoffset, yoffset, width, height, format, HEAPU8, data, imageSize);
            }
            return;
          }
          GLctx["compressedTexSubImage2D"](target, level, xoffset, yoffset, width, height, format, data ? HEAPU8.subarray(data, data + imageSize) : null);
        }
        Module2["_emscripten_glCompressedTexSubImage2D"] = _emscripten_glCompressedTexSubImage2D;
        function _emscripten_glCompressedTexSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, imageSize, data) {
          if (GLctx.currentPixelUnpackBufferBinding) {
            GLctx["compressedTexSubImage3D"](target, level, xoffset, yoffset, zoffset, width, height, depth, format, imageSize, data);
          } else {
            GLctx["compressedTexSubImage3D"](target, level, xoffset, yoffset, zoffset, width, height, depth, format, HEAPU8, data, imageSize);
          }
        }
        Module2["_emscripten_glCompressedTexSubImage3D"] = _emscripten_glCompressedTexSubImage3D;
        function _emscripten_glCopyBufferSubData(x0, x1, x2, x3, x4) {
          GLctx["copyBufferSubData"](x0, x1, x2, x3, x4);
        }
        Module2["_emscripten_glCopyBufferSubData"] = _emscripten_glCopyBufferSubData;
        function _emscripten_glCopyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
          GLctx["copyTexImage2D"](x0, x1, x2, x3, x4, x5, x6, x7);
        }
        Module2["_emscripten_glCopyTexImage2D"] = _emscripten_glCopyTexImage2D;
        function _emscripten_glCopyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
          GLctx["copyTexSubImage2D"](x0, x1, x2, x3, x4, x5, x6, x7);
        }
        Module2["_emscripten_glCopyTexSubImage2D"] = _emscripten_glCopyTexSubImage2D;
        function _emscripten_glCopyTexSubImage3D(x0, x1, x2, x3, x4, x5, x6, x7, x8) {
          GLctx["copyTexSubImage3D"](x0, x1, x2, x3, x4, x5, x6, x7, x8);
        }
        Module2["_emscripten_glCopyTexSubImage3D"] = _emscripten_glCopyTexSubImage3D;
        function _emscripten_glCreateProgram() {
          var id = GL.getNewId(GL.programs);
          var program = GLctx.createProgram();
          program.name = id;
          program.maxUniformLength = program.maxAttributeLength = program.maxUniformBlockNameLength = 0;
          program.uniformIdCounter = 1;
          GL.programs[id] = program;
          return id;
        }
        Module2["_emscripten_glCreateProgram"] = _emscripten_glCreateProgram;
        function _emscripten_glCreateShader(shaderType) {
          var id = GL.getNewId(GL.shaders);
          GL.shaders[id] = GLctx.createShader(shaderType);
          return id;
        }
        Module2["_emscripten_glCreateShader"] = _emscripten_glCreateShader;
        function _emscripten_glCullFace(x0) {
          GLctx["cullFace"](x0);
        }
        Module2["_emscripten_glCullFace"] = _emscripten_glCullFace;
        function _emscripten_glDeleteBuffers(n, buffers) {
          for (var i2 = 0; i2 < n; i2++) {
            var id = HEAP32[buffers + i2 * 4 >> 2];
            var buffer2 = GL.buffers[id];
            if (!buffer2) continue;
            GLctx.deleteBuffer(buffer2);
            buffer2.name = 0;
            GL.buffers[id] = null;
            if (id == GLctx.currentArrayBufferBinding) GLctx.currentArrayBufferBinding = 0;
            if (id == GLctx.currentElementArrayBufferBinding) GLctx.currentElementArrayBufferBinding = 0;
            if (id == GLctx.currentPixelPackBufferBinding) GLctx.currentPixelPackBufferBinding = 0;
            if (id == GLctx.currentPixelUnpackBufferBinding) GLctx.currentPixelUnpackBufferBinding = 0;
          }
        }
        Module2["_emscripten_glDeleteBuffers"] = _emscripten_glDeleteBuffers;
        function _emscripten_glDeleteFramebuffers(n, framebuffers) {
          for (var i2 = 0; i2 < n; ++i2) {
            var id = HEAP32[framebuffers + i2 * 4 >> 2];
            var framebuffer = GL.framebuffers[id];
            if (!framebuffer) continue;
            GLctx.deleteFramebuffer(framebuffer);
            framebuffer.name = 0;
            GL.framebuffers[id] = null;
          }
        }
        Module2["_emscripten_glDeleteFramebuffers"] = _emscripten_glDeleteFramebuffers;
        function _emscripten_glDeleteProgram(id) {
          if (!id) return;
          var program = GL.programs[id];
          if (!program) {
            GL.recordError(1281);
            return;
          }
          GLctx.deleteProgram(program);
          program.name = 0;
          GL.programs[id] = null;
        }
        Module2["_emscripten_glDeleteProgram"] = _emscripten_glDeleteProgram;
        function _emscripten_glDeleteQueries(n, ids) {
          for (var i2 = 0; i2 < n; i2++) {
            var id = HEAP32[ids + i2 * 4 >> 2];
            var query = GL.queries[id];
            if (!query) continue;
            GLctx["deleteQuery"](query);
            GL.queries[id] = null;
          }
        }
        Module2["_emscripten_glDeleteQueries"] = _emscripten_glDeleteQueries;
        function _emscripten_glDeleteQueriesEXT(n, ids) {
          for (var i2 = 0; i2 < n; i2++) {
            var id = HEAP32[ids + i2 * 4 >> 2];
            var query = GL.queries[id];
            if (!query) continue;
            GLctx.disjointTimerQueryExt["deleteQueryEXT"](query);
            GL.queries[id] = null;
          }
        }
        Module2["_emscripten_glDeleteQueriesEXT"] = _emscripten_glDeleteQueriesEXT;
        function _emscripten_glDeleteRenderbuffers(n, renderbuffers) {
          for (var i2 = 0; i2 < n; i2++) {
            var id = HEAP32[renderbuffers + i2 * 4 >> 2];
            var renderbuffer = GL.renderbuffers[id];
            if (!renderbuffer) continue;
            GLctx.deleteRenderbuffer(renderbuffer);
            renderbuffer.name = 0;
            GL.renderbuffers[id] = null;
          }
        }
        Module2["_emscripten_glDeleteRenderbuffers"] = _emscripten_glDeleteRenderbuffers;
        function _emscripten_glDeleteSamplers(n, samplers) {
          for (var i2 = 0; i2 < n; i2++) {
            var id = HEAP32[samplers + i2 * 4 >> 2];
            var sampler = GL.samplers[id];
            if (!sampler) continue;
            GLctx["deleteSampler"](sampler);
            sampler.name = 0;
            GL.samplers[id] = null;
          }
        }
        Module2["_emscripten_glDeleteSamplers"] = _emscripten_glDeleteSamplers;
        function _emscripten_glDeleteShader(id) {
          if (!id) return;
          var shader = GL.shaders[id];
          if (!shader) {
            GL.recordError(1281);
            return;
          }
          GLctx.deleteShader(shader);
          GL.shaders[id] = null;
        }
        Module2["_emscripten_glDeleteShader"] = _emscripten_glDeleteShader;
        function _emscripten_glDeleteSync(id) {
          if (!id) return;
          var sync = GL.syncs[id];
          if (!sync) {
            GL.recordError(1281);
            return;
          }
          GLctx.deleteSync(sync);
          sync.name = 0;
          GL.syncs[id] = null;
        }
        Module2["_emscripten_glDeleteSync"] = _emscripten_glDeleteSync;
        function _emscripten_glDeleteTextures(n, textures) {
          for (var i2 = 0; i2 < n; i2++) {
            var id = HEAP32[textures + i2 * 4 >> 2];
            var texture = GL.textures[id];
            if (!texture) continue;
            GLctx.deleteTexture(texture);
            texture.name = 0;
            GL.textures[id] = null;
          }
        }
        Module2["_emscripten_glDeleteTextures"] = _emscripten_glDeleteTextures;
        function _emscripten_glDeleteTransformFeedbacks(n, ids) {
          for (var i2 = 0; i2 < n; i2++) {
            var id = HEAP32[ids + i2 * 4 >> 2];
            var transformFeedback = GL.transformFeedbacks[id];
            if (!transformFeedback) continue;
            GLctx["deleteTransformFeedback"](transformFeedback);
            transformFeedback.name = 0;
            GL.transformFeedbacks[id] = null;
          }
        }
        Module2["_emscripten_glDeleteTransformFeedbacks"] = _emscripten_glDeleteTransformFeedbacks;
        function _emscripten_glDeleteVertexArrays(n, vaos) {
          for (var i2 = 0; i2 < n; i2++) {
            var id = HEAP32[vaos + i2 * 4 >> 2];
            GLctx["deleteVertexArray"](GL.vaos[id]);
            GL.vaos[id] = null;
          }
        }
        Module2["_emscripten_glDeleteVertexArrays"] = _emscripten_glDeleteVertexArrays;
        function _emscripten_glDeleteVertexArraysOES(n, vaos) {
          for (var i2 = 0; i2 < n; i2++) {
            var id = HEAP32[vaos + i2 * 4 >> 2];
            GLctx["deleteVertexArray"](GL.vaos[id]);
            GL.vaos[id] = null;
          }
        }
        Module2["_emscripten_glDeleteVertexArraysOES"] = _emscripten_glDeleteVertexArraysOES;
        function _emscripten_glDepthFunc(x0) {
          GLctx["depthFunc"](x0);
        }
        Module2["_emscripten_glDepthFunc"] = _emscripten_glDepthFunc;
        function _emscripten_glDepthMask(flag) {
          GLctx.depthMask(!!flag);
        }
        Module2["_emscripten_glDepthMask"] = _emscripten_glDepthMask;
        function _emscripten_glDepthRangef(x0, x1) {
          GLctx["depthRange"](x0, x1);
        }
        Module2["_emscripten_glDepthRangef"] = _emscripten_glDepthRangef;
        function _emscripten_glDetachShader(program, shader) {
          GLctx.detachShader(GL.programs[program], GL.shaders[shader]);
        }
        Module2["_emscripten_glDetachShader"] = _emscripten_glDetachShader;
        function _emscripten_glDisable(x0) {
          GLctx["disable"](x0);
        }
        Module2["_emscripten_glDisable"] = _emscripten_glDisable;
        function _emscripten_glDisableVertexAttribArray(index) {
          var cb = GL.currentContext.clientBuffers[index];
          cb.enabled = false;
          GLctx.disableVertexAttribArray(index);
        }
        Module2["_emscripten_glDisableVertexAttribArray"] = _emscripten_glDisableVertexAttribArray;
        function _emscripten_glDrawArrays(mode, first, count) {
          GL.preDrawHandleClientVertexAttribBindings(first + count);
          GLctx.drawArrays(mode, first, count);
          GL.postDrawHandleClientVertexAttribBindings();
        }
        Module2["_emscripten_glDrawArrays"] = _emscripten_glDrawArrays;
        function _emscripten_glDrawArraysInstanced(mode, first, count, primcount) {
          GLctx["drawArraysInstanced"](mode, first, count, primcount);
        }
        Module2["_emscripten_glDrawArraysInstanced"] = _emscripten_glDrawArraysInstanced;
        function _emscripten_glDrawArraysInstancedANGLE(mode, first, count, primcount) {
          GLctx["drawArraysInstanced"](mode, first, count, primcount);
        }
        Module2["_emscripten_glDrawArraysInstancedANGLE"] = _emscripten_glDrawArraysInstancedANGLE;
        function _emscripten_glDrawArraysInstancedARB(mode, first, count, primcount) {
          GLctx["drawArraysInstanced"](mode, first, count, primcount);
        }
        Module2["_emscripten_glDrawArraysInstancedARB"] = _emscripten_glDrawArraysInstancedARB;
        function _emscripten_glDrawArraysInstancedEXT(mode, first, count, primcount) {
          GLctx["drawArraysInstanced"](mode, first, count, primcount);
        }
        Module2["_emscripten_glDrawArraysInstancedEXT"] = _emscripten_glDrawArraysInstancedEXT;
        function _emscripten_glDrawArraysInstancedNV(mode, first, count, primcount) {
          GLctx["drawArraysInstanced"](mode, first, count, primcount);
        }
        Module2["_emscripten_glDrawArraysInstancedNV"] = _emscripten_glDrawArraysInstancedNV;
        var tempFixedLengthArray = [];
        Module2["tempFixedLengthArray"] = tempFixedLengthArray;
        function _emscripten_glDrawBuffers(n, bufs) {
          var bufArray = tempFixedLengthArray[n];
          for (var i2 = 0; i2 < n; i2++) {
            bufArray[i2] = HEAP32[bufs + i2 * 4 >> 2];
          }
          GLctx["drawBuffers"](bufArray);
        }
        Module2["_emscripten_glDrawBuffers"] = _emscripten_glDrawBuffers;
        function _emscripten_glDrawBuffersEXT(n, bufs) {
          var bufArray = tempFixedLengthArray[n];
          for (var i2 = 0; i2 < n; i2++) {
            bufArray[i2] = HEAP32[bufs + i2 * 4 >> 2];
          }
          GLctx["drawBuffers"](bufArray);
        }
        Module2["_emscripten_glDrawBuffersEXT"] = _emscripten_glDrawBuffersEXT;
        function _emscripten_glDrawBuffersWEBGL(n, bufs) {
          var bufArray = tempFixedLengthArray[n];
          for (var i2 = 0; i2 < n; i2++) {
            bufArray[i2] = HEAP32[bufs + i2 * 4 >> 2];
          }
          GLctx["drawBuffers"](bufArray);
        }
        Module2["_emscripten_glDrawBuffersWEBGL"] = _emscripten_glDrawBuffersWEBGL;
        function _emscripten_glDrawElements(mode, count, type, indices) {
          var buf;
          if (!GLctx.currentElementArrayBufferBinding) {
            var size = GL.calcBufLength(1, type, 0, count);
            buf = GL.getTempIndexBuffer(size);
            GLctx.bindBuffer(34963, buf);
            GLctx.bufferSubData(34963, 0, HEAPU8.subarray(indices, indices + size));
            indices = 0;
          }
          GL.preDrawHandleClientVertexAttribBindings(count);
          GLctx.drawElements(mode, count, type, indices);
          GL.postDrawHandleClientVertexAttribBindings(count);
          if (!GLctx.currentElementArrayBufferBinding) {
            GLctx.bindBuffer(34963, null);
          }
        }
        Module2["_emscripten_glDrawElements"] = _emscripten_glDrawElements;
        function _emscripten_glDrawElementsInstanced(mode, count, type, indices, primcount) {
          GLctx["drawElementsInstanced"](mode, count, type, indices, primcount);
        }
        Module2["_emscripten_glDrawElementsInstanced"] = _emscripten_glDrawElementsInstanced;
        function _emscripten_glDrawElementsInstancedANGLE(mode, count, type, indices, primcount) {
          GLctx["drawElementsInstanced"](mode, count, type, indices, primcount);
        }
        Module2["_emscripten_glDrawElementsInstancedANGLE"] = _emscripten_glDrawElementsInstancedANGLE;
        function _emscripten_glDrawElementsInstancedARB(mode, count, type, indices, primcount) {
          GLctx["drawElementsInstanced"](mode, count, type, indices, primcount);
        }
        Module2["_emscripten_glDrawElementsInstancedARB"] = _emscripten_glDrawElementsInstancedARB;
        function _emscripten_glDrawElementsInstancedEXT(mode, count, type, indices, primcount) {
          GLctx["drawElementsInstanced"](mode, count, type, indices, primcount);
        }
        Module2["_emscripten_glDrawElementsInstancedEXT"] = _emscripten_glDrawElementsInstancedEXT;
        function _emscripten_glDrawElementsInstancedNV(mode, count, type, indices, primcount) {
          GLctx["drawElementsInstanced"](mode, count, type, indices, primcount);
        }
        Module2["_emscripten_glDrawElementsInstancedNV"] = _emscripten_glDrawElementsInstancedNV;
        function _glDrawElements(mode, count, type, indices) {
          var buf;
          if (!GLctx.currentElementArrayBufferBinding) {
            var size = GL.calcBufLength(1, type, 0, count);
            buf = GL.getTempIndexBuffer(size);
            GLctx.bindBuffer(34963, buf);
            GLctx.bufferSubData(34963, 0, HEAPU8.subarray(indices, indices + size));
            indices = 0;
          }
          GL.preDrawHandleClientVertexAttribBindings(count);
          GLctx.drawElements(mode, count, type, indices);
          GL.postDrawHandleClientVertexAttribBindings(count);
          if (!GLctx.currentElementArrayBufferBinding) {
            GLctx.bindBuffer(34963, null);
          }
        }
        Module2["_glDrawElements"] = _glDrawElements;
        function _emscripten_glDrawRangeElements(mode, start, end, count, type, indices) {
          _glDrawElements(mode, count, type, indices);
        }
        Module2["_emscripten_glDrawRangeElements"] = _emscripten_glDrawRangeElements;
        function _emscripten_glEnable(x0) {
          GLctx["enable"](x0);
        }
        Module2["_emscripten_glEnable"] = _emscripten_glEnable;
        function _emscripten_glEnableVertexAttribArray(index) {
          var cb = GL.currentContext.clientBuffers[index];
          cb.enabled = true;
          GLctx.enableVertexAttribArray(index);
        }
        Module2["_emscripten_glEnableVertexAttribArray"] = _emscripten_glEnableVertexAttribArray;
        function _emscripten_glEndQuery(x0) {
          GLctx["endQuery"](x0);
        }
        Module2["_emscripten_glEndQuery"] = _emscripten_glEndQuery;
        function _emscripten_glEndQueryEXT(target) {
          GLctx.disjointTimerQueryExt["endQueryEXT"](target);
        }
        Module2["_emscripten_glEndQueryEXT"] = _emscripten_glEndQueryEXT;
        function _emscripten_glEndTransformFeedback() {
          GLctx["endTransformFeedback"]();
        }
        Module2["_emscripten_glEndTransformFeedback"] = _emscripten_glEndTransformFeedback;
        function _emscripten_glFenceSync(condition, flags) {
          var sync = GLctx.fenceSync(condition, flags);
          if (sync) {
            var id = GL.getNewId(GL.syncs);
            sync.name = id;
            GL.syncs[id] = sync;
            return id;
          }
          return 0;
        }
        Module2["_emscripten_glFenceSync"] = _emscripten_glFenceSync;
        function _emscripten_glFinish() {
          GLctx["finish"]();
        }
        Module2["_emscripten_glFinish"] = _emscripten_glFinish;
        function _emscripten_glFlush() {
          GLctx["flush"]();
        }
        Module2["_emscripten_glFlush"] = _emscripten_glFlush;
        function emscriptenWebGLGetBufferBinding(target) {
          switch (target) {
            case 34962:
              target = 34964;
              break;
            case 34963:
              target = 34965;
              break;
            case 35051:
              target = 35053;
              break;
            case 35052:
              target = 35055;
              break;
            case 35982:
              target = 35983;
              break;
            case 36662:
              target = 36662;
              break;
            case 36663:
              target = 36663;
              break;
            case 35345:
              target = 35368;
              break;
          }
          var buffer2 = GLctx.getParameter(target);
          if (buffer2) return buffer2.name | 0;
          else return 0;
        }
        Module2["emscriptenWebGLGetBufferBinding"] = emscriptenWebGLGetBufferBinding;
        function emscriptenWebGLValidateMapBufferTarget(target) {
          switch (target) {
            case 34962:
            case 34963:
            case 36662:
            case 36663:
            case 35051:
            case 35052:
            case 35882:
            case 35982:
            case 35345:
              return true;
            default:
              return false;
          }
        }
        Module2["emscriptenWebGLValidateMapBufferTarget"] = emscriptenWebGLValidateMapBufferTarget;
        function _emscripten_glFlushMappedBufferRange(target, offset, length) {
          if (!emscriptenWebGLValidateMapBufferTarget(target)) {
            GL.recordError(1280);
            err("GL_INVALID_ENUM in glFlushMappedBufferRange");
            return;
          }
          var mapping = GL.mappedBuffers[emscriptenWebGLGetBufferBinding(target)];
          if (!mapping) {
            GL.recordError(1282);
            err("buffer was never mapped in glFlushMappedBufferRange");
            return;
          }
          if (!(mapping.access & 16)) {
            GL.recordError(1282);
            err("buffer was not mapped with GL_MAP_FLUSH_EXPLICIT_BIT in glFlushMappedBufferRange");
            return;
          }
          if (offset < 0 || length < 0 || offset + length > mapping.length) {
            GL.recordError(1281);
            err("invalid range in glFlushMappedBufferRange");
            return;
          }
          GLctx.bufferSubData(target, mapping.offset, HEAPU8.subarray(mapping.mem + offset, mapping.mem + offset + length));
        }
        Module2["_emscripten_glFlushMappedBufferRange"] = _emscripten_glFlushMappedBufferRange;
        function _emscripten_glFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) {
          GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget, GL.renderbuffers[renderbuffer]);
        }
        Module2["_emscripten_glFramebufferRenderbuffer"] = _emscripten_glFramebufferRenderbuffer;
        function _emscripten_glFramebufferTexture2D(target, attachment, textarget, texture, level) {
          GLctx.framebufferTexture2D(target, attachment, textarget, GL.textures[texture], level);
        }
        Module2["_emscripten_glFramebufferTexture2D"] = _emscripten_glFramebufferTexture2D;
        function _emscripten_glFramebufferTextureLayer(target, attachment, texture, level, layer) {
          GLctx.framebufferTextureLayer(target, attachment, GL.textures[texture], level, layer);
        }
        Module2["_emscripten_glFramebufferTextureLayer"] = _emscripten_glFramebufferTextureLayer;
        function _emscripten_glFrontFace(x0) {
          GLctx["frontFace"](x0);
        }
        Module2["_emscripten_glFrontFace"] = _emscripten_glFrontFace;
        function __glGenObject(n, buffers, createFunction, objectTable) {
          for (var i2 = 0; i2 < n; i2++) {
            var buffer2 = GLctx[createFunction]();
            var id = buffer2 && GL.getNewId(objectTable);
            if (buffer2) {
              buffer2.name = id;
              objectTable[id] = buffer2;
            } else {
              GL.recordError(1282);
            }
            HEAP32[buffers + i2 * 4 >> 2] = id;
          }
        }
        Module2["__glGenObject"] = __glGenObject;
        function _emscripten_glGenBuffers(n, buffers) {
          __glGenObject(n, buffers, "createBuffer", GL.buffers);
        }
        Module2["_emscripten_glGenBuffers"] = _emscripten_glGenBuffers;
        function _emscripten_glGenFramebuffers(n, ids) {
          __glGenObject(n, ids, "createFramebuffer", GL.framebuffers);
        }
        Module2["_emscripten_glGenFramebuffers"] = _emscripten_glGenFramebuffers;
        function _emscripten_glGenQueries(n, ids) {
          __glGenObject(n, ids, "createQuery", GL.queries);
        }
        Module2["_emscripten_glGenQueries"] = _emscripten_glGenQueries;
        function _emscripten_glGenQueriesEXT(n, ids) {
          for (var i2 = 0; i2 < n; i2++) {
            var query = GLctx.disjointTimerQueryExt["createQueryEXT"]();
            if (!query) {
              GL.recordError(1282);
              while (i2 < n) HEAP32[ids + i2++ * 4 >> 2] = 0;
              return;
            }
            var id = GL.getNewId(GL.queries);
            query.name = id;
            GL.queries[id] = query;
            HEAP32[ids + i2 * 4 >> 2] = id;
          }
        }
        Module2["_emscripten_glGenQueriesEXT"] = _emscripten_glGenQueriesEXT;
        function _emscripten_glGenRenderbuffers(n, renderbuffers) {
          __glGenObject(n, renderbuffers, "createRenderbuffer", GL.renderbuffers);
        }
        Module2["_emscripten_glGenRenderbuffers"] = _emscripten_glGenRenderbuffers;
        function _emscripten_glGenSamplers(n, samplers) {
          __glGenObject(n, samplers, "createSampler", GL.samplers);
        }
        Module2["_emscripten_glGenSamplers"] = _emscripten_glGenSamplers;
        function _emscripten_glGenTextures(n, textures) {
          __glGenObject(n, textures, "createTexture", GL.textures);
        }
        Module2["_emscripten_glGenTextures"] = _emscripten_glGenTextures;
        function _emscripten_glGenTransformFeedbacks(n, ids) {
          __glGenObject(n, ids, "createTransformFeedback", GL.transformFeedbacks);
        }
        Module2["_emscripten_glGenTransformFeedbacks"] = _emscripten_glGenTransformFeedbacks;
        function _emscripten_glGenVertexArrays(n, arrays) {
          __glGenObject(n, arrays, "createVertexArray", GL.vaos);
        }
        Module2["_emscripten_glGenVertexArrays"] = _emscripten_glGenVertexArrays;
        function _emscripten_glGenVertexArraysOES(n, arrays) {
          __glGenObject(n, arrays, "createVertexArray", GL.vaos);
        }
        Module2["_emscripten_glGenVertexArraysOES"] = _emscripten_glGenVertexArraysOES;
        function _emscripten_glGenerateMipmap(x0) {
          GLctx["generateMipmap"](x0);
        }
        Module2["_emscripten_glGenerateMipmap"] = _emscripten_glGenerateMipmap;
        function __glGetActiveAttribOrUniform(funcName, program, index, bufSize, length, size, type, name) {
          program = GL.programs[program];
          var info = GLctx[funcName](program, index);
          if (info) {
            var numBytesWrittenExclNull = name && stringToUTF8(info.name, name, bufSize);
            if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
            if (size) HEAP32[size >> 2] = info.size;
            if (type) HEAP32[type >> 2] = info.type;
          }
        }
        Module2["__glGetActiveAttribOrUniform"] = __glGetActiveAttribOrUniform;
        function _emscripten_glGetActiveAttrib(program, index, bufSize, length, size, type, name) {
          __glGetActiveAttribOrUniform("getActiveAttrib", program, index, bufSize, length, size, type, name);
        }
        Module2["_emscripten_glGetActiveAttrib"] = _emscripten_glGetActiveAttrib;
        function _emscripten_glGetActiveUniform(program, index, bufSize, length, size, type, name) {
          __glGetActiveAttribOrUniform("getActiveUniform", program, index, bufSize, length, size, type, name);
        }
        Module2["_emscripten_glGetActiveUniform"] = _emscripten_glGetActiveUniform;
        function _emscripten_glGetActiveUniformBlockName(program, uniformBlockIndex, bufSize, length, uniformBlockName) {
          program = GL.programs[program];
          var result = GLctx["getActiveUniformBlockName"](program, uniformBlockIndex);
          if (!result) return;
          if (uniformBlockName && bufSize > 0) {
            var numBytesWrittenExclNull = stringToUTF8(result, uniformBlockName, bufSize);
            if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
          } else {
            if (length) HEAP32[length >> 2] = 0;
          }
        }
        Module2["_emscripten_glGetActiveUniformBlockName"] = _emscripten_glGetActiveUniformBlockName;
        function _emscripten_glGetActiveUniformBlockiv(program, uniformBlockIndex, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          program = GL.programs[program];
          if (pname == 35393) {
            var name = GLctx["getActiveUniformBlockName"](program, uniformBlockIndex);
            HEAP32[params >> 2] = name.length + 1;
            return;
          }
          var result = GLctx["getActiveUniformBlockParameter"](program, uniformBlockIndex, pname);
          if (result === null) return;
          if (pname == 35395) {
            for (var i2 = 0; i2 < result.length; i2++) {
              HEAP32[params + i2 * 4 >> 2] = result[i2];
            }
          } else {
            HEAP32[params >> 2] = result;
          }
        }
        Module2["_emscripten_glGetActiveUniformBlockiv"] = _emscripten_glGetActiveUniformBlockiv;
        function _emscripten_glGetActiveUniformsiv(program, uniformCount, uniformIndices, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          if (uniformCount > 0 && uniformIndices == 0) {
            GL.recordError(1281);
            return;
          }
          program = GL.programs[program];
          var ids = [];
          for (var i2 = 0; i2 < uniformCount; i2++) {
            ids.push(HEAP32[uniformIndices + i2 * 4 >> 2]);
          }
          var result = GLctx["getActiveUniforms"](program, ids, pname);
          if (!result) return;
          var len = result.length;
          for (var i2 = 0; i2 < len; i2++) {
            HEAP32[params + i2 * 4 >> 2] = result[i2];
          }
        }
        Module2["_emscripten_glGetActiveUniformsiv"] = _emscripten_glGetActiveUniformsiv;
        function _emscripten_glGetAttachedShaders(program, maxCount, count, shaders) {
          var result = GLctx.getAttachedShaders(GL.programs[program]);
          var len = result.length;
          if (len > maxCount) {
            len = maxCount;
          }
          HEAP32[count >> 2] = len;
          for (var i2 = 0; i2 < len; ++i2) {
            var id = GL.shaders.indexOf(result[i2]);
            HEAP32[shaders + i2 * 4 >> 2] = id;
          }
        }
        Module2["_emscripten_glGetAttachedShaders"] = _emscripten_glGetAttachedShaders;
        function _emscripten_glGetAttribLocation(program, name) {
          return GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
        }
        Module2["_emscripten_glGetAttribLocation"] = _emscripten_glGetAttribLocation;
        function writeI53ToI64(ptr, num) {
          HEAPU32[ptr >> 2] = num;
          HEAPU32[ptr + 4 >> 2] = (num - HEAPU32[ptr >> 2]) / 4294967296;
        }
        Module2["writeI53ToI64"] = writeI53ToI64;
        function emscriptenWebGLGet(name_, p, type) {
          if (!p) {
            GL.recordError(1281);
            return;
          }
          var ret = void 0;
          switch (name_) {
            case 36346:
              ret = 1;
              break;
            case 36344:
              if (type != 0 && type != 1) {
                GL.recordError(1280);
              }
              return;
            case 34814:
            case 36345:
              ret = 0;
              break;
            case 34466:
              var formats = GLctx.getParameter(34467);
              ret = formats ? formats.length : 0;
              break;
            case 33309:
              if (GL.currentContext.version < 2) {
                GL.recordError(1282);
                return;
              }
              var exts = GLctx.getSupportedExtensions() || [];
              ret = 2 * exts.length;
              break;
            case 33307:
            case 33308:
              if (GL.currentContext.version < 2) {
                GL.recordError(1280);
                return;
              }
              ret = name_ == 33307 ? 3 : 0;
              break;
          }
          if (ret === void 0) {
            var result = GLctx.getParameter(name_);
            switch (typeof result) {
              case "number":
                ret = result;
                break;
              case "boolean":
                ret = result ? 1 : 0;
                break;
              case "string":
                GL.recordError(1280);
                return;
              case "object":
                if (result === null) {
                  switch (name_) {
                    case 34964:
                    case 35725:
                    case 34965:
                    case 36006:
                    case 36007:
                    case 32873:
                    case 34229:
                    case 36662:
                    case 36663:
                    case 35053:
                    case 35055:
                    case 36010:
                    case 35097:
                    case 35869:
                    case 32874:
                    case 36389:
                    case 35983:
                    case 35368:
                    case 34068: {
                      ret = 0;
                      break;
                    }
                    default: {
                      GL.recordError(1280);
                      return;
                    }
                  }
                } else if (result instanceof Float32Array || result instanceof Uint32Array || result instanceof Int32Array || result instanceof Array) {
                  for (var i2 = 0; i2 < result.length; ++i2) {
                    switch (type) {
                      case 0:
                        HEAP32[p + i2 * 4 >> 2] = result[i2];
                        break;
                      case 2:
                        HEAPF32[p + i2 * 4 >> 2] = result[i2];
                        break;
                      case 4:
                        HEAP8[p + i2 >> 0] = result[i2] ? 1 : 0;
                        break;
                    }
                  }
                  return;
                } else {
                  try {
                    ret = result.name | 0;
                  } catch (e) {
                    GL.recordError(1280);
                    err("GL_INVALID_ENUM in glGet" + type + "v: Unknown object returned from WebGL getParameter(" + name_ + ")! (error: " + e + ")");
                    return;
                  }
                }
                break;
              default:
                GL.recordError(1280);
                err("GL_INVALID_ENUM in glGet" + type + "v: Native code calling glGet" + type + "v(" + name_ + ") and it returns " + result + " of type " + typeof result + "!");
                return;
            }
          }
          switch (type) {
            case 1:
              writeI53ToI64(p, ret);
              break;
            case 0:
              HEAP32[p >> 2] = ret;
              break;
            case 2:
              HEAPF32[p >> 2] = ret;
              break;
            case 4:
              HEAP8[p >> 0] = ret ? 1 : 0;
              break;
          }
        }
        Module2["emscriptenWebGLGet"] = emscriptenWebGLGet;
        function _emscripten_glGetBooleanv(name_, p) {
          emscriptenWebGLGet(name_, p, 4);
        }
        Module2["_emscripten_glGetBooleanv"] = _emscripten_glGetBooleanv;
        function _emscripten_glGetBufferParameteri64v(target, value, data) {
          if (!data) {
            GL.recordError(1281);
            return;
          }
          writeI53ToI64(data, GLctx.getBufferParameter(target, value));
        }
        Module2["_emscripten_glGetBufferParameteri64v"] = _emscripten_glGetBufferParameteri64v;
        function _emscripten_glGetBufferParameteriv(target, value, data) {
          if (!data) {
            GL.recordError(1281);
            return;
          }
          HEAP32[data >> 2] = GLctx.getBufferParameter(target, value);
        }
        Module2["_emscripten_glGetBufferParameteriv"] = _emscripten_glGetBufferParameteriv;
        function _emscripten_glGetBufferPointerv(target, pname, params) {
          if (pname == 35005) {
            var ptr = 0;
            var mappedBuffer = GL.mappedBuffers[emscriptenWebGLGetBufferBinding(target)];
            if (mappedBuffer) {
              ptr = mappedBuffer.mem;
            }
            HEAP32[params >> 2] = ptr;
          } else {
            GL.recordError(1280);
            err("GL_INVALID_ENUM in glGetBufferPointerv");
          }
        }
        Module2["_emscripten_glGetBufferPointerv"] = _emscripten_glGetBufferPointerv;
        function _emscripten_glGetError() {
          var error = GLctx.getError() || GL.lastError;
          GL.lastError = 0;
          return error;
        }
        Module2["_emscripten_glGetError"] = _emscripten_glGetError;
        function _emscripten_glGetFloatv(name_, p) {
          emscriptenWebGLGet(name_, p, 2);
        }
        Module2["_emscripten_glGetFloatv"] = _emscripten_glGetFloatv;
        function _emscripten_glGetFragDataLocation(program, name) {
          return GLctx["getFragDataLocation"](GL.programs[program], UTF8ToString(name));
        }
        Module2["_emscripten_glGetFragDataLocation"] = _emscripten_glGetFragDataLocation;
        function _emscripten_glGetFramebufferAttachmentParameteriv(target, attachment, pname, params) {
          var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
          if (result instanceof WebGLRenderbuffer || result instanceof WebGLTexture) {
            result = result.name | 0;
          }
          HEAP32[params >> 2] = result;
        }
        Module2["_emscripten_glGetFramebufferAttachmentParameteriv"] = _emscripten_glGetFramebufferAttachmentParameteriv;
        function emscriptenWebGLGetIndexed(target, index, data, type) {
          if (!data) {
            GL.recordError(1281);
            return;
          }
          var result = GLctx["getIndexedParameter"](target, index);
          var ret;
          switch (typeof result) {
            case "boolean":
              ret = result ? 1 : 0;
              break;
            case "number":
              ret = result;
              break;
            case "object":
              if (result === null) {
                switch (target) {
                  case 35983:
                  case 35368:
                    ret = 0;
                    break;
                  default: {
                    GL.recordError(1280);
                    return;
                  }
                }
              } else if (result instanceof WebGLBuffer) {
                ret = result.name | 0;
              } else {
                GL.recordError(1280);
                return;
              }
              break;
            default:
              GL.recordError(1280);
              return;
          }
          switch (type) {
            case 1:
              writeI53ToI64(data, ret);
              break;
            case 0:
              HEAP32[data >> 2] = ret;
              break;
            case 2:
              HEAPF32[data >> 2] = ret;
              break;
            case 4:
              HEAP8[data >> 0] = ret ? 1 : 0;
              break;
            default:
              throw "internal emscriptenWebGLGetIndexed() error, bad type: " + type;
          }
        }
        Module2["emscriptenWebGLGetIndexed"] = emscriptenWebGLGetIndexed;
        function _emscripten_glGetInteger64i_v(target, index, data) {
          emscriptenWebGLGetIndexed(target, index, data, 1);
        }
        Module2["_emscripten_glGetInteger64i_v"] = _emscripten_glGetInteger64i_v;
        function _emscripten_glGetInteger64v(name_, p) {
          emscriptenWebGLGet(name_, p, 1);
        }
        Module2["_emscripten_glGetInteger64v"] = _emscripten_glGetInteger64v;
        function _emscripten_glGetIntegeri_v(target, index, data) {
          emscriptenWebGLGetIndexed(target, index, data, 0);
        }
        Module2["_emscripten_glGetIntegeri_v"] = _emscripten_glGetIntegeri_v;
        function _emscripten_glGetIntegerv(name_, p) {
          emscriptenWebGLGet(name_, p, 0);
        }
        Module2["_emscripten_glGetIntegerv"] = _emscripten_glGetIntegerv;
        function _emscripten_glGetInternalformativ(target, internalformat, pname, bufSize, params) {
          if (bufSize < 0) {
            GL.recordError(1281);
            return;
          }
          if (!params) {
            GL.recordError(1281);
            return;
          }
          var ret = GLctx["getInternalformatParameter"](target, internalformat, pname);
          if (ret === null) return;
          for (var i2 = 0; i2 < ret.length && i2 < bufSize; ++i2) {
            HEAP32[params + i2 * 4 >> 2] = ret[i2];
          }
        }
        Module2["_emscripten_glGetInternalformativ"] = _emscripten_glGetInternalformativ;
        function _emscripten_glGetProgramBinary(program, bufSize, length, binaryFormat, binary) {
          GL.recordError(1282);
        }
        Module2["_emscripten_glGetProgramBinary"] = _emscripten_glGetProgramBinary;
        function _emscripten_glGetProgramInfoLog(program, maxLength, length, infoLog) {
          var log = GLctx.getProgramInfoLog(GL.programs[program]);
          if (log === null) log = "(unknown error)";
          var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
          if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
        }
        Module2["_emscripten_glGetProgramInfoLog"] = _emscripten_glGetProgramInfoLog;
        function _emscripten_glGetProgramiv(program, pname, p) {
          if (!p) {
            GL.recordError(1281);
            return;
          }
          if (program >= GL.counter) {
            GL.recordError(1281);
            return;
          }
          program = GL.programs[program];
          if (pname == 35716) {
            var log = GLctx.getProgramInfoLog(program);
            if (log === null) log = "(unknown error)";
            HEAP32[p >> 2] = log.length + 1;
          } else if (pname == 35719) {
            if (!program.maxUniformLength) {
              for (var i2 = 0; i2 < GLctx.getProgramParameter(program, 35718); ++i2) {
                program.maxUniformLength = Math.max(program.maxUniformLength, GLctx.getActiveUniform(program, i2).name.length + 1);
              }
            }
            HEAP32[p >> 2] = program.maxUniformLength;
          } else if (pname == 35722) {
            if (!program.maxAttributeLength) {
              for (var i2 = 0; i2 < GLctx.getProgramParameter(program, 35721); ++i2) {
                program.maxAttributeLength = Math.max(program.maxAttributeLength, GLctx.getActiveAttrib(program, i2).name.length + 1);
              }
            }
            HEAP32[p >> 2] = program.maxAttributeLength;
          } else if (pname == 35381) {
            if (!program.maxUniformBlockNameLength) {
              for (var i2 = 0; i2 < GLctx.getProgramParameter(program, 35382); ++i2) {
                program.maxUniformBlockNameLength = Math.max(program.maxUniformBlockNameLength, GLctx.getActiveUniformBlockName(program, i2).length + 1);
              }
            }
            HEAP32[p >> 2] = program.maxUniformBlockNameLength;
          } else {
            HEAP32[p >> 2] = GLctx.getProgramParameter(program, pname);
          }
        }
        Module2["_emscripten_glGetProgramiv"] = _emscripten_glGetProgramiv;
        function _emscripten_glGetQueryObjecti64vEXT(id, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          var query = GL.queries[id];
          var param;
          if (GL.currentContext.version < 2) {
            param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
          } else {
            param = GLctx["getQueryParameter"](query, pname);
          }
          var ret;
          if (typeof param == "boolean") {
            ret = param ? 1 : 0;
          } else {
            ret = param;
          }
          writeI53ToI64(params, ret);
        }
        Module2["_emscripten_glGetQueryObjecti64vEXT"] = _emscripten_glGetQueryObjecti64vEXT;
        function _emscripten_glGetQueryObjectivEXT(id, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          var query = GL.queries[id];
          var param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
          var ret;
          if (typeof param == "boolean") {
            ret = param ? 1 : 0;
          } else {
            ret = param;
          }
          HEAP32[params >> 2] = ret;
        }
        Module2["_emscripten_glGetQueryObjectivEXT"] = _emscripten_glGetQueryObjectivEXT;
        function _emscripten_glGetQueryObjectui64vEXT(id, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          var query = GL.queries[id];
          var param;
          if (GL.currentContext.version < 2) {
            param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
          } else {
            param = GLctx["getQueryParameter"](query, pname);
          }
          var ret;
          if (typeof param == "boolean") {
            ret = param ? 1 : 0;
          } else {
            ret = param;
          }
          writeI53ToI64(params, ret);
        }
        Module2["_emscripten_glGetQueryObjectui64vEXT"] = _emscripten_glGetQueryObjectui64vEXT;
        function _emscripten_glGetQueryObjectuiv(id, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          var query = GL.queries[id];
          var param = GLctx["getQueryParameter"](query, pname);
          var ret;
          if (typeof param == "boolean") {
            ret = param ? 1 : 0;
          } else {
            ret = param;
          }
          HEAP32[params >> 2] = ret;
        }
        Module2["_emscripten_glGetQueryObjectuiv"] = _emscripten_glGetQueryObjectuiv;
        function _emscripten_glGetQueryObjectuivEXT(id, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          var query = GL.queries[id];
          var param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
          var ret;
          if (typeof param == "boolean") {
            ret = param ? 1 : 0;
          } else {
            ret = param;
          }
          HEAP32[params >> 2] = ret;
        }
        Module2["_emscripten_glGetQueryObjectuivEXT"] = _emscripten_glGetQueryObjectuivEXT;
        function _emscripten_glGetQueryiv(target, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          HEAP32[params >> 2] = GLctx["getQuery"](target, pname);
        }
        Module2["_emscripten_glGetQueryiv"] = _emscripten_glGetQueryiv;
        function _emscripten_glGetQueryivEXT(target, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          HEAP32[params >> 2] = GLctx.disjointTimerQueryExt["getQueryEXT"](target, pname);
        }
        Module2["_emscripten_glGetQueryivEXT"] = _emscripten_glGetQueryivEXT;
        function _emscripten_glGetRenderbufferParameteriv(target, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          HEAP32[params >> 2] = GLctx.getRenderbufferParameter(target, pname);
        }
        Module2["_emscripten_glGetRenderbufferParameteriv"] = _emscripten_glGetRenderbufferParameteriv;
        function _emscripten_glGetSamplerParameterfv(sampler, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          HEAPF32[params >> 2] = GLctx["getSamplerParameter"](GL.samplers[sampler], pname);
        }
        Module2["_emscripten_glGetSamplerParameterfv"] = _emscripten_glGetSamplerParameterfv;
        function _emscripten_glGetSamplerParameteriv(sampler, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          HEAP32[params >> 2] = GLctx["getSamplerParameter"](GL.samplers[sampler], pname);
        }
        Module2["_emscripten_glGetSamplerParameteriv"] = _emscripten_glGetSamplerParameteriv;
        function _emscripten_glGetShaderInfoLog(shader, maxLength, length, infoLog) {
          var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
          if (log === null) log = "(unknown error)";
          var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
          if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
        }
        Module2["_emscripten_glGetShaderInfoLog"] = _emscripten_glGetShaderInfoLog;
        function _emscripten_glGetShaderPrecisionFormat(shaderType, precisionType, range, precision) {
          var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
          HEAP32[range >> 2] = result.rangeMin;
          HEAP32[range + 4 >> 2] = result.rangeMax;
          HEAP32[precision >> 2] = result.precision;
        }
        Module2["_emscripten_glGetShaderPrecisionFormat"] = _emscripten_glGetShaderPrecisionFormat;
        function _emscripten_glGetShaderSource(shader, bufSize, length, source) {
          var result = GLctx.getShaderSource(GL.shaders[shader]);
          if (!result) return;
          var numBytesWrittenExclNull = bufSize > 0 && source ? stringToUTF8(result, source, bufSize) : 0;
          if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
        }
        Module2["_emscripten_glGetShaderSource"] = _emscripten_glGetShaderSource;
        function _emscripten_glGetShaderiv(shader, pname, p) {
          if (!p) {
            GL.recordError(1281);
            return;
          }
          if (pname == 35716) {
            var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
            if (log === null) log = "(unknown error)";
            var logLength = log ? log.length + 1 : 0;
            HEAP32[p >> 2] = logLength;
          } else if (pname == 35720) {
            var source = GLctx.getShaderSource(GL.shaders[shader]);
            var sourceLength = source ? source.length + 1 : 0;
            HEAP32[p >> 2] = sourceLength;
          } else {
            HEAP32[p >> 2] = GLctx.getShaderParameter(GL.shaders[shader], pname);
          }
        }
        Module2["_emscripten_glGetShaderiv"] = _emscripten_glGetShaderiv;
        function stringToNewUTF8(jsString) {
          var length = lengthBytesUTF8(jsString) + 1;
          var cString = _malloc(length);
          stringToUTF8(jsString, cString, length);
          return cString;
        }
        Module2["stringToNewUTF8"] = stringToNewUTF8;
        function _emscripten_glGetString(name_) {
          var ret = GL.stringCache[name_];
          if (!ret) {
            switch (name_) {
              case 7939:
                var exts = GLctx.getSupportedExtensions() || [];
                exts = exts.concat(exts.map(function(e) {
                  return "GL_" + e;
                }));
                ret = stringToNewUTF8(exts.join(" "));
                break;
              case 7936:
              case 7937:
              case 37445:
              case 37446:
                var s = GLctx.getParameter(name_);
                if (!s) {
                  GL.recordError(1280);
                }
                ret = s && stringToNewUTF8(s);
                break;
              case 7938:
                var glVersion = GLctx.getParameter(7938);
                if (GL.currentContext.version >= 2) glVersion = "OpenGL ES 3.0 (" + glVersion + ")";
                else {
                  glVersion = "OpenGL ES 2.0 (" + glVersion + ")";
                }
                ret = stringToNewUTF8(glVersion);
                break;
              case 35724:
                var glslVersion = GLctx.getParameter(35724);
                var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
                var ver_num = glslVersion.match(ver_re);
                if (ver_num !== null) {
                  if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + "0";
                  glslVersion = "OpenGL ES GLSL ES " + ver_num[1] + " (" + glslVersion + ")";
                }
                ret = stringToNewUTF8(glslVersion);
                break;
              default:
                GL.recordError(1280);
            }
            GL.stringCache[name_] = ret;
          }
          return ret;
        }
        Module2["_emscripten_glGetString"] = _emscripten_glGetString;
        function _emscripten_glGetStringi(name, index) {
          if (GL.currentContext.version < 2) {
            GL.recordError(1282);
            return 0;
          }
          var stringiCache = GL.stringiCache[name];
          if (stringiCache) {
            if (index < 0 || index >= stringiCache.length) {
              GL.recordError(1281);
              return 0;
            }
            return stringiCache[index];
          }
          switch (name) {
            case 7939:
              var exts = GLctx.getSupportedExtensions() || [];
              exts = exts.concat(exts.map(function(e) {
                return "GL_" + e;
              }));
              exts = exts.map(function(e) {
                return stringToNewUTF8(e);
              });
              stringiCache = GL.stringiCache[name] = exts;
              if (index < 0 || index >= stringiCache.length) {
                GL.recordError(1281);
                return 0;
              }
              return stringiCache[index];
            default:
              GL.recordError(1280);
              return 0;
          }
        }
        Module2["_emscripten_glGetStringi"] = _emscripten_glGetStringi;
        function _emscripten_glGetSynciv(sync, pname, bufSize, length, values) {
          if (bufSize < 0) {
            GL.recordError(1281);
            return;
          }
          if (!values) {
            GL.recordError(1281);
            return;
          }
          var ret = GLctx.getSyncParameter(GL.syncs[sync], pname);
          if (ret !== null) {
            HEAP32[values >> 2] = ret;
            if (length) HEAP32[length >> 2] = 1;
          }
        }
        Module2["_emscripten_glGetSynciv"] = _emscripten_glGetSynciv;
        function _emscripten_glGetTexParameterfv(target, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          HEAPF32[params >> 2] = GLctx.getTexParameter(target, pname);
        }
        Module2["_emscripten_glGetTexParameterfv"] = _emscripten_glGetTexParameterfv;
        function _emscripten_glGetTexParameteriv(target, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          HEAP32[params >> 2] = GLctx.getTexParameter(target, pname);
        }
        Module2["_emscripten_glGetTexParameteriv"] = _emscripten_glGetTexParameteriv;
        function _emscripten_glGetTransformFeedbackVarying(program, index, bufSize, length, size, type, name) {
          program = GL.programs[program];
          var info = GLctx["getTransformFeedbackVarying"](program, index);
          if (!info) return;
          if (name && bufSize > 0) {
            var numBytesWrittenExclNull = stringToUTF8(info.name, name, bufSize);
            if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
          } else {
            if (length) HEAP32[length >> 2] = 0;
          }
          if (size) HEAP32[size >> 2] = info.size;
          if (type) HEAP32[type >> 2] = info.type;
        }
        Module2["_emscripten_glGetTransformFeedbackVarying"] = _emscripten_glGetTransformFeedbackVarying;
        function _emscripten_glGetUniformBlockIndex(program, uniformBlockName) {
          return GLctx["getUniformBlockIndex"](GL.programs[program], UTF8ToString(uniformBlockName));
        }
        Module2["_emscripten_glGetUniformBlockIndex"] = _emscripten_glGetUniformBlockIndex;
        function _emscripten_glGetUniformIndices(program, uniformCount, uniformNames, uniformIndices) {
          if (!uniformIndices) {
            GL.recordError(1281);
            return;
          }
          if (uniformCount > 0 && (uniformNames == 0 || uniformIndices == 0)) {
            GL.recordError(1281);
            return;
          }
          program = GL.programs[program];
          var names = [];
          for (var i2 = 0; i2 < uniformCount; i2++) names.push(UTF8ToString(HEAP32[uniformNames + i2 * 4 >> 2]));
          var result = GLctx["getUniformIndices"](program, names);
          if (!result) return;
          var len = result.length;
          for (var i2 = 0; i2 < len; i2++) {
            HEAP32[uniformIndices + i2 * 4 >> 2] = result[i2];
          }
        }
        Module2["_emscripten_glGetUniformIndices"] = _emscripten_glGetUniformIndices;
        function jstoi_q(str) {
          return parseInt(str);
        }
        Module2["jstoi_q"] = jstoi_q;
        function webglGetLeftBracePos(name) {
          return name.slice(-1) == "]" && name.lastIndexOf("[");
        }
        Module2["webglGetLeftBracePos"] = webglGetLeftBracePos;
        function webglPrepareUniformLocationsBeforeFirstUse(program) {
          var uniformLocsById = program.uniformLocsById, uniformSizeAndIdsByName = program.uniformSizeAndIdsByName, i2, j;
          if (!uniformLocsById) {
            program.uniformLocsById = uniformLocsById = {};
            program.uniformArrayNamesById = {};
            for (i2 = 0; i2 < GLctx.getProgramParameter(program, 35718); ++i2) {
              var u = GLctx.getActiveUniform(program, i2);
              var nm = u.name;
              var sz = u.size;
              var lb = webglGetLeftBracePos(nm);
              var arrayName = lb > 0 ? nm.slice(0, lb) : nm;
              var id = program.uniformIdCounter;
              program.uniformIdCounter += sz;
              uniformSizeAndIdsByName[arrayName] = [sz, id];
              for (j = 0; j < sz; ++j) {
                uniformLocsById[id] = j;
                program.uniformArrayNamesById[id++] = arrayName;
              }
            }
          }
        }
        Module2["webglPrepareUniformLocationsBeforeFirstUse"] = webglPrepareUniformLocationsBeforeFirstUse;
        function _emscripten_glGetUniformLocation(program, name) {
          name = UTF8ToString(name);
          if (program = GL.programs[program]) {
            webglPrepareUniformLocationsBeforeFirstUse(program);
            var uniformLocsById = program.uniformLocsById;
            var arrayIndex = 0;
            var uniformBaseName = name;
            var leftBrace = webglGetLeftBracePos(name);
            if (leftBrace > 0) {
              arrayIndex = jstoi_q(name.slice(leftBrace + 1)) >>> 0;
              uniformBaseName = name.slice(0, leftBrace);
            }
            var sizeAndId = program.uniformSizeAndIdsByName[uniformBaseName];
            if (sizeAndId && arrayIndex < sizeAndId[0]) {
              arrayIndex += sizeAndId[1];
              if (uniformLocsById[arrayIndex] = uniformLocsById[arrayIndex] || GLctx.getUniformLocation(program, name)) {
                return arrayIndex;
              }
            }
          } else {
            GL.recordError(1281);
          }
          return -1;
        }
        Module2["_emscripten_glGetUniformLocation"] = _emscripten_glGetUniformLocation;
        function webglGetUniformLocation(location2) {
          var p = GLctx.currentProgram;
          if (p) {
            var webglLoc = p.uniformLocsById[location2];
            if (typeof webglLoc == "number") {
              p.uniformLocsById[location2] = webglLoc = GLctx.getUniformLocation(p, p.uniformArrayNamesById[location2] + (webglLoc > 0 ? "[" + webglLoc + "]" : ""));
            }
            return webglLoc;
          } else {
            GL.recordError(1282);
          }
        }
        Module2["webglGetUniformLocation"] = webglGetUniformLocation;
        function emscriptenWebGLGetUniform(program, location2, params, type) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          program = GL.programs[program];
          webglPrepareUniformLocationsBeforeFirstUse(program);
          var data = GLctx.getUniform(program, webglGetUniformLocation(location2));
          if (typeof data == "number" || typeof data == "boolean") {
            switch (type) {
              case 0:
                HEAP32[params >> 2] = data;
                break;
              case 2:
                HEAPF32[params >> 2] = data;
                break;
            }
          } else {
            for (var i2 = 0; i2 < data.length; i2++) {
              switch (type) {
                case 0:
                  HEAP32[params + i2 * 4 >> 2] = data[i2];
                  break;
                case 2:
                  HEAPF32[params + i2 * 4 >> 2] = data[i2];
                  break;
              }
            }
          }
        }
        Module2["emscriptenWebGLGetUniform"] = emscriptenWebGLGetUniform;
        function _emscripten_glGetUniformfv(program, location2, params) {
          emscriptenWebGLGetUniform(program, location2, params, 2);
        }
        Module2["_emscripten_glGetUniformfv"] = _emscripten_glGetUniformfv;
        function _emscripten_glGetUniformiv(program, location2, params) {
          emscriptenWebGLGetUniform(program, location2, params, 0);
        }
        Module2["_emscripten_glGetUniformiv"] = _emscripten_glGetUniformiv;
        function _emscripten_glGetUniformuiv(program, location2, params) {
          emscriptenWebGLGetUniform(program, location2, params, 0);
        }
        Module2["_emscripten_glGetUniformuiv"] = _emscripten_glGetUniformuiv;
        function emscriptenWebGLGetVertexAttrib(index, pname, params, type) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          if (GL.currentContext.clientBuffers[index].enabled) {
            err("glGetVertexAttrib*v on client-side array: not supported, bad data returned");
          }
          var data = GLctx.getVertexAttrib(index, pname);
          if (pname == 34975) {
            HEAP32[params >> 2] = data && data["name"];
          } else if (typeof data == "number" || typeof data == "boolean") {
            switch (type) {
              case 0:
                HEAP32[params >> 2] = data;
                break;
              case 2:
                HEAPF32[params >> 2] = data;
                break;
              case 5:
                HEAP32[params >> 2] = Math.fround(data);
                break;
            }
          } else {
            for (var i2 = 0; i2 < data.length; i2++) {
              switch (type) {
                case 0:
                  HEAP32[params + i2 * 4 >> 2] = data[i2];
                  break;
                case 2:
                  HEAPF32[params + i2 * 4 >> 2] = data[i2];
                  break;
                case 5:
                  HEAP32[params + i2 * 4 >> 2] = Math.fround(data[i2]);
                  break;
              }
            }
          }
        }
        Module2["emscriptenWebGLGetVertexAttrib"] = emscriptenWebGLGetVertexAttrib;
        function _emscripten_glGetVertexAttribIiv(index, pname, params) {
          emscriptenWebGLGetVertexAttrib(index, pname, params, 0);
        }
        Module2["_emscripten_glGetVertexAttribIiv"] = _emscripten_glGetVertexAttribIiv;
        function _emscripten_glGetVertexAttribIuiv(index, pname, params) {
          emscriptenWebGLGetVertexAttrib(index, pname, params, 0);
        }
        Module2["_emscripten_glGetVertexAttribIuiv"] = _emscripten_glGetVertexAttribIuiv;
        function _emscripten_glGetVertexAttribPointerv(index, pname, pointer) {
          if (!pointer) {
            GL.recordError(1281);
            return;
          }
          if (GL.currentContext.clientBuffers[index].enabled) {
            err("glGetVertexAttribPointer on client-side array: not supported, bad data returned");
          }
          HEAP32[pointer >> 2] = GLctx.getVertexAttribOffset(index, pname);
        }
        Module2["_emscripten_glGetVertexAttribPointerv"] = _emscripten_glGetVertexAttribPointerv;
        function _emscripten_glGetVertexAttribfv(index, pname, params) {
          emscriptenWebGLGetVertexAttrib(index, pname, params, 2);
        }
        Module2["_emscripten_glGetVertexAttribfv"] = _emscripten_glGetVertexAttribfv;
        function _emscripten_glGetVertexAttribiv(index, pname, params) {
          emscriptenWebGLGetVertexAttrib(index, pname, params, 5);
        }
        Module2["_emscripten_glGetVertexAttribiv"] = _emscripten_glGetVertexAttribiv;
        function _emscripten_glHint(x0, x1) {
          GLctx["hint"](x0, x1);
        }
        Module2["_emscripten_glHint"] = _emscripten_glHint;
        function _emscripten_glInvalidateFramebuffer(target, numAttachments, attachments) {
          var list = tempFixedLengthArray[numAttachments];
          for (var i2 = 0; i2 < numAttachments; i2++) {
            list[i2] = HEAP32[attachments + i2 * 4 >> 2];
          }
          GLctx["invalidateFramebuffer"](target, list);
        }
        Module2["_emscripten_glInvalidateFramebuffer"] = _emscripten_glInvalidateFramebuffer;
        function _emscripten_glInvalidateSubFramebuffer(target, numAttachments, attachments, x, y, width, height) {
          var list = tempFixedLengthArray[numAttachments];
          for (var i2 = 0; i2 < numAttachments; i2++) {
            list[i2] = HEAP32[attachments + i2 * 4 >> 2];
          }
          GLctx["invalidateSubFramebuffer"](target, list, x, y, width, height);
        }
        Module2["_emscripten_glInvalidateSubFramebuffer"] = _emscripten_glInvalidateSubFramebuffer;
        function _emscripten_glIsBuffer(buffer2) {
          var b = GL.buffers[buffer2];
          if (!b) return 0;
          return GLctx.isBuffer(b);
        }
        Module2["_emscripten_glIsBuffer"] = _emscripten_glIsBuffer;
        function _emscripten_glIsEnabled(x0) {
          return GLctx["isEnabled"](x0);
        }
        Module2["_emscripten_glIsEnabled"] = _emscripten_glIsEnabled;
        function _emscripten_glIsFramebuffer(framebuffer) {
          var fb = GL.framebuffers[framebuffer];
          if (!fb) return 0;
          return GLctx.isFramebuffer(fb);
        }
        Module2["_emscripten_glIsFramebuffer"] = _emscripten_glIsFramebuffer;
        function _emscripten_glIsProgram(program) {
          program = GL.programs[program];
          if (!program) return 0;
          return GLctx.isProgram(program);
        }
        Module2["_emscripten_glIsProgram"] = _emscripten_glIsProgram;
        function _emscripten_glIsQuery(id) {
          var query = GL.queries[id];
          if (!query) return 0;
          return GLctx["isQuery"](query);
        }
        Module2["_emscripten_glIsQuery"] = _emscripten_glIsQuery;
        function _emscripten_glIsQueryEXT(id) {
          var query = GL.queries[id];
          if (!query) return 0;
          return GLctx.disjointTimerQueryExt["isQueryEXT"](query);
        }
        Module2["_emscripten_glIsQueryEXT"] = _emscripten_glIsQueryEXT;
        function _emscripten_glIsRenderbuffer(renderbuffer) {
          var rb = GL.renderbuffers[renderbuffer];
          if (!rb) return 0;
          return GLctx.isRenderbuffer(rb);
        }
        Module2["_emscripten_glIsRenderbuffer"] = _emscripten_glIsRenderbuffer;
        function _emscripten_glIsSampler(id) {
          var sampler = GL.samplers[id];
          if (!sampler) return 0;
          return GLctx["isSampler"](sampler);
        }
        Module2["_emscripten_glIsSampler"] = _emscripten_glIsSampler;
        function _emscripten_glIsShader(shader) {
          var s = GL.shaders[shader];
          if (!s) return 0;
          return GLctx.isShader(s);
        }
        Module2["_emscripten_glIsShader"] = _emscripten_glIsShader;
        function _emscripten_glIsSync(sync) {
          return GLctx.isSync(GL.syncs[sync]);
        }
        Module2["_emscripten_glIsSync"] = _emscripten_glIsSync;
        function _emscripten_glIsTexture(id) {
          var texture = GL.textures[id];
          if (!texture) return 0;
          return GLctx.isTexture(texture);
        }
        Module2["_emscripten_glIsTexture"] = _emscripten_glIsTexture;
        function _emscripten_glIsTransformFeedback(id) {
          return GLctx["isTransformFeedback"](GL.transformFeedbacks[id]);
        }
        Module2["_emscripten_glIsTransformFeedback"] = _emscripten_glIsTransformFeedback;
        function _emscripten_glIsVertexArray(array) {
          var vao = GL.vaos[array];
          if (!vao) return 0;
          return GLctx["isVertexArray"](vao);
        }
        Module2["_emscripten_glIsVertexArray"] = _emscripten_glIsVertexArray;
        function _emscripten_glIsVertexArrayOES(array) {
          var vao = GL.vaos[array];
          if (!vao) return 0;
          return GLctx["isVertexArray"](vao);
        }
        Module2["_emscripten_glIsVertexArrayOES"] = _emscripten_glIsVertexArrayOES;
        function _emscripten_glLineWidth(x0) {
          GLctx["lineWidth"](x0);
        }
        Module2["_emscripten_glLineWidth"] = _emscripten_glLineWidth;
        function _emscripten_glLinkProgram(program) {
          program = GL.programs[program];
          GLctx.linkProgram(program);
          program.uniformLocsById = 0;
          program.uniformSizeAndIdsByName = {};
        }
        Module2["_emscripten_glLinkProgram"] = _emscripten_glLinkProgram;
        function _emscripten_glMapBufferRange(target, offset, length, access) {
          if (access != 26 && access != 10) {
            err("glMapBufferRange is only supported when access is MAP_WRITE|INVALIDATE_BUFFER");
            return 0;
          }
          if (!emscriptenWebGLValidateMapBufferTarget(target)) {
            GL.recordError(1280);
            err("GL_INVALID_ENUM in glMapBufferRange");
            return 0;
          }
          var mem = _malloc(length);
          if (!mem) return 0;
          GL.mappedBuffers[emscriptenWebGLGetBufferBinding(target)] = { offset, length, mem, access };
          return mem;
        }
        Module2["_emscripten_glMapBufferRange"] = _emscripten_glMapBufferRange;
        function _emscripten_glPauseTransformFeedback() {
          GLctx["pauseTransformFeedback"]();
        }
        Module2["_emscripten_glPauseTransformFeedback"] = _emscripten_glPauseTransformFeedback;
        function _emscripten_glPixelStorei(pname, param) {
          if (pname == 3317) {
            GL.unpackAlignment = param;
          }
          GLctx.pixelStorei(pname, param);
        }
        Module2["_emscripten_glPixelStorei"] = _emscripten_glPixelStorei;
        function _emscripten_glPolygonOffset(x0, x1) {
          GLctx["polygonOffset"](x0, x1);
        }
        Module2["_emscripten_glPolygonOffset"] = _emscripten_glPolygonOffset;
        function _emscripten_glProgramBinary(program, binaryFormat, binary, length) {
          GL.recordError(1280);
        }
        Module2["_emscripten_glProgramBinary"] = _emscripten_glProgramBinary;
        function _emscripten_glProgramParameteri(program, pname, value) {
          GL.recordError(1280);
        }
        Module2["_emscripten_glProgramParameteri"] = _emscripten_glProgramParameteri;
        function _emscripten_glQueryCounterEXT(id, target) {
          GLctx.disjointTimerQueryExt["queryCounterEXT"](GL.queries[id], target);
        }
        Module2["_emscripten_glQueryCounterEXT"] = _emscripten_glQueryCounterEXT;
        function _emscripten_glReadBuffer(x0) {
          GLctx["readBuffer"](x0);
        }
        Module2["_emscripten_glReadBuffer"] = _emscripten_glReadBuffer;
        function computeUnpackAlignedImageSize(width, height, sizePerPixel, alignment) {
          function roundedToNextMultipleOf(x, y) {
            return x + y - 1 & -y;
          }
          var plainRowSize = width * sizePerPixel;
          var alignedRowSize = roundedToNextMultipleOf(plainRowSize, alignment);
          return height * alignedRowSize;
        }
        Module2["computeUnpackAlignedImageSize"] = computeUnpackAlignedImageSize;
        function __colorChannelsInGlTextureFormat(format) {
          var colorChannels = { 5: 3, 6: 4, 8: 2, 29502: 3, 29504: 4, 26917: 2, 26918: 2, 29846: 3, 29847: 4 };
          return colorChannels[format - 6402] || 1;
        }
        Module2["__colorChannelsInGlTextureFormat"] = __colorChannelsInGlTextureFormat;
        function heapObjectForWebGLType(type) {
          type -= 5120;
          if (type == 0) return HEAP8;
          if (type == 1) return HEAPU8;
          if (type == 2) return HEAP16;
          if (type == 4) return HEAP32;
          if (type == 6) return HEAPF32;
          if (type == 5 || type == 28922 || type == 28520 || type == 30779 || type == 30782) return HEAPU32;
          return HEAPU16;
        }
        Module2["heapObjectForWebGLType"] = heapObjectForWebGLType;
        function heapAccessShiftForWebGLHeap(heap) {
          return 31 - Math.clz32(heap.BYTES_PER_ELEMENT);
        }
        Module2["heapAccessShiftForWebGLHeap"] = heapAccessShiftForWebGLHeap;
        function emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) {
          var heap = heapObjectForWebGLType(type);
          var shift = heapAccessShiftForWebGLHeap(heap);
          var byteSize = 1 << shift;
          var sizePerPixel = __colorChannelsInGlTextureFormat(format) * byteSize;
          var bytes = computeUnpackAlignedImageSize(width, height, sizePerPixel, GL.unpackAlignment);
          return heap.subarray(pixels >> shift, pixels + bytes >> shift);
        }
        Module2["emscriptenWebGLGetTexPixelData"] = emscriptenWebGLGetTexPixelData;
        function _emscripten_glReadPixels(x, y, width, height, format, type, pixels) {
          if (GL.currentContext.version >= 2) {
            if (GLctx.currentPixelPackBufferBinding) {
              GLctx.readPixels(x, y, width, height, format, type, pixels);
            } else {
              var heap = heapObjectForWebGLType(type);
              GLctx.readPixels(x, y, width, height, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
            }
            return;
          }
          var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
          if (!pixelData) {
            GL.recordError(1280);
            return;
          }
          GLctx.readPixels(x, y, width, height, format, type, pixelData);
        }
        Module2["_emscripten_glReadPixels"] = _emscripten_glReadPixels;
        function _emscripten_glReleaseShaderCompiler() {
        }
        Module2["_emscripten_glReleaseShaderCompiler"] = _emscripten_glReleaseShaderCompiler;
        function _emscripten_glRenderbufferStorage(x0, x1, x2, x3) {
          GLctx["renderbufferStorage"](x0, x1, x2, x3);
        }
        Module2["_emscripten_glRenderbufferStorage"] = _emscripten_glRenderbufferStorage;
        function _emscripten_glRenderbufferStorageMultisample(x0, x1, x2, x3, x4) {
          GLctx["renderbufferStorageMultisample"](x0, x1, x2, x3, x4);
        }
        Module2["_emscripten_glRenderbufferStorageMultisample"] = _emscripten_glRenderbufferStorageMultisample;
        function _emscripten_glResumeTransformFeedback() {
          GLctx["resumeTransformFeedback"]();
        }
        Module2["_emscripten_glResumeTransformFeedback"] = _emscripten_glResumeTransformFeedback;
        function _emscripten_glSampleCoverage(value, invert) {
          GLctx.sampleCoverage(value, !!invert);
        }
        Module2["_emscripten_glSampleCoverage"] = _emscripten_glSampleCoverage;
        function _emscripten_glSamplerParameterf(sampler, pname, param) {
          GLctx["samplerParameterf"](GL.samplers[sampler], pname, param);
        }
        Module2["_emscripten_glSamplerParameterf"] = _emscripten_glSamplerParameterf;
        function _emscripten_glSamplerParameterfv(sampler, pname, params) {
          var param = HEAPF32[params >> 2];
          GLctx["samplerParameterf"](GL.samplers[sampler], pname, param);
        }
        Module2["_emscripten_glSamplerParameterfv"] = _emscripten_glSamplerParameterfv;
        function _emscripten_glSamplerParameteri(sampler, pname, param) {
          GLctx["samplerParameteri"](GL.samplers[sampler], pname, param);
        }
        Module2["_emscripten_glSamplerParameteri"] = _emscripten_glSamplerParameteri;
        function _emscripten_glSamplerParameteriv(sampler, pname, params) {
          var param = HEAP32[params >> 2];
          GLctx["samplerParameteri"](GL.samplers[sampler], pname, param);
        }
        Module2["_emscripten_glSamplerParameteriv"] = _emscripten_glSamplerParameteriv;
        function _emscripten_glScissor(x0, x1, x2, x3) {
          GLctx["scissor"](x0, x1, x2, x3);
        }
        Module2["_emscripten_glScissor"] = _emscripten_glScissor;
        function _emscripten_glShaderBinary() {
          GL.recordError(1280);
        }
        Module2["_emscripten_glShaderBinary"] = _emscripten_glShaderBinary;
        function _emscripten_glShaderSource(shader, count, string, length) {
          var source = GL.getSource(shader, count, string, length);
          GLctx.shaderSource(GL.shaders[shader], source);
        }
        Module2["_emscripten_glShaderSource"] = _emscripten_glShaderSource;
        function _emscripten_glStencilFunc(x0, x1, x2) {
          GLctx["stencilFunc"](x0, x1, x2);
        }
        Module2["_emscripten_glStencilFunc"] = _emscripten_glStencilFunc;
        function _emscripten_glStencilFuncSeparate(x0, x1, x2, x3) {
          GLctx["stencilFuncSeparate"](x0, x1, x2, x3);
        }
        Module2["_emscripten_glStencilFuncSeparate"] = _emscripten_glStencilFuncSeparate;
        function _emscripten_glStencilMask(x0) {
          GLctx["stencilMask"](x0);
        }
        Module2["_emscripten_glStencilMask"] = _emscripten_glStencilMask;
        function _emscripten_glStencilMaskSeparate(x0, x1) {
          GLctx["stencilMaskSeparate"](x0, x1);
        }
        Module2["_emscripten_glStencilMaskSeparate"] = _emscripten_glStencilMaskSeparate;
        function _emscripten_glStencilOp(x0, x1, x2) {
          GLctx["stencilOp"](x0, x1, x2);
        }
        Module2["_emscripten_glStencilOp"] = _emscripten_glStencilOp;
        function _emscripten_glStencilOpSeparate(x0, x1, x2, x3) {
          GLctx["stencilOpSeparate"](x0, x1, x2, x3);
        }
        Module2["_emscripten_glStencilOpSeparate"] = _emscripten_glStencilOpSeparate;
        function _emscripten_glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
          if (GL.currentContext.version >= 2) {
            if (GLctx.currentPixelUnpackBufferBinding) {
              GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels);
            } else if (pixels) {
              var heap = heapObjectForWebGLType(type);
              GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
            } else {
              GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, null);
            }
            return;
          }
          GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null);
        }
        Module2["_emscripten_glTexImage2D"] = _emscripten_glTexImage2D;
        function _emscripten_glTexImage3D(target, level, internalFormat, width, height, depth, border, format, type, pixels) {
          if (GLctx.currentPixelUnpackBufferBinding) {
            GLctx["texImage3D"](target, level, internalFormat, width, height, depth, border, format, type, pixels);
          } else if (pixels) {
            var heap = heapObjectForWebGLType(type);
            GLctx["texImage3D"](target, level, internalFormat, width, height, depth, border, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
          } else {
            GLctx["texImage3D"](target, level, internalFormat, width, height, depth, border, format, type, null);
          }
        }
        Module2["_emscripten_glTexImage3D"] = _emscripten_glTexImage3D;
        function _emscripten_glTexParameterf(x0, x1, x2) {
          GLctx["texParameterf"](x0, x1, x2);
        }
        Module2["_emscripten_glTexParameterf"] = _emscripten_glTexParameterf;
        function _emscripten_glTexParameterfv(target, pname, params) {
          var param = HEAPF32[params >> 2];
          GLctx.texParameterf(target, pname, param);
        }
        Module2["_emscripten_glTexParameterfv"] = _emscripten_glTexParameterfv;
        function _emscripten_glTexParameteri(x0, x1, x2) {
          GLctx["texParameteri"](x0, x1, x2);
        }
        Module2["_emscripten_glTexParameteri"] = _emscripten_glTexParameteri;
        function _emscripten_glTexParameteriv(target, pname, params) {
          var param = HEAP32[params >> 2];
          GLctx.texParameteri(target, pname, param);
        }
        Module2["_emscripten_glTexParameteriv"] = _emscripten_glTexParameteriv;
        function _emscripten_glTexStorage2D(x0, x1, x2, x3, x4) {
          GLctx["texStorage2D"](x0, x1, x2, x3, x4);
        }
        Module2["_emscripten_glTexStorage2D"] = _emscripten_glTexStorage2D;
        function _emscripten_glTexStorage3D(x0, x1, x2, x3, x4, x5) {
          GLctx["texStorage3D"](x0, x1, x2, x3, x4, x5);
        }
        Module2["_emscripten_glTexStorage3D"] = _emscripten_glTexStorage3D;
        function _emscripten_glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
          if (GL.currentContext.version >= 2) {
            if (GLctx.currentPixelUnpackBufferBinding) {
              GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels);
            } else if (pixels) {
              var heap = heapObjectForWebGLType(type);
              GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
            } else {
              GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, null);
            }
            return;
          }
          var pixelData = null;
          if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0);
          GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
        }
        Module2["_emscripten_glTexSubImage2D"] = _emscripten_glTexSubImage2D;
        function _emscripten_glTexSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, pixels) {
          if (GLctx.currentPixelUnpackBufferBinding) {
            GLctx["texSubImage3D"](target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, pixels);
          } else if (pixels) {
            var heap = heapObjectForWebGLType(type);
            GLctx["texSubImage3D"](target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
          } else {
            GLctx["texSubImage3D"](target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, null);
          }
        }
        Module2["_emscripten_glTexSubImage3D"] = _emscripten_glTexSubImage3D;
        function _emscripten_glTransformFeedbackVaryings(program, count, varyings, bufferMode) {
          program = GL.programs[program];
          var vars = [];
          for (var i2 = 0; i2 < count; i2++) vars.push(UTF8ToString(HEAP32[varyings + i2 * 4 >> 2]));
          GLctx["transformFeedbackVaryings"](program, vars, bufferMode);
        }
        Module2["_emscripten_glTransformFeedbackVaryings"] = _emscripten_glTransformFeedbackVaryings;
        function _emscripten_glUniform1f(location2, v0) {
          GLctx.uniform1f(webglGetUniformLocation(location2), v0);
        }
        Module2["_emscripten_glUniform1f"] = _emscripten_glUniform1f;
        var miniTempWebGLFloatBuffers = [];
        Module2["miniTempWebGLFloatBuffers"] = miniTempWebGLFloatBuffers;
        function _emscripten_glUniform1fv(location2, count, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniform1fv(webglGetUniformLocation(location2), HEAPF32, value >> 2, count);
            return;
          }
          if (count <= 288) {
            var view = miniTempWebGLFloatBuffers[count - 1];
            for (var i2 = 0; i2 < count; ++i2) {
              view[i2] = HEAPF32[value + 4 * i2 >> 2];
            }
          } else {
            var view = HEAPF32.subarray(value >> 2, value + count * 4 >> 2);
          }
          GLctx.uniform1fv(webglGetUniformLocation(location2), view);
        }
        Module2["_emscripten_glUniform1fv"] = _emscripten_glUniform1fv;
        function _emscripten_glUniform1i(location2, v0) {
          GLctx.uniform1i(webglGetUniformLocation(location2), v0);
        }
        Module2["_emscripten_glUniform1i"] = _emscripten_glUniform1i;
        var __miniTempWebGLIntBuffers = [];
        Module2["__miniTempWebGLIntBuffers"] = __miniTempWebGLIntBuffers;
        function _emscripten_glUniform1iv(location2, count, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniform1iv(webglGetUniformLocation(location2), HEAP32, value >> 2, count);
            return;
          }
          if (count <= 288) {
            var view = __miniTempWebGLIntBuffers[count - 1];
            for (var i2 = 0; i2 < count; ++i2) {
              view[i2] = HEAP32[value + 4 * i2 >> 2];
            }
          } else {
            var view = HEAP32.subarray(value >> 2, value + count * 4 >> 2);
          }
          GLctx.uniform1iv(webglGetUniformLocation(location2), view);
        }
        Module2["_emscripten_glUniform1iv"] = _emscripten_glUniform1iv;
        function _emscripten_glUniform1ui(location2, v0) {
          GLctx.uniform1ui(webglGetUniformLocation(location2), v0);
        }
        Module2["_emscripten_glUniform1ui"] = _emscripten_glUniform1ui;
        function _emscripten_glUniform1uiv(location2, count, value) {
          count && GLctx.uniform1uiv(webglGetUniformLocation(location2), HEAPU32, value >> 2, count);
        }
        Module2["_emscripten_glUniform1uiv"] = _emscripten_glUniform1uiv;
        function _emscripten_glUniform2f(location2, v0, v1) {
          GLctx.uniform2f(webglGetUniformLocation(location2), v0, v1);
        }
        Module2["_emscripten_glUniform2f"] = _emscripten_glUniform2f;
        function _emscripten_glUniform2fv(location2, count, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniform2fv(webglGetUniformLocation(location2), HEAPF32, value >> 2, count * 2);
            return;
          }
          if (count <= 144) {
            var view = miniTempWebGLFloatBuffers[2 * count - 1];
            for (var i2 = 0; i2 < 2 * count; i2 += 2) {
              view[i2] = HEAPF32[value + 4 * i2 >> 2];
              view[i2 + 1] = HEAPF32[value + (4 * i2 + 4) >> 2];
            }
          } else {
            var view = HEAPF32.subarray(value >> 2, value + count * 8 >> 2);
          }
          GLctx.uniform2fv(webglGetUniformLocation(location2), view);
        }
        Module2["_emscripten_glUniform2fv"] = _emscripten_glUniform2fv;
        function _emscripten_glUniform2i(location2, v0, v1) {
          GLctx.uniform2i(webglGetUniformLocation(location2), v0, v1);
        }
        Module2["_emscripten_glUniform2i"] = _emscripten_glUniform2i;
        function _emscripten_glUniform2iv(location2, count, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniform2iv(webglGetUniformLocation(location2), HEAP32, value >> 2, count * 2);
            return;
          }
          if (count <= 144) {
            var view = __miniTempWebGLIntBuffers[2 * count - 1];
            for (var i2 = 0; i2 < 2 * count; i2 += 2) {
              view[i2] = HEAP32[value + 4 * i2 >> 2];
              view[i2 + 1] = HEAP32[value + (4 * i2 + 4) >> 2];
            }
          } else {
            var view = HEAP32.subarray(value >> 2, value + count * 8 >> 2);
          }
          GLctx.uniform2iv(webglGetUniformLocation(location2), view);
        }
        Module2["_emscripten_glUniform2iv"] = _emscripten_glUniform2iv;
        function _emscripten_glUniform2ui(location2, v0, v1) {
          GLctx.uniform2ui(webglGetUniformLocation(location2), v0, v1);
        }
        Module2["_emscripten_glUniform2ui"] = _emscripten_glUniform2ui;
        function _emscripten_glUniform2uiv(location2, count, value) {
          count && GLctx.uniform2uiv(webglGetUniformLocation(location2), HEAPU32, value >> 2, count * 2);
        }
        Module2["_emscripten_glUniform2uiv"] = _emscripten_glUniform2uiv;
        function _emscripten_glUniform3f(location2, v0, v1, v2) {
          GLctx.uniform3f(webglGetUniformLocation(location2), v0, v1, v2);
        }
        Module2["_emscripten_glUniform3f"] = _emscripten_glUniform3f;
        function _emscripten_glUniform3fv(location2, count, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniform3fv(webglGetUniformLocation(location2), HEAPF32, value >> 2, count * 3);
            return;
          }
          if (count <= 96) {
            var view = miniTempWebGLFloatBuffers[3 * count - 1];
            for (var i2 = 0; i2 < 3 * count; i2 += 3) {
              view[i2] = HEAPF32[value + 4 * i2 >> 2];
              view[i2 + 1] = HEAPF32[value + (4 * i2 + 4) >> 2];
              view[i2 + 2] = HEAPF32[value + (4 * i2 + 8) >> 2];
            }
          } else {
            var view = HEAPF32.subarray(value >> 2, value + count * 12 >> 2);
          }
          GLctx.uniform3fv(webglGetUniformLocation(location2), view);
        }
        Module2["_emscripten_glUniform3fv"] = _emscripten_glUniform3fv;
        function _emscripten_glUniform3i(location2, v0, v1, v2) {
          GLctx.uniform3i(webglGetUniformLocation(location2), v0, v1, v2);
        }
        Module2["_emscripten_glUniform3i"] = _emscripten_glUniform3i;
        function _emscripten_glUniform3iv(location2, count, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniform3iv(webglGetUniformLocation(location2), HEAP32, value >> 2, count * 3);
            return;
          }
          if (count <= 96) {
            var view = __miniTempWebGLIntBuffers[3 * count - 1];
            for (var i2 = 0; i2 < 3 * count; i2 += 3) {
              view[i2] = HEAP32[value + 4 * i2 >> 2];
              view[i2 + 1] = HEAP32[value + (4 * i2 + 4) >> 2];
              view[i2 + 2] = HEAP32[value + (4 * i2 + 8) >> 2];
            }
          } else {
            var view = HEAP32.subarray(value >> 2, value + count * 12 >> 2);
          }
          GLctx.uniform3iv(webglGetUniformLocation(location2), view);
        }
        Module2["_emscripten_glUniform3iv"] = _emscripten_glUniform3iv;
        function _emscripten_glUniform3ui(location2, v0, v1, v2) {
          GLctx.uniform3ui(webglGetUniformLocation(location2), v0, v1, v2);
        }
        Module2["_emscripten_glUniform3ui"] = _emscripten_glUniform3ui;
        function _emscripten_glUniform3uiv(location2, count, value) {
          count && GLctx.uniform3uiv(webglGetUniformLocation(location2), HEAPU32, value >> 2, count * 3);
        }
        Module2["_emscripten_glUniform3uiv"] = _emscripten_glUniform3uiv;
        function _emscripten_glUniform4f(location2, v0, v1, v2, v3) {
          GLctx.uniform4f(webglGetUniformLocation(location2), v0, v1, v2, v3);
        }
        Module2["_emscripten_glUniform4f"] = _emscripten_glUniform4f;
        function _emscripten_glUniform4fv(location2, count, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniform4fv(webglGetUniformLocation(location2), HEAPF32, value >> 2, count * 4);
            return;
          }
          if (count <= 72) {
            var view = miniTempWebGLFloatBuffers[4 * count - 1];
            var heap = HEAPF32;
            value >>= 2;
            for (var i2 = 0; i2 < 4 * count; i2 += 4) {
              var dst = value + i2;
              view[i2] = heap[dst];
              view[i2 + 1] = heap[dst + 1];
              view[i2 + 2] = heap[dst + 2];
              view[i2 + 3] = heap[dst + 3];
            }
          } else {
            var view = HEAPF32.subarray(value >> 2, value + count * 16 >> 2);
          }
          GLctx.uniform4fv(webglGetUniformLocation(location2), view);
        }
        Module2["_emscripten_glUniform4fv"] = _emscripten_glUniform4fv;
        function _emscripten_glUniform4i(location2, v0, v1, v2, v3) {
          GLctx.uniform4i(webglGetUniformLocation(location2), v0, v1, v2, v3);
        }
        Module2["_emscripten_glUniform4i"] = _emscripten_glUniform4i;
        function _emscripten_glUniform4iv(location2, count, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniform4iv(webglGetUniformLocation(location2), HEAP32, value >> 2, count * 4);
            return;
          }
          if (count <= 72) {
            var view = __miniTempWebGLIntBuffers[4 * count - 1];
            for (var i2 = 0; i2 < 4 * count; i2 += 4) {
              view[i2] = HEAP32[value + 4 * i2 >> 2];
              view[i2 + 1] = HEAP32[value + (4 * i2 + 4) >> 2];
              view[i2 + 2] = HEAP32[value + (4 * i2 + 8) >> 2];
              view[i2 + 3] = HEAP32[value + (4 * i2 + 12) >> 2];
            }
          } else {
            var view = HEAP32.subarray(value >> 2, value + count * 16 >> 2);
          }
          GLctx.uniform4iv(webglGetUniformLocation(location2), view);
        }
        Module2["_emscripten_glUniform4iv"] = _emscripten_glUniform4iv;
        function _emscripten_glUniform4ui(location2, v0, v1, v2, v3) {
          GLctx.uniform4ui(webglGetUniformLocation(location2), v0, v1, v2, v3);
        }
        Module2["_emscripten_glUniform4ui"] = _emscripten_glUniform4ui;
        function _emscripten_glUniform4uiv(location2, count, value) {
          count && GLctx.uniform4uiv(webglGetUniformLocation(location2), HEAPU32, value >> 2, count * 4);
        }
        Module2["_emscripten_glUniform4uiv"] = _emscripten_glUniform4uiv;
        function _emscripten_glUniformBlockBinding(program, uniformBlockIndex, uniformBlockBinding) {
          program = GL.programs[program];
          GLctx["uniformBlockBinding"](program, uniformBlockIndex, uniformBlockBinding);
        }
        Module2["_emscripten_glUniformBlockBinding"] = _emscripten_glUniformBlockBinding;
        function _emscripten_glUniformMatrix2fv(location2, count, transpose, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniformMatrix2fv(webglGetUniformLocation(location2), !!transpose, HEAPF32, value >> 2, count * 4);
            return;
          }
          if (count <= 72) {
            var view = miniTempWebGLFloatBuffers[4 * count - 1];
            for (var i2 = 0; i2 < 4 * count; i2 += 4) {
              view[i2] = HEAPF32[value + 4 * i2 >> 2];
              view[i2 + 1] = HEAPF32[value + (4 * i2 + 4) >> 2];
              view[i2 + 2] = HEAPF32[value + (4 * i2 + 8) >> 2];
              view[i2 + 3] = HEAPF32[value + (4 * i2 + 12) >> 2];
            }
          } else {
            var view = HEAPF32.subarray(value >> 2, value + count * 16 >> 2);
          }
          GLctx.uniformMatrix2fv(webglGetUniformLocation(location2), !!transpose, view);
        }
        Module2["_emscripten_glUniformMatrix2fv"] = _emscripten_glUniformMatrix2fv;
        function _emscripten_glUniformMatrix2x3fv(location2, count, transpose, value) {
          count && GLctx.uniformMatrix2x3fv(webglGetUniformLocation(location2), !!transpose, HEAPF32, value >> 2, count * 6);
        }
        Module2["_emscripten_glUniformMatrix2x3fv"] = _emscripten_glUniformMatrix2x3fv;
        function _emscripten_glUniformMatrix2x4fv(location2, count, transpose, value) {
          count && GLctx.uniformMatrix2x4fv(webglGetUniformLocation(location2), !!transpose, HEAPF32, value >> 2, count * 8);
        }
        Module2["_emscripten_glUniformMatrix2x4fv"] = _emscripten_glUniformMatrix2x4fv;
        function _emscripten_glUniformMatrix3fv(location2, count, transpose, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniformMatrix3fv(webglGetUniformLocation(location2), !!transpose, HEAPF32, value >> 2, count * 9);
            return;
          }
          if (count <= 32) {
            var view = miniTempWebGLFloatBuffers[9 * count - 1];
            for (var i2 = 0; i2 < 9 * count; i2 += 9) {
              view[i2] = HEAPF32[value + 4 * i2 >> 2];
              view[i2 + 1] = HEAPF32[value + (4 * i2 + 4) >> 2];
              view[i2 + 2] = HEAPF32[value + (4 * i2 + 8) >> 2];
              view[i2 + 3] = HEAPF32[value + (4 * i2 + 12) >> 2];
              view[i2 + 4] = HEAPF32[value + (4 * i2 + 16) >> 2];
              view[i2 + 5] = HEAPF32[value + (4 * i2 + 20) >> 2];
              view[i2 + 6] = HEAPF32[value + (4 * i2 + 24) >> 2];
              view[i2 + 7] = HEAPF32[value + (4 * i2 + 28) >> 2];
              view[i2 + 8] = HEAPF32[value + (4 * i2 + 32) >> 2];
            }
          } else {
            var view = HEAPF32.subarray(value >> 2, value + count * 36 >> 2);
          }
          GLctx.uniformMatrix3fv(webglGetUniformLocation(location2), !!transpose, view);
        }
        Module2["_emscripten_glUniformMatrix3fv"] = _emscripten_glUniformMatrix3fv;
        function _emscripten_glUniformMatrix3x2fv(location2, count, transpose, value) {
          count && GLctx.uniformMatrix3x2fv(webglGetUniformLocation(location2), !!transpose, HEAPF32, value >> 2, count * 6);
        }
        Module2["_emscripten_glUniformMatrix3x2fv"] = _emscripten_glUniformMatrix3x2fv;
        function _emscripten_glUniformMatrix3x4fv(location2, count, transpose, value) {
          count && GLctx.uniformMatrix3x4fv(webglGetUniformLocation(location2), !!transpose, HEAPF32, value >> 2, count * 12);
        }
        Module2["_emscripten_glUniformMatrix3x4fv"] = _emscripten_glUniformMatrix3x4fv;
        function _emscripten_glUniformMatrix4fv(location2, count, transpose, value) {
          if (GL.currentContext.version >= 2) {
            count && GLctx.uniformMatrix4fv(webglGetUniformLocation(location2), !!transpose, HEAPF32, value >> 2, count * 16);
            return;
          }
          if (count <= 18) {
            var view = miniTempWebGLFloatBuffers[16 * count - 1];
            var heap = HEAPF32;
            value >>= 2;
            for (var i2 = 0; i2 < 16 * count; i2 += 16) {
              var dst = value + i2;
              view[i2] = heap[dst];
              view[i2 + 1] = heap[dst + 1];
              view[i2 + 2] = heap[dst + 2];
              view[i2 + 3] = heap[dst + 3];
              view[i2 + 4] = heap[dst + 4];
              view[i2 + 5] = heap[dst + 5];
              view[i2 + 6] = heap[dst + 6];
              view[i2 + 7] = heap[dst + 7];
              view[i2 + 8] = heap[dst + 8];
              view[i2 + 9] = heap[dst + 9];
              view[i2 + 10] = heap[dst + 10];
              view[i2 + 11] = heap[dst + 11];
              view[i2 + 12] = heap[dst + 12];
              view[i2 + 13] = heap[dst + 13];
              view[i2 + 14] = heap[dst + 14];
              view[i2 + 15] = heap[dst + 15];
            }
          } else {
            var view = HEAPF32.subarray(value >> 2, value + count * 64 >> 2);
          }
          GLctx.uniformMatrix4fv(webglGetUniformLocation(location2), !!transpose, view);
        }
        Module2["_emscripten_glUniformMatrix4fv"] = _emscripten_glUniformMatrix4fv;
        function _emscripten_glUniformMatrix4x2fv(location2, count, transpose, value) {
          count && GLctx.uniformMatrix4x2fv(webglGetUniformLocation(location2), !!transpose, HEAPF32, value >> 2, count * 8);
        }
        Module2["_emscripten_glUniformMatrix4x2fv"] = _emscripten_glUniformMatrix4x2fv;
        function _emscripten_glUniformMatrix4x3fv(location2, count, transpose, value) {
          count && GLctx.uniformMatrix4x3fv(webglGetUniformLocation(location2), !!transpose, HEAPF32, value >> 2, count * 12);
        }
        Module2["_emscripten_glUniformMatrix4x3fv"] = _emscripten_glUniformMatrix4x3fv;
        function _emscripten_glUnmapBuffer(target) {
          if (!emscriptenWebGLValidateMapBufferTarget(target)) {
            GL.recordError(1280);
            err("GL_INVALID_ENUM in glUnmapBuffer");
            return 0;
          }
          var buffer2 = emscriptenWebGLGetBufferBinding(target);
          var mapping = GL.mappedBuffers[buffer2];
          if (!mapping) {
            GL.recordError(1282);
            err("buffer was never mapped in glUnmapBuffer");
            return 0;
          }
          GL.mappedBuffers[buffer2] = null;
          if (!(mapping.access & 16)) if (GL.currentContext.version >= 2) {
            GLctx.bufferSubData(target, mapping.offset, HEAPU8, mapping.mem, mapping.length);
          } else {
            GLctx.bufferSubData(target, mapping.offset, HEAPU8.subarray(mapping.mem, mapping.mem + mapping.length));
          }
          _free(mapping.mem);
          return 1;
        }
        Module2["_emscripten_glUnmapBuffer"] = _emscripten_glUnmapBuffer;
        function _emscripten_glUseProgram(program) {
          program = GL.programs[program];
          GLctx.useProgram(program);
          GLctx.currentProgram = program;
        }
        Module2["_emscripten_glUseProgram"] = _emscripten_glUseProgram;
        function _emscripten_glValidateProgram(program) {
          GLctx.validateProgram(GL.programs[program]);
        }
        Module2["_emscripten_glValidateProgram"] = _emscripten_glValidateProgram;
        function _emscripten_glVertexAttrib1f(x0, x1) {
          GLctx["vertexAttrib1f"](x0, x1);
        }
        Module2["_emscripten_glVertexAttrib1f"] = _emscripten_glVertexAttrib1f;
        function _emscripten_glVertexAttrib1fv(index, v) {
          GLctx.vertexAttrib1f(index, HEAPF32[v >> 2]);
        }
        Module2["_emscripten_glVertexAttrib1fv"] = _emscripten_glVertexAttrib1fv;
        function _emscripten_glVertexAttrib2f(x0, x1, x2) {
          GLctx["vertexAttrib2f"](x0, x1, x2);
        }
        Module2["_emscripten_glVertexAttrib2f"] = _emscripten_glVertexAttrib2f;
        function _emscripten_glVertexAttrib2fv(index, v) {
          GLctx.vertexAttrib2f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2]);
        }
        Module2["_emscripten_glVertexAttrib2fv"] = _emscripten_glVertexAttrib2fv;
        function _emscripten_glVertexAttrib3f(x0, x1, x2, x3) {
          GLctx["vertexAttrib3f"](x0, x1, x2, x3);
        }
        Module2["_emscripten_glVertexAttrib3f"] = _emscripten_glVertexAttrib3f;
        function _emscripten_glVertexAttrib3fv(index, v) {
          GLctx.vertexAttrib3f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2]);
        }
        Module2["_emscripten_glVertexAttrib3fv"] = _emscripten_glVertexAttrib3fv;
        function _emscripten_glVertexAttrib4f(x0, x1, x2, x3, x4) {
          GLctx["vertexAttrib4f"](x0, x1, x2, x3, x4);
        }
        Module2["_emscripten_glVertexAttrib4f"] = _emscripten_glVertexAttrib4f;
        function _emscripten_glVertexAttrib4fv(index, v) {
          GLctx.vertexAttrib4f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2], HEAPF32[v + 12 >> 2]);
        }
        Module2["_emscripten_glVertexAttrib4fv"] = _emscripten_glVertexAttrib4fv;
        function _emscripten_glVertexAttribDivisor(index, divisor) {
          GLctx["vertexAttribDivisor"](index, divisor);
        }
        Module2["_emscripten_glVertexAttribDivisor"] = _emscripten_glVertexAttribDivisor;
        function _emscripten_glVertexAttribDivisorANGLE(index, divisor) {
          GLctx["vertexAttribDivisor"](index, divisor);
        }
        Module2["_emscripten_glVertexAttribDivisorANGLE"] = _emscripten_glVertexAttribDivisorANGLE;
        function _emscripten_glVertexAttribDivisorARB(index, divisor) {
          GLctx["vertexAttribDivisor"](index, divisor);
        }
        Module2["_emscripten_glVertexAttribDivisorARB"] = _emscripten_glVertexAttribDivisorARB;
        function _emscripten_glVertexAttribDivisorEXT(index, divisor) {
          GLctx["vertexAttribDivisor"](index, divisor);
        }
        Module2["_emscripten_glVertexAttribDivisorEXT"] = _emscripten_glVertexAttribDivisorEXT;
        function _emscripten_glVertexAttribDivisorNV(index, divisor) {
          GLctx["vertexAttribDivisor"](index, divisor);
        }
        Module2["_emscripten_glVertexAttribDivisorNV"] = _emscripten_glVertexAttribDivisorNV;
        function _emscripten_glVertexAttribI4i(x0, x1, x2, x3, x4) {
          GLctx["vertexAttribI4i"](x0, x1, x2, x3, x4);
        }
        Module2["_emscripten_glVertexAttribI4i"] = _emscripten_glVertexAttribI4i;
        function _emscripten_glVertexAttribI4iv(index, v) {
          GLctx.vertexAttribI4i(index, HEAP32[v >> 2], HEAP32[v + 4 >> 2], HEAP32[v + 8 >> 2], HEAP32[v + 12 >> 2]);
        }
        Module2["_emscripten_glVertexAttribI4iv"] = _emscripten_glVertexAttribI4iv;
        function _emscripten_glVertexAttribI4ui(x0, x1, x2, x3, x4) {
          GLctx["vertexAttribI4ui"](x0, x1, x2, x3, x4);
        }
        Module2["_emscripten_glVertexAttribI4ui"] = _emscripten_glVertexAttribI4ui;
        function _emscripten_glVertexAttribI4uiv(index, v) {
          GLctx.vertexAttribI4ui(index, HEAPU32[v >> 2], HEAPU32[v + 4 >> 2], HEAPU32[v + 8 >> 2], HEAPU32[v + 12 >> 2]);
        }
        Module2["_emscripten_glVertexAttribI4uiv"] = _emscripten_glVertexAttribI4uiv;
        function _emscripten_glVertexAttribIPointer(index, size, type, stride, ptr) {
          var cb = GL.currentContext.clientBuffers[index];
          if (!GLctx.currentArrayBufferBinding) {
            cb.size = size;
            cb.type = type;
            cb.normalized = false;
            cb.stride = stride;
            cb.ptr = ptr;
            cb.clientside = true;
            cb.vertexAttribPointerAdaptor = function(index2, size2, type2, normalized, stride2, ptr2) {
              this.vertexAttribIPointer(index2, size2, type2, stride2, ptr2);
            };
            return;
          }
          cb.clientside = false;
          GLctx["vertexAttribIPointer"](index, size, type, stride, ptr);
        }
        Module2["_emscripten_glVertexAttribIPointer"] = _emscripten_glVertexAttribIPointer;
        function _emscripten_glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
          var cb = GL.currentContext.clientBuffers[index];
          if (!GLctx.currentArrayBufferBinding) {
            cb.size = size;
            cb.type = type;
            cb.normalized = normalized;
            cb.stride = stride;
            cb.ptr = ptr;
            cb.clientside = true;
            cb.vertexAttribPointerAdaptor = function(index2, size2, type2, normalized2, stride2, ptr2) {
              this.vertexAttribPointer(index2, size2, type2, normalized2, stride2, ptr2);
            };
            return;
          }
          cb.clientside = false;
          GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
        }
        Module2["_emscripten_glVertexAttribPointer"] = _emscripten_glVertexAttribPointer;
        function _emscripten_glViewport(x0, x1, x2, x3) {
          GLctx["viewport"](x0, x1, x2, x3);
        }
        Module2["_emscripten_glViewport"] = _emscripten_glViewport;
        function _emscripten_glWaitSync(sync, flags, timeoutLo, timeoutHi) {
          GLctx.waitSync(GL.syncs[sync], flags, convertI32PairToI53(timeoutLo, timeoutHi));
        }
        Module2["_emscripten_glWaitSync"] = _emscripten_glWaitSync;
        function _emscripten_has_asyncify() {
          return 1;
        }
        Module2["_emscripten_has_asyncify"] = _emscripten_has_asyncify;
        function _emscripten_memcpy_big(dest, src, num) {
          HEAPU8.copyWithin(dest, src, src + num);
        }
        Module2["_emscripten_memcpy_big"] = _emscripten_memcpy_big;
        function doRequestFullscreen(target, strategy) {
          if (!JSEvents.fullscreenEnabled()) return -1;
          target = findEventTarget(target);
          if (!target) return -4;
          if (!target.requestFullscreen && !target.webkitRequestFullscreen) {
            return -3;
          }
          var canPerformRequests = JSEvents.canPerformEventHandlerRequests();
          if (!canPerformRequests) {
            if (strategy.deferUntilInEventHandler) {
              JSEvents.deferCall(JSEvents_requestFullscreen, 1, [target, strategy]);
              return 1;
            }
            return -2;
          }
          return JSEvents_requestFullscreen(target, strategy);
        }
        Module2["doRequestFullscreen"] = doRequestFullscreen;
        function _emscripten_request_fullscreen_strategy(target, deferUntilInEventHandler, fullscreenStrategy) {
          var strategy = { scaleMode: HEAP32[fullscreenStrategy >> 2], canvasResolutionScaleMode: HEAP32[fullscreenStrategy + 4 >> 2], filteringMode: HEAP32[fullscreenStrategy + 8 >> 2], deferUntilInEventHandler, canvasResizedCallback: HEAP32[fullscreenStrategy + 12 >> 2], canvasResizedCallbackUserData: HEAP32[fullscreenStrategy + 16 >> 2] };
          return doRequestFullscreen(target, strategy);
        }
        Module2["_emscripten_request_fullscreen_strategy"] = _emscripten_request_fullscreen_strategy;
        function _emscripten_request_pointerlock(target, deferUntilInEventHandler) {
          target = findEventTarget(target);
          if (!target) return -4;
          if (!target.requestPointerLock && !target.msRequestPointerLock) {
            return -1;
          }
          var canPerformRequests = JSEvents.canPerformEventHandlerRequests();
          if (!canPerformRequests) {
            if (deferUntilInEventHandler) {
              JSEvents.deferCall(requestPointerLock, 2, [target]);
              return 1;
            }
            return -2;
          }
          return requestPointerLock(target);
        }
        Module2["_emscripten_request_pointerlock"] = _emscripten_request_pointerlock;
        function getHeapMax() {
          return 2147483648;
        }
        Module2["getHeapMax"] = getHeapMax;
        function emscripten_realloc_buffer(size) {
          try {
            wasmMemory.grow(size - buffer.byteLength + 65535 >>> 16);
            updateGlobalBufferAndViews(wasmMemory.buffer);
            return 1;
          } catch (e) {
          }
        }
        Module2["emscripten_realloc_buffer"] = emscripten_realloc_buffer;
        function _emscripten_resize_heap(requestedSize) {
          var oldSize = HEAPU8.length;
          requestedSize = requestedSize >>> 0;
          var maxHeapSize = getHeapMax();
          if (requestedSize > maxHeapSize) {
            return false;
          }
          let alignUp = (x, multiple) => x + (multiple - x % multiple) % multiple;
          for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
            var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
            overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
            var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
            var replacement = emscripten_realloc_buffer(newSize);
            if (replacement) {
              return true;
            }
          }
          return false;
        }
        Module2["_emscripten_resize_heap"] = _emscripten_resize_heap;
        function _emscripten_sample_gamepad_data() {
          return (JSEvents.lastGamepadState = navigator.getGamepads ? navigator.getGamepads() : navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : null) ? 0 : -1;
        }
        Module2["_emscripten_sample_gamepad_data"] = _emscripten_sample_gamepad_data;
        function registerBeforeUnloadEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
          var beforeUnloadEventHandlerFunc = function(ev) {
            var e = ev || event;
            var confirmationMessage = function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, 0, userData);
            if (confirmationMessage) {
              confirmationMessage = UTF8ToString(confirmationMessage);
            }
            if (confirmationMessage) {
              e.preventDefault();
              e.returnValue = confirmationMessage;
              return confirmationMessage;
            }
          };
          var eventHandler = { target: findEventTarget(target), eventTypeString, callbackfunc, handlerFunc: beforeUnloadEventHandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerBeforeUnloadEventCallback"] = registerBeforeUnloadEventCallback;
        function _emscripten_set_beforeunload_callback_on_thread(userData, callbackfunc, targetThread) {
          if (typeof onbeforeunload == "undefined") return -1;
          if (targetThread !== 1) return -5;
          registerBeforeUnloadEventCallback(2, userData, true, callbackfunc, 28, "beforeunload");
          return 0;
        }
        Module2["_emscripten_set_beforeunload_callback_on_thread"] = _emscripten_set_beforeunload_callback_on_thread;
        function registerFocusEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
          if (!JSEvents.focusEvent) JSEvents.focusEvent = _malloc(256);
          var focusEventHandlerFunc = function(ev) {
            var e = ev || event;
            var nodeName = JSEvents.getNodeNameForTarget(e.target);
            var id = e.target.id ? e.target.id : "";
            var focusEvent = JSEvents.focusEvent;
            stringToUTF8(nodeName, focusEvent + 0, 128);
            stringToUTF8(id, focusEvent + 128, 128);
            if (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, focusEvent, userData)) e.preventDefault();
          };
          var eventHandler = { target: findEventTarget(target), eventTypeString, callbackfunc, handlerFunc: focusEventHandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerFocusEventCallback"] = registerFocusEventCallback;
        function _emscripten_set_blur_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerFocusEventCallback(target, userData, useCapture, callbackfunc, 12, "blur", targetThread);
          return 0;
        }
        Module2["_emscripten_set_blur_callback_on_thread"] = _emscripten_set_blur_callback_on_thread;
        function _emscripten_set_element_css_size(target, width, height) {
          target = findEventTarget(target);
          if (!target) return -4;
          target.style.width = width + "px";
          target.style.height = height + "px";
          return 0;
        }
        Module2["_emscripten_set_element_css_size"] = _emscripten_set_element_css_size;
        function _emscripten_set_focus_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerFocusEventCallback(target, userData, useCapture, callbackfunc, 13, "focus", targetThread);
          return 0;
        }
        Module2["_emscripten_set_focus_callback_on_thread"] = _emscripten_set_focus_callback_on_thread;
        function fillFullscreenChangeEventData(eventStruct) {
          var fullscreenElement = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
          var isFullscreen = !!fullscreenElement;
          HEAP32[eventStruct >> 2] = isFullscreen;
          HEAP32[eventStruct + 4 >> 2] = JSEvents.fullscreenEnabled();
          var reportedElement = isFullscreen ? fullscreenElement : JSEvents.previousFullscreenElement;
          var nodeName = JSEvents.getNodeNameForTarget(reportedElement);
          var id = reportedElement && reportedElement.id ? reportedElement.id : "";
          stringToUTF8(nodeName, eventStruct + 8, 128);
          stringToUTF8(id, eventStruct + 136, 128);
          HEAP32[eventStruct + 264 >> 2] = reportedElement ? reportedElement.clientWidth : 0;
          HEAP32[eventStruct + 268 >> 2] = reportedElement ? reportedElement.clientHeight : 0;
          HEAP32[eventStruct + 272 >> 2] = screen.width;
          HEAP32[eventStruct + 276 >> 2] = screen.height;
          if (isFullscreen) {
            JSEvents.previousFullscreenElement = fullscreenElement;
          }
        }
        Module2["fillFullscreenChangeEventData"] = fillFullscreenChangeEventData;
        function registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
          if (!JSEvents.fullscreenChangeEvent) JSEvents.fullscreenChangeEvent = _malloc(280);
          var fullscreenChangeEventhandlerFunc = function(ev) {
            var e = ev || event;
            var fullscreenChangeEvent = JSEvents.fullscreenChangeEvent;
            fillFullscreenChangeEventData(fullscreenChangeEvent);
            if (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, fullscreenChangeEvent, userData)) e.preventDefault();
          };
          var eventHandler = { target, eventTypeString, callbackfunc, handlerFunc: fullscreenChangeEventhandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerFullscreenChangeEventCallback"] = registerFullscreenChangeEventCallback;
        function _emscripten_set_fullscreenchange_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          if (!JSEvents.fullscreenEnabled()) return -1;
          target = findEventTarget(target);
          if (!target) return -4;
          registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "fullscreenchange", targetThread);
          registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "webkitfullscreenchange", targetThread);
          return 0;
        }
        Module2["_emscripten_set_fullscreenchange_callback_on_thread"] = _emscripten_set_fullscreenchange_callback_on_thread;
        function registerGamepadEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
          if (!JSEvents.gamepadEvent) JSEvents.gamepadEvent = _malloc(1432);
          var gamepadEventHandlerFunc = function(ev) {
            var e = ev || event;
            var gamepadEvent = JSEvents.gamepadEvent;
            fillGamepadEventData(gamepadEvent, e["gamepad"]);
            if (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, gamepadEvent, userData)) e.preventDefault();
          };
          var eventHandler = { target: findEventTarget(target), allowsDeferredCalls: true, eventTypeString, callbackfunc, handlerFunc: gamepadEventHandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerGamepadEventCallback"] = registerGamepadEventCallback;
        function _emscripten_set_gamepadconnected_callback_on_thread(userData, useCapture, callbackfunc, targetThread) {
          if (!navigator.getGamepads && !navigator.webkitGetGamepads) return -1;
          registerGamepadEventCallback(2, userData, useCapture, callbackfunc, 26, "gamepadconnected", targetThread);
          return 0;
        }
        Module2["_emscripten_set_gamepadconnected_callback_on_thread"] = _emscripten_set_gamepadconnected_callback_on_thread;
        function _emscripten_set_gamepaddisconnected_callback_on_thread(userData, useCapture, callbackfunc, targetThread) {
          if (!navigator.getGamepads && !navigator.webkitGetGamepads) return -1;
          registerGamepadEventCallback(2, userData, useCapture, callbackfunc, 27, "gamepaddisconnected", targetThread);
          return 0;
        }
        Module2["_emscripten_set_gamepaddisconnected_callback_on_thread"] = _emscripten_set_gamepaddisconnected_callback_on_thread;
        function registerKeyEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
          if (!JSEvents.keyEvent) JSEvents.keyEvent = _malloc(176);
          var keyEventHandlerFunc = function(e) {
            var keyEventData = JSEvents.keyEvent;
            HEAPF64[keyEventData >> 3] = e.timeStamp;
            var idx = keyEventData >> 2;
            HEAP32[idx + 2] = e.location;
            HEAP32[idx + 3] = e.ctrlKey;
            HEAP32[idx + 4] = e.shiftKey;
            HEAP32[idx + 5] = e.altKey;
            HEAP32[idx + 6] = e.metaKey;
            HEAP32[idx + 7] = e.repeat;
            HEAP32[idx + 8] = e.charCode;
            HEAP32[idx + 9] = e.keyCode;
            HEAP32[idx + 10] = e.which;
            stringToUTF8(e.key || "", keyEventData + 44, 32);
            stringToUTF8(e.code || "", keyEventData + 76, 32);
            stringToUTF8(e.char || "", keyEventData + 108, 32);
            stringToUTF8(e.locale || "", keyEventData + 140, 32);
            if (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, keyEventData, userData)) e.preventDefault();
          };
          var eventHandler = { target: findEventTarget(target), allowsDeferredCalls: true, eventTypeString, callbackfunc, handlerFunc: keyEventHandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerKeyEventCallback"] = registerKeyEventCallback;
        function _emscripten_set_keydown_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerKeyEventCallback(target, userData, useCapture, callbackfunc, 2, "keydown", targetThread);
          return 0;
        }
        Module2["_emscripten_set_keydown_callback_on_thread"] = _emscripten_set_keydown_callback_on_thread;
        function _emscripten_set_keypress_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerKeyEventCallback(target, userData, useCapture, callbackfunc, 1, "keypress", targetThread);
          return 0;
        }
        Module2["_emscripten_set_keypress_callback_on_thread"] = _emscripten_set_keypress_callback_on_thread;
        function _emscripten_set_keyup_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerKeyEventCallback(target, userData, useCapture, callbackfunc, 3, "keyup", targetThread);
          return 0;
        }
        Module2["_emscripten_set_keyup_callback_on_thread"] = _emscripten_set_keyup_callback_on_thread;
        function _emscripten_set_main_loop_arg(func, arg, fps, simulateInfiniteLoop) {
          var browserIterationFunc = () => function(a1) {
            dynCall_vi.apply(null, [func, a1]);
          }(arg);
          setMainLoop(browserIterationFunc, fps, simulateInfiniteLoop, arg);
        }
        Module2["_emscripten_set_main_loop_arg"] = _emscripten_set_main_loop_arg;
        function fillMouseEventData(eventStruct, e, target) {
          HEAPF64[eventStruct >> 3] = e.timeStamp;
          var idx = eventStruct >> 2;
          HEAP32[idx + 2] = e.screenX;
          HEAP32[idx + 3] = e.screenY;
          HEAP32[idx + 4] = e.clientX;
          HEAP32[idx + 5] = e.clientY;
          HEAP32[idx + 6] = e.ctrlKey;
          HEAP32[idx + 7] = e.shiftKey;
          HEAP32[idx + 8] = e.altKey;
          HEAP32[idx + 9] = e.metaKey;
          HEAP16[idx * 2 + 20] = e.button;
          HEAP16[idx * 2 + 21] = e.buttons;
          HEAP32[idx + 11] = e["movementX"];
          HEAP32[idx + 12] = e["movementY"];
          var rect = getBoundingClientRect(target);
          HEAP32[idx + 13] = e.clientX - rect.left;
          HEAP32[idx + 14] = e.clientY - rect.top;
        }
        Module2["fillMouseEventData"] = fillMouseEventData;
        function registerMouseEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
          if (!JSEvents.mouseEvent) JSEvents.mouseEvent = _malloc(72);
          target = findEventTarget(target);
          var mouseEventHandlerFunc = function(ev) {
            var e = ev || event;
            fillMouseEventData(JSEvents.mouseEvent, e, target);
            if (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, JSEvents.mouseEvent, userData)) e.preventDefault();
          };
          var eventHandler = { target, allowsDeferredCalls: eventTypeString != "mousemove" && eventTypeString != "mouseenter" && eventTypeString != "mouseleave", eventTypeString, callbackfunc, handlerFunc: mouseEventHandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerMouseEventCallback"] = registerMouseEventCallback;
        function _emscripten_set_mousedown_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerMouseEventCallback(target, userData, useCapture, callbackfunc, 5, "mousedown", targetThread);
          return 0;
        }
        Module2["_emscripten_set_mousedown_callback_on_thread"] = _emscripten_set_mousedown_callback_on_thread;
        function _emscripten_set_mouseenter_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerMouseEventCallback(target, userData, useCapture, callbackfunc, 33, "mouseenter", targetThread);
          return 0;
        }
        Module2["_emscripten_set_mouseenter_callback_on_thread"] = _emscripten_set_mouseenter_callback_on_thread;
        function _emscripten_set_mouseleave_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerMouseEventCallback(target, userData, useCapture, callbackfunc, 34, "mouseleave", targetThread);
          return 0;
        }
        Module2["_emscripten_set_mouseleave_callback_on_thread"] = _emscripten_set_mouseleave_callback_on_thread;
        function _emscripten_set_mousemove_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerMouseEventCallback(target, userData, useCapture, callbackfunc, 8, "mousemove", targetThread);
          return 0;
        }
        Module2["_emscripten_set_mousemove_callback_on_thread"] = _emscripten_set_mousemove_callback_on_thread;
        function _emscripten_set_mouseup_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerMouseEventCallback(target, userData, useCapture, callbackfunc, 6, "mouseup", targetThread);
          return 0;
        }
        Module2["_emscripten_set_mouseup_callback_on_thread"] = _emscripten_set_mouseup_callback_on_thread;
        function fillPointerlockChangeEventData(eventStruct) {
          var pointerLockElement = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || document.msPointerLockElement;
          var isPointerlocked = !!pointerLockElement;
          HEAP32[eventStruct >> 2] = isPointerlocked;
          var nodeName = JSEvents.getNodeNameForTarget(pointerLockElement);
          var id = pointerLockElement && pointerLockElement.id ? pointerLockElement.id : "";
          stringToUTF8(nodeName, eventStruct + 4, 128);
          stringToUTF8(id, eventStruct + 132, 128);
        }
        Module2["fillPointerlockChangeEventData"] = fillPointerlockChangeEventData;
        function registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
          if (!JSEvents.pointerlockChangeEvent) JSEvents.pointerlockChangeEvent = _malloc(260);
          var pointerlockChangeEventHandlerFunc = function(ev) {
            var e = ev || event;
            var pointerlockChangeEvent = JSEvents.pointerlockChangeEvent;
            fillPointerlockChangeEventData(pointerlockChangeEvent);
            if (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, pointerlockChangeEvent, userData)) e.preventDefault();
          };
          var eventHandler = { target, eventTypeString, callbackfunc, handlerFunc: pointerlockChangeEventHandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerPointerlockChangeEventCallback"] = registerPointerlockChangeEventCallback;
        function _emscripten_set_pointerlockchange_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          if (!document || !document.body || !document.body.requestPointerLock && !document.body.mozRequestPointerLock && !document.body.webkitRequestPointerLock && !document.body.msRequestPointerLock) {
            return -1;
          }
          target = findEventTarget(target);
          if (!target) return -4;
          registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "pointerlockchange", targetThread);
          registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "mozpointerlockchange", targetThread);
          registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "webkitpointerlockchange", targetThread);
          registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "mspointerlockchange", targetThread);
          return 0;
        }
        Module2["_emscripten_set_pointerlockchange_callback_on_thread"] = _emscripten_set_pointerlockchange_callback_on_thread;
        function registerUiEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
          if (!JSEvents.uiEvent) JSEvents.uiEvent = _malloc(36);
          target = findEventTarget(target);
          var uiEventHandlerFunc = function(ev) {
            var e = ev || event;
            if (e.target != target) {
              return;
            }
            var b = document.body;
            if (!b) {
              return;
            }
            var uiEvent = JSEvents.uiEvent;
            HEAP32[uiEvent >> 2] = e.detail;
            HEAP32[uiEvent + 4 >> 2] = b.clientWidth;
            HEAP32[uiEvent + 8 >> 2] = b.clientHeight;
            HEAP32[uiEvent + 12 >> 2] = innerWidth;
            HEAP32[uiEvent + 16 >> 2] = innerHeight;
            HEAP32[uiEvent + 20 >> 2] = outerWidth;
            HEAP32[uiEvent + 24 >> 2] = outerHeight;
            HEAP32[uiEvent + 28 >> 2] = pageXOffset;
            HEAP32[uiEvent + 32 >> 2] = pageYOffset;
            if (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, uiEvent, userData)) e.preventDefault();
          };
          var eventHandler = { target, eventTypeString, callbackfunc, handlerFunc: uiEventHandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerUiEventCallback"] = registerUiEventCallback;
        function _emscripten_set_resize_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerUiEventCallback(target, userData, useCapture, callbackfunc, 10, "resize", targetThread);
          return 0;
        }
        Module2["_emscripten_set_resize_callback_on_thread"] = _emscripten_set_resize_callback_on_thread;
        function registerTouchEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
          if (!JSEvents.touchEvent) JSEvents.touchEvent = _malloc(1696);
          target = findEventTarget(target);
          var touchEventHandlerFunc = function(e) {
            var t, touches = {}, et = e.touches;
            for (var i2 = 0; i2 < et.length; ++i2) {
              t = et[i2];
              t.isChanged = t.onTarget = 0;
              touches[t.identifier] = t;
            }
            for (var i2 = 0; i2 < e.changedTouches.length; ++i2) {
              t = e.changedTouches[i2];
              t.isChanged = 1;
              touches[t.identifier] = t;
            }
            for (var i2 = 0; i2 < e.targetTouches.length; ++i2) {
              touches[e.targetTouches[i2].identifier].onTarget = 1;
            }
            var touchEvent = JSEvents.touchEvent;
            HEAPF64[touchEvent >> 3] = e.timeStamp;
            var idx = touchEvent >> 2;
            HEAP32[idx + 3] = e.ctrlKey;
            HEAP32[idx + 4] = e.shiftKey;
            HEAP32[idx + 5] = e.altKey;
            HEAP32[idx + 6] = e.metaKey;
            idx += 7;
            var targetRect = getBoundingClientRect(target);
            var numTouches = 0;
            for (var i2 in touches) {
              t = touches[i2];
              HEAP32[idx + 0] = t.identifier;
              HEAP32[idx + 1] = t.screenX;
              HEAP32[idx + 2] = t.screenY;
              HEAP32[idx + 3] = t.clientX;
              HEAP32[idx + 4] = t.clientY;
              HEAP32[idx + 5] = t.pageX;
              HEAP32[idx + 6] = t.pageY;
              HEAP32[idx + 7] = t.isChanged;
              HEAP32[idx + 8] = t.onTarget;
              HEAP32[idx + 9] = t.clientX - targetRect.left;
              HEAP32[idx + 10] = t.clientY - targetRect.top;
              idx += 13;
              if (++numTouches > 31) {
                break;
              }
            }
            HEAP32[touchEvent + 8 >> 2] = numTouches;
            if (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, touchEvent, userData)) e.preventDefault();
          };
          var eventHandler = { target, allowsDeferredCalls: eventTypeString == "touchstart" || eventTypeString == "touchend", eventTypeString, callbackfunc, handlerFunc: touchEventHandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerTouchEventCallback"] = registerTouchEventCallback;
        function _emscripten_set_touchcancel_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerTouchEventCallback(target, userData, useCapture, callbackfunc, 25, "touchcancel", targetThread);
          return 0;
        }
        Module2["_emscripten_set_touchcancel_callback_on_thread"] = _emscripten_set_touchcancel_callback_on_thread;
        function _emscripten_set_touchend_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerTouchEventCallback(target, userData, useCapture, callbackfunc, 23, "touchend", targetThread);
          return 0;
        }
        Module2["_emscripten_set_touchend_callback_on_thread"] = _emscripten_set_touchend_callback_on_thread;
        function _emscripten_set_touchmove_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerTouchEventCallback(target, userData, useCapture, callbackfunc, 24, "touchmove", targetThread);
          return 0;
        }
        Module2["_emscripten_set_touchmove_callback_on_thread"] = _emscripten_set_touchmove_callback_on_thread;
        function _emscripten_set_touchstart_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          registerTouchEventCallback(target, userData, useCapture, callbackfunc, 22, "touchstart", targetThread);
          return 0;
        }
        Module2["_emscripten_set_touchstart_callback_on_thread"] = _emscripten_set_touchstart_callback_on_thread;
        function fillVisibilityChangeEventData(eventStruct) {
          var visibilityStates = ["hidden", "visible", "prerender", "unloaded"];
          var visibilityState = visibilityStates.indexOf(document.visibilityState);
          HEAP32[eventStruct >> 2] = document.hidden;
          HEAP32[eventStruct + 4 >> 2] = visibilityState;
        }
        Module2["fillVisibilityChangeEventData"] = fillVisibilityChangeEventData;
        function registerVisibilityChangeEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
          if (!JSEvents.visibilityChangeEvent) JSEvents.visibilityChangeEvent = _malloc(8);
          var visibilityChangeEventHandlerFunc = function(ev) {
            var e = ev || event;
            var visibilityChangeEvent = JSEvents.visibilityChangeEvent;
            fillVisibilityChangeEventData(visibilityChangeEvent);
            if (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, visibilityChangeEvent, userData)) e.preventDefault();
          };
          var eventHandler = { target, eventTypeString, callbackfunc, handlerFunc: visibilityChangeEventHandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerVisibilityChangeEventCallback"] = registerVisibilityChangeEventCallback;
        function _emscripten_set_visibilitychange_callback_on_thread(userData, useCapture, callbackfunc, targetThread) {
          if (!specialHTMLTargets[1]) {
            return -4;
          }
          registerVisibilityChangeEventCallback(specialHTMLTargets[1], userData, useCapture, callbackfunc, 21, "visibilitychange", targetThread);
          return 0;
        }
        Module2["_emscripten_set_visibilitychange_callback_on_thread"] = _emscripten_set_visibilitychange_callback_on_thread;
        function registerWheelEventCallback(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) {
          if (!JSEvents.wheelEvent) JSEvents.wheelEvent = _malloc(104);
          var wheelHandlerFunc = function(ev) {
            var e = ev || event;
            var wheelEvent = JSEvents.wheelEvent;
            fillMouseEventData(wheelEvent, e, target);
            HEAPF64[wheelEvent + 72 >> 3] = e["deltaX"];
            HEAPF64[wheelEvent + 80 >> 3] = e["deltaY"];
            HEAPF64[wheelEvent + 88 >> 3] = e["deltaZ"];
            HEAP32[wheelEvent + 96 >> 2] = e["deltaMode"];
            if (function(a1, a2, a3) {
              return dynCall_iiii.apply(null, [callbackfunc, a1, a2, a3]);
            }(eventTypeId, wheelEvent, userData)) e.preventDefault();
          };
          var eventHandler = { target, allowsDeferredCalls: true, eventTypeString, callbackfunc, handlerFunc: wheelHandlerFunc, useCapture };
          JSEvents.registerOrRemoveHandler(eventHandler);
        }
        Module2["registerWheelEventCallback"] = registerWheelEventCallback;
        function _emscripten_set_wheel_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
          target = findEventTarget(target);
          if (typeof target.onwheel != "undefined") {
            registerWheelEventCallback(target, userData, useCapture, callbackfunc, 9, "wheel", targetThread);
            return 0;
          } else {
            return -1;
          }
        }
        Module2["_emscripten_set_wheel_callback_on_thread"] = _emscripten_set_wheel_callback_on_thread;
        function _emscripten_set_window_title(title) {
          setWindowTitle(UTF8ToString(title));
        }
        Module2["_emscripten_set_window_title"] = _emscripten_set_window_title;
        function _emscripten_sleep(ms) {
          return Asyncify.handleSleep((wakeUp) => safeSetTimeout(wakeUp, ms));
        }
        Module2["_emscripten_sleep"] = _emscripten_sleep;
        function _endStats(numberOfRecompiles, rspMs, dlistMs, rdpMs, presentMs, audioMs, triangleDrawMs, rectDrawMs, triangleDrawCalls, rectDrawCalls, audioUnderruns) {
          if (Module2.endStats) {
            Module2.endStats(numberOfRecompiles, rspMs, dlistMs, rdpMs, presentMs, audioMs, triangleDrawMs, rectDrawMs, triangleDrawCalls, rectDrawCalls, audioUnderruns);
          }
        }
        Module2["_endStats"] = _endStats;
        var ENV = {};
        Module2["ENV"] = ENV;
        function getExecutableName() {
          return thisProgram || "./this.program";
        }
        Module2["getExecutableName"] = getExecutableName;
        function getEnvStrings() {
          if (!getEnvStrings.strings) {
            var lang = (typeof navigator == "object" && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8";
            var env = { "USER": "web_user", "LOGNAME": "web_user", "PATH": "/", "PWD": "/", "HOME": "/home/web_user", "LANG": lang, "_": getExecutableName() };
            for (var x in ENV) {
              if (ENV[x] === void 0) delete env[x];
              else env[x] = ENV[x];
            }
            var strings = [];
            for (var x in env) {
              strings.push(x + "=" + env[x]);
            }
            getEnvStrings.strings = strings;
          }
          return getEnvStrings.strings;
        }
        Module2["getEnvStrings"] = getEnvStrings;
        function writeAsciiToMemory(str, buffer2, dontAddNull) {
          for (var i2 = 0; i2 < str.length; ++i2) {
            HEAP8[buffer2++ >> 0] = str.charCodeAt(i2);
          }
          if (!dontAddNull) HEAP8[buffer2 >> 0] = 0;
        }
        Module2["writeAsciiToMemory"] = writeAsciiToMemory;
        function _environ_get(__environ, environ_buf) {
          var bufSize = 0;
          getEnvStrings().forEach(function(string, i2) {
            var ptr = environ_buf + bufSize;
            HEAPU32[__environ + i2 * 4 >> 2] = ptr;
            writeAsciiToMemory(string, ptr);
            bufSize += string.length + 1;
          });
          return 0;
        }
        Module2["_environ_get"] = _environ_get;
        function _environ_sizes_get(penviron_count, penviron_buf_size) {
          var strings = getEnvStrings();
          HEAPU32[penviron_count >> 2] = strings.length;
          var bufSize = 0;
          strings.forEach(function(string) {
            bufSize += string.length + 1;
          });
          HEAPU32[penviron_buf_size >> 2] = bufSize;
          return 0;
        }
        Module2["_environ_sizes_get"] = _environ_sizes_get;
        function _fd_close(fd) {
          try {
            var stream = SYSCALLS.getStreamFromFD(fd);
            FS.close(stream);
            return 0;
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return e.errno;
          }
        }
        Module2["_fd_close"] = _fd_close;
        function doReadv(stream, iov, iovcnt, offset) {
          var ret = 0;
          for (var i2 = 0; i2 < iovcnt; i2++) {
            var ptr = HEAPU32[iov >> 2];
            var len = HEAPU32[iov + 4 >> 2];
            iov += 8;
            var curr = FS.read(stream, HEAP8, ptr, len, offset);
            if (curr < 0) return -1;
            ret += curr;
            if (curr < len) break;
          }
          return ret;
        }
        Module2["doReadv"] = doReadv;
        function _fd_read(fd, iov, iovcnt, pnum) {
          try {
            var stream = SYSCALLS.getStreamFromFD(fd);
            var num = doReadv(stream, iov, iovcnt);
            HEAPU32[pnum >> 2] = num;
            return 0;
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return e.errno;
          }
        }
        Module2["_fd_read"] = _fd_read;
        function convertI32PairToI53Checked(lo, hi) {
          return hi + 2097152 >>> 0 < 4194305 - !!lo ? (lo >>> 0) + hi * 4294967296 : NaN;
        }
        Module2["convertI32PairToI53Checked"] = convertI32PairToI53Checked;
        function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
          try {
            var offset = convertI32PairToI53Checked(offset_low, offset_high);
            if (isNaN(offset)) return 61;
            var stream = SYSCALLS.getStreamFromFD(fd);
            FS.llseek(stream, offset, whence);
            tempI64 = [stream.position >>> 0, (tempDouble = stream.position, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[newOffset >> 2] = tempI64[0], HEAP32[newOffset + 4 >> 2] = tempI64[1];
            if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
            return 0;
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return e.errno;
          }
        }
        Module2["_fd_seek"] = _fd_seek;
        function doWritev(stream, iov, iovcnt, offset) {
          var ret = 0;
          for (var i2 = 0; i2 < iovcnt; i2++) {
            var ptr = HEAPU32[iov >> 2];
            var len = HEAPU32[iov + 4 >> 2];
            iov += 8;
            var curr = FS.write(stream, HEAP8, ptr, len, offset);
            if (curr < 0) return -1;
            ret += curr;
          }
          return ret;
        }
        Module2["doWritev"] = doWritev;
        function _fd_write(fd, iov, iovcnt, pnum) {
          try {
            var stream = SYSCALLS.getStreamFromFD(fd);
            var num = doWritev(stream, iov, iovcnt);
            HEAPU32[pnum >> 2] = num;
            return 0;
          } catch (e) {
            if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
            return e.errno;
          }
        }
        Module2["_fd_write"] = _fd_write;
        function _findAutoInputConfigName(gamepadNamePtr, responseBufferPointer, maxCharacters) {
          Asyncify.handleSleep((wakeUp) => {
            const gamepadName = UTF8ToString(gamepadNamePtr);
            Module2.findAutoInputConfig(gamepadName).then((result) => {
              console.log("found autoInputConfig: %o", result);
              let response = "";
              if (result.matchScore > 0) {
                response = result.matchName;
              }
              stringToUTF8(response, responseBufferPointer, maxCharacters);
              wakeUp();
            });
          });
        }
        Module2["_findAutoInputConfigName"] = _findAutoInputConfigName;
        function _glActiveTexture(x0) {
          GLctx["activeTexture"](x0);
        }
        Module2["_glActiveTexture"] = _glActiveTexture;
        function _glAttachShader(program, shader) {
          GLctx.attachShader(GL.programs[program], GL.shaders[shader]);
        }
        Module2["_glAttachShader"] = _glAttachShader;
        function _glBindAttribLocation(program, index, name) {
          GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name));
        }
        Module2["_glBindAttribLocation"] = _glBindAttribLocation;
        function _glBindBuffer(target, buffer2) {
          if (target == 34962) {
            GLctx.currentArrayBufferBinding = buffer2;
          } else if (target == 34963) {
            GLctx.currentElementArrayBufferBinding = buffer2;
          }
          if (target == 35051) {
            GLctx.currentPixelPackBufferBinding = buffer2;
          } else if (target == 35052) {
            GLctx.currentPixelUnpackBufferBinding = buffer2;
          }
          GLctx.bindBuffer(target, GL.buffers[buffer2]);
        }
        Module2["_glBindBuffer"] = _glBindBuffer;
        function _glBindTexture(target, texture) {
          GLctx.bindTexture(target, GL.textures[texture]);
        }
        Module2["_glBindTexture"] = _glBindTexture;
        function _glBlendFunc(x0, x1) {
          GLctx["blendFunc"](x0, x1);
        }
        Module2["_glBlendFunc"] = _glBlendFunc;
        function _glBufferData(target, size, data, usage) {
          if (GL.currentContext.version >= 2) {
            if (data && size) {
              GLctx.bufferData(target, HEAPU8, usage, data, size);
            } else {
              GLctx.bufferData(target, size, usage);
            }
          } else {
            GLctx.bufferData(target, data ? HEAPU8.subarray(data, data + size) : size, usage);
          }
        }
        Module2["_glBufferData"] = _glBufferData;
        function _glBufferSubData(target, offset, size, data) {
          if (GL.currentContext.version >= 2) {
            size && GLctx.bufferSubData(target, offset, HEAPU8, data, size);
            return;
          }
          GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data + size));
        }
        Module2["_glBufferSubData"] = _glBufferSubData;
        function _glClear(x0) {
          GLctx["clear"](x0);
        }
        Module2["_glClear"] = _glClear;
        function _glClearColor(x0, x1, x2, x3) {
          GLctx["clearColor"](x0, x1, x2, x3);
        }
        Module2["_glClearColor"] = _glClearColor;
        function _glClearDepthf(x0) {
          GLctx["clearDepth"](x0);
        }
        Module2["_glClearDepthf"] = _glClearDepthf;
        function _glCompileShader(shader) {
          GLctx.compileShader(GL.shaders[shader]);
        }
        Module2["_glCompileShader"] = _glCompileShader;
        function _glCreateProgram() {
          var id = GL.getNewId(GL.programs);
          var program = GLctx.createProgram();
          program.name = id;
          program.maxUniformLength = program.maxAttributeLength = program.maxUniformBlockNameLength = 0;
          program.uniformIdCounter = 1;
          GL.programs[id] = program;
          return id;
        }
        Module2["_glCreateProgram"] = _glCreateProgram;
        function _glCreateShader(shaderType) {
          var id = GL.getNewId(GL.shaders);
          GL.shaders[id] = GLctx.createShader(shaderType);
          return id;
        }
        Module2["_glCreateShader"] = _glCreateShader;
        function _glCullFace(x0) {
          GLctx["cullFace"](x0);
        }
        Module2["_glCullFace"] = _glCullFace;
        function _glDeleteProgram(id) {
          if (!id) return;
          var program = GL.programs[id];
          if (!program) {
            GL.recordError(1281);
            return;
          }
          GLctx.deleteProgram(program);
          program.name = 0;
          GL.programs[id] = null;
        }
        Module2["_glDeleteProgram"] = _glDeleteProgram;
        function _glDeleteShader(id) {
          if (!id) return;
          var shader = GL.shaders[id];
          if (!shader) {
            GL.recordError(1281);
            return;
          }
          GLctx.deleteShader(shader);
          GL.shaders[id] = null;
        }
        Module2["_glDeleteShader"] = _glDeleteShader;
        function _glDeleteTextures(n, textures) {
          for (var i2 = 0; i2 < n; i2++) {
            var id = HEAP32[textures + i2 * 4 >> 2];
            var texture = GL.textures[id];
            if (!texture) continue;
            GLctx.deleteTexture(texture);
            texture.name = 0;
            GL.textures[id] = null;
          }
        }
        Module2["_glDeleteTextures"] = _glDeleteTextures;
        function _glDepthFunc(x0) {
          GLctx["depthFunc"](x0);
        }
        Module2["_glDepthFunc"] = _glDepthFunc;
        function _glDepthMask(flag) {
          GLctx.depthMask(!!flag);
        }
        Module2["_glDepthMask"] = _glDepthMask;
        function _glDepthRangef(x0, x1) {
          GLctx["depthRange"](x0, x1);
        }
        Module2["_glDepthRangef"] = _glDepthRangef;
        function _glDetachShader(program, shader) {
          GLctx.detachShader(GL.programs[program], GL.shaders[shader]);
        }
        Module2["_glDetachShader"] = _glDetachShader;
        function _glDisable(x0) {
          GLctx["disable"](x0);
        }
        Module2["_glDisable"] = _glDisable;
        function _glDisableVertexAttribArray(index) {
          var cb = GL.currentContext.clientBuffers[index];
          cb.enabled = false;
          GLctx.disableVertexAttribArray(index);
        }
        Module2["_glDisableVertexAttribArray"] = _glDisableVertexAttribArray;
        function _glDrawArrays(mode, first, count) {
          GL.preDrawHandleClientVertexAttribBindings(first + count);
          GLctx.drawArrays(mode, first, count);
          GL.postDrawHandleClientVertexAttribBindings();
        }
        Module2["_glDrawArrays"] = _glDrawArrays;
        function _glEnable(x0) {
          GLctx["enable"](x0);
        }
        Module2["_glEnable"] = _glEnable;
        function _glEnableVertexAttribArray(index) {
          var cb = GL.currentContext.clientBuffers[index];
          cb.enabled = true;
          GLctx.enableVertexAttribArray(index);
        }
        Module2["_glEnableVertexAttribArray"] = _glEnableVertexAttribArray;
        function _glFinish() {
          GLctx["finish"]();
        }
        Module2["_glFinish"] = _glFinish;
        function _glFlush() {
          GLctx["flush"]();
        }
        Module2["_glFlush"] = _glFlush;
        function _glFrontFace(x0) {
          GLctx["frontFace"](x0);
        }
        Module2["_glFrontFace"] = _glFrontFace;
        function _glGenBuffers(n, buffers) {
          __glGenObject(n, buffers, "createBuffer", GL.buffers);
        }
        Module2["_glGenBuffers"] = _glGenBuffers;
        function _glGenTextures(n, textures) {
          __glGenObject(n, textures, "createTexture", GL.textures);
        }
        Module2["_glGenTextures"] = _glGenTextures;
        function _glGenerateMipmap(x0) {
          GLctx["generateMipmap"](x0);
        }
        Module2["_glGenerateMipmap"] = _glGenerateMipmap;
        function _glGetIntegerv(name_, p) {
          emscriptenWebGLGet(name_, p, 0);
        }
        Module2["_glGetIntegerv"] = _glGetIntegerv;
        function _glGetProgramInfoLog(program, maxLength, length, infoLog) {
          var log = GLctx.getProgramInfoLog(GL.programs[program]);
          if (log === null) log = "(unknown error)";
          var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
          if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
        }
        Module2["_glGetProgramInfoLog"] = _glGetProgramInfoLog;
        function _glGetProgramiv(program, pname, p) {
          if (!p) {
            GL.recordError(1281);
            return;
          }
          if (program >= GL.counter) {
            GL.recordError(1281);
            return;
          }
          program = GL.programs[program];
          if (pname == 35716) {
            var log = GLctx.getProgramInfoLog(program);
            if (log === null) log = "(unknown error)";
            HEAP32[p >> 2] = log.length + 1;
          } else if (pname == 35719) {
            if (!program.maxUniformLength) {
              for (var i2 = 0; i2 < GLctx.getProgramParameter(program, 35718); ++i2) {
                program.maxUniformLength = Math.max(program.maxUniformLength, GLctx.getActiveUniform(program, i2).name.length + 1);
              }
            }
            HEAP32[p >> 2] = program.maxUniformLength;
          } else if (pname == 35722) {
            if (!program.maxAttributeLength) {
              for (var i2 = 0; i2 < GLctx.getProgramParameter(program, 35721); ++i2) {
                program.maxAttributeLength = Math.max(program.maxAttributeLength, GLctx.getActiveAttrib(program, i2).name.length + 1);
              }
            }
            HEAP32[p >> 2] = program.maxAttributeLength;
          } else if (pname == 35381) {
            if (!program.maxUniformBlockNameLength) {
              for (var i2 = 0; i2 < GLctx.getProgramParameter(program, 35382); ++i2) {
                program.maxUniformBlockNameLength = Math.max(program.maxUniformBlockNameLength, GLctx.getActiveUniformBlockName(program, i2).length + 1);
              }
            }
            HEAP32[p >> 2] = program.maxUniformBlockNameLength;
          } else {
            HEAP32[p >> 2] = GLctx.getProgramParameter(program, pname);
          }
        }
        Module2["_glGetProgramiv"] = _glGetProgramiv;
        function _glGetShaderInfoLog(shader, maxLength, length, infoLog) {
          var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
          if (log === null) log = "(unknown error)";
          var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
          if (length) HEAP32[length >> 2] = numBytesWrittenExclNull;
        }
        Module2["_glGetShaderInfoLog"] = _glGetShaderInfoLog;
        function _glGetShaderiv(shader, pname, p) {
          if (!p) {
            GL.recordError(1281);
            return;
          }
          if (pname == 35716) {
            var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
            if (log === null) log = "(unknown error)";
            var logLength = log ? log.length + 1 : 0;
            HEAP32[p >> 2] = logLength;
          } else if (pname == 35720) {
            var source = GLctx.getShaderSource(GL.shaders[shader]);
            var sourceLength = source ? source.length + 1 : 0;
            HEAP32[p >> 2] = sourceLength;
          } else {
            HEAP32[p >> 2] = GLctx.getShaderParameter(GL.shaders[shader], pname);
          }
        }
        Module2["_glGetShaderiv"] = _glGetShaderiv;
        function _glGetString(name_) {
          var ret = GL.stringCache[name_];
          if (!ret) {
            switch (name_) {
              case 7939:
                var exts = GLctx.getSupportedExtensions() || [];
                exts = exts.concat(exts.map(function(e) {
                  return "GL_" + e;
                }));
                ret = stringToNewUTF8(exts.join(" "));
                break;
              case 7936:
              case 7937:
              case 37445:
              case 37446:
                var s = GLctx.getParameter(name_);
                if (!s) {
                  GL.recordError(1280);
                }
                ret = s && stringToNewUTF8(s);
                break;
              case 7938:
                var glVersion = GLctx.getParameter(7938);
                if (GL.currentContext.version >= 2) glVersion = "OpenGL ES 3.0 (" + glVersion + ")";
                else {
                  glVersion = "OpenGL ES 2.0 (" + glVersion + ")";
                }
                ret = stringToNewUTF8(glVersion);
                break;
              case 35724:
                var glslVersion = GLctx.getParameter(35724);
                var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
                var ver_num = glslVersion.match(ver_re);
                if (ver_num !== null) {
                  if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + "0";
                  glslVersion = "OpenGL ES GLSL ES " + ver_num[1] + " (" + glslVersion + ")";
                }
                ret = stringToNewUTF8(glslVersion);
                break;
              default:
                GL.recordError(1280);
            }
            GL.stringCache[name_] = ret;
          }
          return ret;
        }
        Module2["_glGetString"] = _glGetString;
        function _glGetTexParameteriv(target, pname, params) {
          if (!params) {
            GL.recordError(1281);
            return;
          }
          HEAP32[params >> 2] = GLctx.getTexParameter(target, pname);
        }
        Module2["_glGetTexParameteriv"] = _glGetTexParameteriv;
        function _glGetUniformLocation(program, name) {
          name = UTF8ToString(name);
          if (program = GL.programs[program]) {
            webglPrepareUniformLocationsBeforeFirstUse(program);
            var uniformLocsById = program.uniformLocsById;
            var arrayIndex = 0;
            var uniformBaseName = name;
            var leftBrace = webglGetLeftBracePos(name);
            if (leftBrace > 0) {
              arrayIndex = jstoi_q(name.slice(leftBrace + 1)) >>> 0;
              uniformBaseName = name.slice(0, leftBrace);
            }
            var sizeAndId = program.uniformSizeAndIdsByName[uniformBaseName];
            if (sizeAndId && arrayIndex < sizeAndId[0]) {
              arrayIndex += sizeAndId[1];
              if (uniformLocsById[arrayIndex] = uniformLocsById[arrayIndex] || GLctx.getUniformLocation(program, name)) {
                return arrayIndex;
              }
            }
          } else {
            GL.recordError(1281);
          }
          return -1;
        }
        Module2["_glGetUniformLocation"] = _glGetUniformLocation;
        function _glIsEnabled(x0) {
          return GLctx["isEnabled"](x0);
        }
        Module2["_glIsEnabled"] = _glIsEnabled;
        function _glIsProgram(program) {
          program = GL.programs[program];
          if (!program) return 0;
          return GLctx.isProgram(program);
        }
        Module2["_glIsProgram"] = _glIsProgram;
        function _glIsShader(shader) {
          var s = GL.shaders[shader];
          if (!s) return 0;
          return GLctx.isShader(s);
        }
        Module2["_glIsShader"] = _glIsShader;
        function _glLinkProgram(program) {
          program = GL.programs[program];
          GLctx.linkProgram(program);
          program.uniformLocsById = 0;
          program.uniformSizeAndIdsByName = {};
        }
        Module2["_glLinkProgram"] = _glLinkProgram;
        function _glPolygonOffset(x0, x1) {
          GLctx["polygonOffset"](x0, x1);
        }
        Module2["_glPolygonOffset"] = _glPolygonOffset;
        function _glReadPixels(x, y, width, height, format, type, pixels) {
          if (GL.currentContext.version >= 2) {
            if (GLctx.currentPixelPackBufferBinding) {
              GLctx.readPixels(x, y, width, height, format, type, pixels);
            } else {
              var heap = heapObjectForWebGLType(type);
              GLctx.readPixels(x, y, width, height, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
            }
            return;
          }
          var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
          if (!pixelData) {
            GL.recordError(1280);
            return;
          }
          GLctx.readPixels(x, y, width, height, format, type, pixelData);
        }
        Module2["_glReadPixels"] = _glReadPixels;
        function _glScissor(x0, x1, x2, x3) {
          GLctx["scissor"](x0, x1, x2, x3);
        }
        Module2["_glScissor"] = _glScissor;
        function _glShaderSource(shader, count, string, length) {
          var source = GL.getSource(shader, count, string, length);
          GLctx.shaderSource(GL.shaders[shader], source);
        }
        Module2["_glShaderSource"] = _glShaderSource;
        function _glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
          if (GL.currentContext.version >= 2) {
            if (GLctx.currentPixelUnpackBufferBinding) {
              GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels);
            } else if (pixels) {
              var heap = heapObjectForWebGLType(type);
              GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
            } else {
              GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, null);
            }
            return;
          }
          GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null);
        }
        Module2["_glTexImage2D"] = _glTexImage2D;
        function _glTexParameteri(x0, x1, x2) {
          GLctx["texParameteri"](x0, x1, x2);
        }
        Module2["_glTexParameteri"] = _glTexParameteri;
        function _glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
          if (GL.currentContext.version >= 2) {
            if (GLctx.currentPixelUnpackBufferBinding) {
              GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels);
            } else if (pixels) {
              var heap = heapObjectForWebGLType(type);
              GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, heap, pixels >> heapAccessShiftForWebGLHeap(heap));
            } else {
              GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, null);
            }
            return;
          }
          var pixelData = null;
          if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0);
          GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
        }
        Module2["_glTexSubImage2D"] = _glTexSubImage2D;
        function _glUniform1f(location2, v0) {
          GLctx.uniform1f(webglGetUniformLocation(location2), v0);
        }
        Module2["_glUniform1f"] = _glUniform1f;
        function _glUniform1i(location2, v0) {
          GLctx.uniform1i(webglGetUniformLocation(location2), v0);
        }
        Module2["_glUniform1i"] = _glUniform1i;
        function _glUniform2f(location2, v0, v1) {
          GLctx.uniform2f(webglGetUniformLocation(location2), v0, v1);
        }
        Module2["_glUniform2f"] = _glUniform2f;
        function _glUniform3f(location2, v0, v1, v2) {
          GLctx.uniform3f(webglGetUniformLocation(location2), v0, v1, v2);
        }
        Module2["_glUniform3f"] = _glUniform3f;
        function _glUniform4f(location2, v0, v1, v2, v3) {
          GLctx.uniform4f(webglGetUniformLocation(location2), v0, v1, v2, v3);
        }
        Module2["_glUniform4f"] = _glUniform4f;
        function _glUseProgram(program) {
          program = GL.programs[program];
          GLctx.useProgram(program);
          GLctx.currentProgram = program;
        }
        Module2["_glUseProgram"] = _glUseProgram;
        function _glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
          var cb = GL.currentContext.clientBuffers[index];
          if (!GLctx.currentArrayBufferBinding) {
            cb.size = size;
            cb.type = type;
            cb.normalized = normalized;
            cb.stride = stride;
            cb.ptr = ptr;
            cb.clientside = true;
            cb.vertexAttribPointerAdaptor = function(index2, size2, type2, normalized2, stride2, ptr2) {
              this.vertexAttribPointer(index2, size2, type2, normalized2, stride2, ptr2);
            };
            return;
          }
          cb.clientside = false;
          GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
        }
        Module2["_glVertexAttribPointer"] = _glVertexAttribPointer;
        function _glViewport(x0, x1, x2, x3) {
          GLctx["viewport"](x0, x1, x2, x3);
        }
        Module2["_glViewport"] = _glViewport;
        function _initWasmRecompiler() {
          console.log("initWasmRecompiler");
          Module2.recompilingFunctionsByBlock = {};
          Module2.recompiledFunctionsByBlock = {};
          const initialNumberOfFunctionTableSlots = 15e3;
          Module2.numberOfFunctionTableSlotsToGrowBy = 15e3;
          const indirectFunctionTable = Module2["asm"]["__indirect_function_table"];
          const tableLengthBefore = indirectFunctionTable.length;
          indirectFunctionTable.grow(initialNumberOfFunctionTableSlots);
          Module2.availableFunctionTableSlots = /* @__PURE__ */ new Set();
          for (let i2 = 0; i2 < initialNumberOfFunctionTableSlots; i2++) {
            Module2.availableFunctionTableSlots.add(i2 + tableLengthBefore);
          }
          console.log("maxTableLength: %o", indirectFunctionTable.length);
          Module2.moduleCount = 0;
          Module2.blockToCompiledFunctionIndexes = {};
        }
        Module2["_initWasmRecompiler"] = _initWasmRecompiler;
        function _netplayInit() {
          if (!Module2.netplayConfig.reliableChannel || !Module2.netplayConfig.unreliableChannel) {
            console.log('Invalid netplay config. We require both "reliableChannel" and "unreliableChannel"');
            throw `Invalid netplay config: ${Module2.netplayConfig}. We require both "reliableChannel" and "unreliableChannel"`;
          }
          const reliableChannel = Module2.netplayConfig.reliableChannel;
          const unreliableChannel = Module2.netplayConfig.unreliableChannel;
          Module2.netplay = Object.assign({}, Module2.netplay, { pendingReliableMessages: [], pendingUnreliableMessages: [], playerRegistered: false });
          reliableChannel.onmessage = (event2) => {
            console.log("Received reliable message: %o", event2.data);
            Module2.netplay.pendingReliableMessages.push(event2.data);
          };
          unreliableChannel.onmessage = (event2) => {
            Module2.netplay.pendingUnreliableMessages.push(event2.data);
          };
          console.log("Netplay initialized!: %o", Module2);
        }
        Module2["_netplayInit"] = _netplayInit;
        function _requestFileSync() {
          let fileSyncTimeout = null;
          _requestFileSync = function() {
            if (fileSyncTimeout) {
              return;
            }
            fileSyncTimeout = setTimeout(() => {
              fileSyncTimeout = null;
              FS.syncfs(false, function(err2) {
                if (err2) {
                  console.error("Error while syncing system data to IDBFS");
                }
              });
            }, 500);
          };
        }
        Module2["_requestFileSync"] = _requestFileSync;
        function _sendReliableMessage(messageDataPointer, messageLength) {
          console.log("Sending reliable message: %o", HEAPU8[messageDataPointer]);
          const messageBuffer = new Uint8Array(messageLength);
          for (let i2 = 0; i2 < messageLength; i2++) {
            messageBuffer[i2] = HEAPU8[messageDataPointer + i2];
          }
          console.log("Sending reliable message: %o", messageBuffer);
          try {
            Module2.netplayConfig.reliableChannel.send(messageBuffer.buffer);
          } catch (err2) {
            console.error(err2);
          }
        }
        Module2["_sendReliableMessage"] = _sendReliableMessage;
        function _sendUnreliableMessage(messageDataPointer, messageLength) {
          const messageBuffer = new Uint8Array(messageLength);
          for (let i2 = 0; i2 < messageLength; i2++) {
            messageBuffer[i2] = HEAPU8[messageDataPointer + i2];
          }
          try {
            Module2.netplayConfig.unreliableChannel.send(messageBuffer.buffer);
          } catch (err2) {
            console.error(err2);
          }
        }
        Module2["_sendUnreliableMessage"] = _sendUnreliableMessage;
        function __arraySum(array, index) {
          var sum = 0;
          for (var i2 = 0; i2 <= index; sum += array[i2++]) {
          }
          return sum;
        }
        Module2["__arraySum"] = __arraySum;
        var __MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        Module2["__MONTH_DAYS_LEAP"] = __MONTH_DAYS_LEAP;
        var __MONTH_DAYS_REGULAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        Module2["__MONTH_DAYS_REGULAR"] = __MONTH_DAYS_REGULAR;
        function __addDays(date, days) {
          var newDate = new Date(date.getTime());
          while (days > 0) {
            var leap = __isLeapYear(newDate.getFullYear());
            var currentMonth = newDate.getMonth();
            var daysInCurrentMonth = (leap ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR)[currentMonth];
            if (days > daysInCurrentMonth - newDate.getDate()) {
              days -= daysInCurrentMonth - newDate.getDate() + 1;
              newDate.setDate(1);
              if (currentMonth < 11) {
                newDate.setMonth(currentMonth + 1);
              } else {
                newDate.setMonth(0);
                newDate.setFullYear(newDate.getFullYear() + 1);
              }
            } else {
              newDate.setDate(newDate.getDate() + days);
              return newDate;
            }
          }
          return newDate;
        }
        Module2["__addDays"] = __addDays;
        function writeArrayToMemory(array, buffer2) {
          HEAP8.set(array, buffer2);
        }
        Module2["writeArrayToMemory"] = writeArrayToMemory;
        function _strftime(s, maxsize, format, tm) {
          var tm_zone = HEAP32[tm + 40 >> 2];
          var date = { tm_sec: HEAP32[tm >> 2], tm_min: HEAP32[tm + 4 >> 2], tm_hour: HEAP32[tm + 8 >> 2], tm_mday: HEAP32[tm + 12 >> 2], tm_mon: HEAP32[tm + 16 >> 2], tm_year: HEAP32[tm + 20 >> 2], tm_wday: HEAP32[tm + 24 >> 2], tm_yday: HEAP32[tm + 28 >> 2], tm_isdst: HEAP32[tm + 32 >> 2], tm_gmtoff: HEAP32[tm + 36 >> 2], tm_zone: tm_zone ? UTF8ToString(tm_zone) : "" };
          var pattern = UTF8ToString(format);
          var EXPANSION_RULES_1 = { "%c": "%a %b %d %H:%M:%S %Y", "%D": "%m/%d/%y", "%F": "%Y-%m-%d", "%h": "%b", "%r": "%I:%M:%S %p", "%R": "%H:%M", "%T": "%H:%M:%S", "%x": "%m/%d/%y", "%X": "%H:%M:%S", "%Ec": "%c", "%EC": "%C", "%Ex": "%m/%d/%y", "%EX": "%H:%M:%S", "%Ey": "%y", "%EY": "%Y", "%Od": "%d", "%Oe": "%e", "%OH": "%H", "%OI": "%I", "%Om": "%m", "%OM": "%M", "%OS": "%S", "%Ou": "%u", "%OU": "%U", "%OV": "%V", "%Ow": "%w", "%OW": "%W", "%Oy": "%y" };
          for (var rule in EXPANSION_RULES_1) {
            pattern = pattern.replace(new RegExp(rule, "g"), EXPANSION_RULES_1[rule]);
          }
          var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          function leadingSomething(value, digits, character) {
            var str = typeof value == "number" ? value.toString() : value || "";
            while (str.length < digits) {
              str = character[0] + str;
            }
            return str;
          }
          function leadingNulls(value, digits) {
            return leadingSomething(value, digits, "0");
          }
          function compareByDay(date1, date2) {
            function sgn(value) {
              return value < 0 ? -1 : value > 0 ? 1 : 0;
            }
            var compare;
            if ((compare = sgn(date1.getFullYear() - date2.getFullYear())) === 0) {
              if ((compare = sgn(date1.getMonth() - date2.getMonth())) === 0) {
                compare = sgn(date1.getDate() - date2.getDate());
              }
            }
            return compare;
          }
          function getFirstWeekStartDate(janFourth) {
            switch (janFourth.getDay()) {
              case 0:
                return new Date(janFourth.getFullYear() - 1, 11, 29);
              case 1:
                return janFourth;
              case 2:
                return new Date(janFourth.getFullYear(), 0, 3);
              case 3:
                return new Date(janFourth.getFullYear(), 0, 2);
              case 4:
                return new Date(janFourth.getFullYear(), 0, 1);
              case 5:
                return new Date(janFourth.getFullYear() - 1, 11, 31);
              case 6:
                return new Date(janFourth.getFullYear() - 1, 11, 30);
            }
          }
          function getWeekBasedYear(date2) {
            var thisDate = __addDays(new Date(date2.tm_year + 1900, 0, 1), date2.tm_yday);
            var janFourthThisYear = new Date(thisDate.getFullYear(), 0, 4);
            var janFourthNextYear = new Date(thisDate.getFullYear() + 1, 0, 4);
            var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
            var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
            if (compareByDay(firstWeekStartThisYear, thisDate) <= 0) {
              if (compareByDay(firstWeekStartNextYear, thisDate) <= 0) {
                return thisDate.getFullYear() + 1;
              }
              return thisDate.getFullYear();
            }
            return thisDate.getFullYear() - 1;
          }
          var EXPANSION_RULES_2 = { "%a": function(date2) {
            return WEEKDAYS[date2.tm_wday].substring(0, 3);
          }, "%A": function(date2) {
            return WEEKDAYS[date2.tm_wday];
          }, "%b": function(date2) {
            return MONTHS[date2.tm_mon].substring(0, 3);
          }, "%B": function(date2) {
            return MONTHS[date2.tm_mon];
          }, "%C": function(date2) {
            var year = date2.tm_year + 1900;
            return leadingNulls(year / 100 | 0, 2);
          }, "%d": function(date2) {
            return leadingNulls(date2.tm_mday, 2);
          }, "%e": function(date2) {
            return leadingSomething(date2.tm_mday, 2, " ");
          }, "%g": function(date2) {
            return getWeekBasedYear(date2).toString().substring(2);
          }, "%G": function(date2) {
            return getWeekBasedYear(date2);
          }, "%H": function(date2) {
            return leadingNulls(date2.tm_hour, 2);
          }, "%I": function(date2) {
            var twelveHour = date2.tm_hour;
            if (twelveHour == 0) twelveHour = 12;
            else if (twelveHour > 12) twelveHour -= 12;
            return leadingNulls(twelveHour, 2);
          }, "%j": function(date2) {
            return leadingNulls(date2.tm_mday + __arraySum(__isLeapYear(date2.tm_year + 1900) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, date2.tm_mon - 1), 3);
          }, "%m": function(date2) {
            return leadingNulls(date2.tm_mon + 1, 2);
          }, "%M": function(date2) {
            return leadingNulls(date2.tm_min, 2);
          }, "%n": function() {
            return "\n";
          }, "%p": function(date2) {
            if (date2.tm_hour >= 0 && date2.tm_hour < 12) {
              return "AM";
            }
            return "PM";
          }, "%S": function(date2) {
            return leadingNulls(date2.tm_sec, 2);
          }, "%t": function() {
            return "	";
          }, "%u": function(date2) {
            return date2.tm_wday || 7;
          }, "%U": function(date2) {
            var days = date2.tm_yday + 7 - date2.tm_wday;
            return leadingNulls(Math.floor(days / 7), 2);
          }, "%V": function(date2) {
            var val = Math.floor((date2.tm_yday + 7 - (date2.tm_wday + 6) % 7) / 7);
            if ((date2.tm_wday + 371 - date2.tm_yday - 2) % 7 <= 2) {
              val++;
            }
            if (!val) {
              val = 52;
              var dec31 = (date2.tm_wday + 7 - date2.tm_yday - 1) % 7;
              if (dec31 == 4 || dec31 == 5 && __isLeapYear(date2.tm_year % 400 - 1)) {
                val++;
              }
            } else if (val == 53) {
              var jan1 = (date2.tm_wday + 371 - date2.tm_yday) % 7;
              if (jan1 != 4 && (jan1 != 3 || !__isLeapYear(date2.tm_year))) val = 1;
            }
            return leadingNulls(val, 2);
          }, "%w": function(date2) {
            return date2.tm_wday;
          }, "%W": function(date2) {
            var days = date2.tm_yday + 7 - (date2.tm_wday + 6) % 7;
            return leadingNulls(Math.floor(days / 7), 2);
          }, "%y": function(date2) {
            return (date2.tm_year + 1900).toString().substring(2);
          }, "%Y": function(date2) {
            return date2.tm_year + 1900;
          }, "%z": function(date2) {
            var off = date2.tm_gmtoff;
            var ahead = off >= 0;
            off = Math.abs(off) / 60;
            off = off / 60 * 100 + off % 60;
            return (ahead ? "+" : "-") + String("0000" + off).slice(-4);
          }, "%Z": function(date2) {
            return date2.tm_zone;
          }, "%%": function() {
            return "%";
          } };
          pattern = pattern.replace(/%%/g, "\0\0");
          for (var rule in EXPANSION_RULES_2) {
            if (pattern.includes(rule)) {
              pattern = pattern.replace(new RegExp(rule, "g"), EXPANSION_RULES_2[rule](date));
            }
          }
          pattern = pattern.replace(/\0\0/g, "%");
          var bytes = intArrayFromString(pattern, false);
          if (bytes.length > maxsize) {
            return 0;
          }
          writeArrayToMemory(bytes, s);
          return bytes.length - 1;
        }
        Module2["_strftime"] = _strftime;
        function _strftime_l(s, maxsize, format, tm, loc) {
          return _strftime(s, maxsize, format, tm);
        }
        Module2["_strftime_l"] = _strftime_l;
        function _waitForReliableMessage(responseBufferPointer) {
          console.log("waitForReliableMessage");
          Asyncify.handleSleep((wakeUp) => {
            Module2.netplayConfig.reliableChannel.onmessage = (event2) => {
              console.log("received message: %o", event2.data);
              const response = new Uint8Array(event2.data);
              for (let i2 = 0; i2 < response.length; i2++) {
                HEAPU8[responseBufferPointer + i2] = response[i2];
              }
              wakeUp();
            };
          });
        }
        Module2["_waitForReliableMessage"] = _waitForReliableMessage;
        function _wasmReleaseBlock(block) {
          if (Module2.blockToCompiledFunctionIndexes[block]) {
            const indirectFunctionTable = Module2["asm"]["__indirect_function_table"];
            const compiledFunctionIndexes = Module2.blockToCompiledFunctionIndexes[block];
            while (compiledFunctionIndexes.length > 0) {
              const functionIndex = compiledFunctionIndexes.pop();
              indirectFunctionTable.set(functionIndex, null);
              Module2.availableFunctionTableSlots.add(functionIndex);
            }
          }
        }
        Module2["_wasmReleaseBlock"] = _wasmReleaseBlock;
        function allocateUTF8OnStack(str) {
          var size = lengthBytesUTF8(str) + 1;
          var ret = stackAlloc(size);
          stringToUTF8Array(str, HEAP8, ret, size);
          return ret;
        }
        Module2["allocateUTF8OnStack"] = allocateUTF8OnStack;
        function runAndAbortIfError(func) {
          try {
            return func();
          } catch (e) {
            abort(e);
          }
        }
        Module2["runAndAbortIfError"] = runAndAbortIfError;
        function sigToWasmTypes(sig) {
          var typeNames = { "i": "i32", "j": "i32", "f": "f32", "d": "f64", "p": "i32" };
          var type = { parameters: [], results: sig[0] == "v" ? [] : [typeNames[sig[0]]] };
          for (var i2 = 1; i2 < sig.length; ++i2) {
            type.parameters.push(typeNames[sig[i2]]);
            if (sig[i2] === "j") {
              type.parameters.push("i32");
            }
          }
          return type;
        }
        Module2["sigToWasmTypes"] = sigToWasmTypes;
        function runtimeKeepalivePush() {
        }
        Module2["runtimeKeepalivePush"] = runtimeKeepalivePush;
        function runtimeKeepalivePop() {
        }
        Module2["runtimeKeepalivePop"] = runtimeKeepalivePop;
        var Asyncify = { instrumentWasmImports: function(imports) {
          var ASYNCIFY_IMPORTS = ["env.waitForReliableMessage", "env.waitForAsyncAction", "env.findAutoInputConfigName", "env.sdl_init_audio_device", "env.initIDBFS", "env.writeROM", "env.copyInputAutoConfig", "env.startCore", "env.compileAndPatchModule", "env.invoke_*", "env.emscripten_sleep", "env.emscripten_wget", "env.emscripten_wget_data", "env.emscripten_idb_load", "env.emscripten_idb_store", "env.emscripten_idb_delete", "env.emscripten_idb_exists", "env.emscripten_idb_load_blob", "env.emscripten_idb_store_blob", "env.SDL_Delay", "env.emscripten_scan_registers", "env.emscripten_lazy_load_code", "env.emscripten_fiber_swap", "wasi_snapshot_preview1.fd_sync", "env.__wasi_fd_sync", "env._emval_await", "env._dlopen_js", "env.__asyncjs__*"].map((x2) => x2.split(".")[1]);
          for (var x in imports) {
            (function(x2) {
              var original = imports[x2];
              var sig = original.sig;
              if (typeof original == "function") {
                var isAsyncifyImport = ASYNCIFY_IMPORTS.indexOf(x2) >= 0 || x2.startsWith("__asyncjs__");
              }
            })(x);
          }
        }, instrumentWasmExports: function(exports2) {
          var ret = {};
          for (var x in exports2) {
            (function(x2) {
              var original = exports2[x2];
              if (typeof original == "function") {
                ret[x2] = function() {
                  Asyncify.exportCallStack.push(x2);
                  try {
                    return original.apply(null, arguments);
                  } finally {
                    if (!ABORT) {
                      var y = Asyncify.exportCallStack.pop();
                      assert(y === x2);
                      Asyncify.maybeStopUnwind();
                    }
                  }
                };
              } else {
                ret[x2] = original;
              }
            })(x);
          }
          return ret;
        }, State: { Normal: 0, Unwinding: 1, Rewinding: 2, Disabled: 3 }, state: 0, StackSize: 4096, currData: null, handleSleepReturnValue: 0, exportCallStack: [], callStackNameToId: {}, callStackIdToName: {}, callStackId: 0, asyncPromiseHandlers: null, sleepCallbacks: [], getCallStackId: function(funcName) {
          var id = Asyncify.callStackNameToId[funcName];
          if (id === void 0) {
            id = Asyncify.callStackId++;
            Asyncify.callStackNameToId[funcName] = id;
            Asyncify.callStackIdToName[id] = funcName;
          }
          return id;
        }, maybeStopUnwind: function() {
          if (Asyncify.currData && Asyncify.state === Asyncify.State.Unwinding && Asyncify.exportCallStack.length === 0) {
            Asyncify.state = Asyncify.State.Normal;
            runAndAbortIfError(_asyncify_stop_unwind);
            if (typeof Fibers != "undefined") {
              Fibers.trampoline();
            }
          }
        }, whenDone: function() {
          return new Promise((resolve, reject) => {
            Asyncify.asyncPromiseHandlers = { resolve, reject };
          });
        }, allocateData: function() {
          var ptr = _malloc(12 + Asyncify.StackSize);
          Asyncify.setDataHeader(ptr, ptr + 12, Asyncify.StackSize);
          Asyncify.setDataRewindFunc(ptr);
          return ptr;
        }, setDataHeader: function(ptr, stack, stackSize) {
          HEAP32[ptr >> 2] = stack;
          HEAP32[ptr + 4 >> 2] = stack + stackSize;
        }, setDataRewindFunc: function(ptr) {
          var bottomOfCallStack = Asyncify.exportCallStack[0];
          var rewindId = Asyncify.getCallStackId(bottomOfCallStack);
          HEAP32[ptr + 8 >> 2] = rewindId;
        }, getDataRewindFunc: function(ptr) {
          var id = HEAP32[ptr + 8 >> 2];
          var name = Asyncify.callStackIdToName[id];
          var func = Module2["asm"][name];
          return func;
        }, doRewind: function(ptr) {
          var start = Asyncify.getDataRewindFunc(ptr);
          return start();
        }, handleSleep: function(startAsync) {
          if (ABORT) return;
          if (Asyncify.state === Asyncify.State.Normal) {
            var reachedCallback = false;
            var reachedAfterCallback = false;
            startAsync((handleSleepReturnValue) => {
              if (ABORT) return;
              Asyncify.handleSleepReturnValue = handleSleepReturnValue || 0;
              reachedCallback = true;
              if (!reachedAfterCallback) {
                return;
              }
              Asyncify.state = Asyncify.State.Rewinding;
              runAndAbortIfError(() => _asyncify_start_rewind(Asyncify.currData));
              if (typeof Browser != "undefined" && Browser.mainLoop.func) {
                Browser.mainLoop.resume();
              }
              var asyncWasmReturnValue, isError = false;
              try {
                asyncWasmReturnValue = Asyncify.doRewind(Asyncify.currData);
              } catch (err2) {
                asyncWasmReturnValue = err2;
                isError = true;
              }
              var handled = false;
              if (!Asyncify.currData) {
                var asyncPromiseHandlers = Asyncify.asyncPromiseHandlers;
                if (asyncPromiseHandlers) {
                  Asyncify.asyncPromiseHandlers = null;
                  (isError ? asyncPromiseHandlers.reject : asyncPromiseHandlers.resolve)(asyncWasmReturnValue);
                  handled = true;
                }
              }
              if (isError && !handled) {
                throw asyncWasmReturnValue;
              }
            });
            reachedAfterCallback = true;
            if (!reachedCallback) {
              Asyncify.state = Asyncify.State.Unwinding;
              Asyncify.currData = Asyncify.allocateData();
              if (typeof Browser != "undefined" && Browser.mainLoop.func) {
                Browser.mainLoop.pause();
              }
              runAndAbortIfError(() => _asyncify_start_unwind(Asyncify.currData));
            }
          } else if (Asyncify.state === Asyncify.State.Rewinding) {
            Asyncify.state = Asyncify.State.Normal;
            runAndAbortIfError(_asyncify_stop_rewind);
            _free(Asyncify.currData);
            Asyncify.currData = null;
            Asyncify.sleepCallbacks.forEach((func) => callUserCallback(func));
          } else {
            abort("invalid state: " + Asyncify.state);
          }
          return Asyncify.handleSleepReturnValue;
        }, handleAsync: function(startAsync) {
          return Asyncify.handleSleep((wakeUp) => {
            startAsync().then(wakeUp);
          });
        } };
        Module2["Asyncify"] = Asyncify;
        function getCFunc(ident) {
          var func = Module2["_" + ident];
          return func;
        }
        Module2["getCFunc"] = getCFunc;
        function ccall(ident, returnType, argTypes, args, opts) {
          var toC = { "string": (str) => {
            var ret2 = 0;
            if (str !== null && str !== void 0 && str !== 0) {
              var len = (str.length << 2) + 1;
              ret2 = stackAlloc(len);
              stringToUTF8(str, ret2, len);
            }
            return ret2;
          }, "array": (arr) => {
            var ret2 = stackAlloc(arr.length);
            writeArrayToMemory(arr, ret2);
            return ret2;
          } };
          function convertReturnValue(ret2) {
            if (returnType === "string") {
              return UTF8ToString(ret2);
            }
            if (returnType === "boolean") return Boolean(ret2);
            return ret2;
          }
          var func = getCFunc(ident);
          var cArgs = [];
          var stack = 0;
          if (args) {
            for (var i2 = 0; i2 < args.length; i2++) {
              var converter = toC[argTypes[i2]];
              if (converter) {
                if (stack === 0) stack = stackSave();
                cArgs[i2] = converter(args[i2]);
              } else {
                cArgs[i2] = args[i2];
              }
            }
          }
          var previousAsync = Asyncify.currData;
          var ret = func.apply(null, cArgs);
          function onDone(ret2) {
            runtimeKeepalivePop();
            if (stack !== 0) stackRestore(stack);
            return convertReturnValue(ret2);
          }
          runtimeKeepalivePush();
          var asyncMode = opts && opts.async;
          if (Asyncify.currData != previousAsync) {
            return Asyncify.whenDone().then(onDone);
          }
          ret = onDone(ret);
          if (asyncMode) return Promise.resolve(ret);
          return ret;
        }
        Module2["ccall"] = ccall;
        function cwrap(ident, returnType, argTypes, opts) {
          argTypes = argTypes || [];
          var numericArgs = argTypes.every((type) => type === "number" || type === "boolean");
          var numericRet = returnType !== "string";
          if (numericRet && numericArgs && !opts) {
            return getCFunc(ident);
          }
          return function() {
            return ccall(ident, returnType, argTypes, arguments, opts);
          };
        }
        Module2["cwrap"] = cwrap;
        Module2["requestFullscreen"] = function Module_requestFullscreen(lockPointer, resizeCanvas) {
          Browser.requestFullscreen(lockPointer, resizeCanvas);
        };
        Module2["requestAnimationFrame"] = function Module_requestAnimationFrame(func) {
          Browser.requestAnimationFrame(func);
        };
        Module2["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) {
          Browser.setCanvasSize(width, height, noUpdates);
        };
        Module2["pauseMainLoop"] = function Module_pauseMainLoop() {
          Browser.mainLoop.pause();
        };
        Module2["resumeMainLoop"] = function Module_resumeMainLoop() {
          Browser.mainLoop.resume();
        };
        Module2["getUserMedia"] = function Module_getUserMedia() {
          Browser.getUserMedia();
        };
        Module2["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) {
          return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes);
        };
        var preloadedImages = {};
        var preloadedAudios = {};
        var FSNode = function(parent, name, mode, rdev) {
          if (!parent) {
            parent = this;
          }
          this.parent = parent;
          this.mount = parent.mount;
          this.mounted = null;
          this.id = FS.nextInode++;
          this.name = name;
          this.mode = mode;
          this.node_ops = {};
          this.stream_ops = {};
          this.rdev = rdev;
        };
        var readMode = 292 | 73;
        var writeMode = 146;
        Object.defineProperties(FSNode.prototype, { read: { get: function() {
          return (this.mode & readMode) === readMode;
        }, set: function(val) {
          val ? this.mode |= readMode : this.mode &= ~readMode;
        } }, write: { get: function() {
          return (this.mode & writeMode) === writeMode;
        }, set: function(val) {
          val ? this.mode |= writeMode : this.mode &= ~writeMode;
        } }, isFolder: { get: function() {
          return FS.isDir(this.mode);
        } }, isDevice: { get: function() {
          return FS.isChrdev(this.mode);
        } } });
        FS.FSNode = FSNode;
        FS.staticInit();
        Module2["FS_createPath"] = FS.createPath;
        Module2["FS_createDataFile"] = FS.createDataFile;
        Module2["FS_createPreloadedFile"] = FS.createPreloadedFile;
        Module2["FS_unlink"] = FS.unlink;
        Module2["FS_createLazyFile"] = FS.createLazyFile;
        Module2["FS_createDevice"] = FS.createDevice;
        var GLctx;
        for (var i = 0; i < 32; ++i) tempFixedLengthArray.push(new Array(i));
        var miniTempWebGLFloatBuffersStorage = new Float32Array(288);
        for (var i = 0; i < 288; ++i) {
          miniTempWebGLFloatBuffers[i] = miniTempWebGLFloatBuffersStorage.subarray(0, i + 1);
        }
        var __miniTempWebGLIntBuffersStorage = new Int32Array(288);
        for (var i = 0; i < 288; ++i) {
          __miniTempWebGLIntBuffers[i] = __miniTempWebGLIntBuffersStorage.subarray(0, i + 1);
        }
        _requestFileSync();
        var decodeBase64 = typeof atob == "function" ? atob : function(input) {
          var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
          var output = "";
          var chr1, chr2, chr3;
          var enc1, enc2, enc3, enc4;
          var i2 = 0;
          input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
          do {
            enc1 = keyStr.indexOf(input.charAt(i2++));
            enc2 = keyStr.indexOf(input.charAt(i2++));
            enc3 = keyStr.indexOf(input.charAt(i2++));
            enc4 = keyStr.indexOf(input.charAt(i2++));
            chr1 = enc1 << 2 | enc2 >> 4;
            chr2 = (enc2 & 15) << 4 | enc3 >> 2;
            chr3 = (enc3 & 3) << 6 | enc4;
            output = output + String.fromCharCode(chr1);
            if (enc3 !== 64) {
              output = output + String.fromCharCode(chr2);
            }
            if (enc4 !== 64) {
              output = output + String.fromCharCode(chr3);
            }
          } while (i2 < input.length);
          return output;
        };
        function intArrayFromBase64(s) {
          try {
            var decoded = decodeBase64(s);
            var bytes = new Uint8Array(decoded.length);
            for (var i2 = 0; i2 < decoded.length; ++i2) {
              bytes[i2] = decoded.charCodeAt(i2);
            }
            return bytes;
          } catch (_) {
            throw new Error("Converting base64 string to bytes failed.");
          }
        }
        var asmLibraryArg = { "__assert_fail": ___assert_fail, "__cxa_allocate_exception": ___cxa_allocate_exception, "__cxa_throw": ___cxa_throw, "__syscall_fcntl64": ___syscall_fcntl64, "__syscall_fstat64": ___syscall_fstat64, "__syscall_getdents64": ___syscall_getdents64, "__syscall_ioctl": ___syscall_ioctl, "__syscall_lstat64": ___syscall_lstat64, "__syscall_mkdirat": ___syscall_mkdirat, "__syscall_mknodat": ___syscall_mknodat, "__syscall_newfstatat": ___syscall_newfstatat, "__syscall_openat": ___syscall_openat, "__syscall_stat64": ___syscall_stat64, "_dlsym_js": __dlsym_js, "_emscripten_get_now_is_monotonic": __emscripten_get_now_is_monotonic, "_emscripten_throw_longjmp": __emscripten_throw_longjmp, "_localtime_js": __localtime_js, "_mmap_js": __mmap_js, "_munmap_js": __munmap_js, "_tzset_js": __tzset_js, "abort": _abort, "beginStats": _beginStats, "checkForUnreliableMessages": _checkForUnreliableMessages, "compileAndPatchModule": _compileAndPatchModule, "copyInputAutoConfig": copyInputAutoConfig, "eglBindAPI": _eglBindAPI, "eglChooseConfig": _eglChooseConfig, "eglCreateContext": _eglCreateContext, "eglCreateWindowSurface": _eglCreateWindowSurface, "eglDestroyContext": _eglDestroyContext, "eglDestroySurface": _eglDestroySurface, "eglGetConfigAttrib": _eglGetConfigAttrib, "eglGetDisplay": _eglGetDisplay, "eglGetError": _eglGetError, "eglInitialize": _eglInitialize, "eglMakeCurrent": _eglMakeCurrent, "eglQueryString": _eglQueryString, "eglSwapBuffers": _eglSwapBuffers, "eglSwapInterval": _eglSwapInterval, "eglTerminate": _eglTerminate, "eglWaitGL": _eglWaitGL, "eglWaitNative": _eglWaitNative, "emscripten_asm_const_int": _emscripten_asm_const_int, "emscripten_asm_const_int_sync_on_main_thread": _emscripten_asm_const_int_sync_on_main_thread, "emscripten_async_call": _emscripten_async_call, "emscripten_cancel_main_loop": _emscripten_cancel_main_loop, "emscripten_date_now": _emscripten_date_now, "emscripten_exit_fullscreen": _emscripten_exit_fullscreen, "emscripten_exit_pointerlock": _emscripten_exit_pointerlock, "emscripten_get_device_pixel_ratio": _emscripten_get_device_pixel_ratio, "emscripten_get_element_css_size": _emscripten_get_element_css_size, "emscripten_get_gamepad_status": _emscripten_get_gamepad_status, "emscripten_get_now": _emscripten_get_now, "emscripten_get_num_gamepads": _emscripten_get_num_gamepads, "emscripten_get_screen_size": _emscripten_get_screen_size, "emscripten_glActiveTexture": _emscripten_glActiveTexture, "emscripten_glAttachShader": _emscripten_glAttachShader, "emscripten_glBeginQuery": _emscripten_glBeginQuery, "emscripten_glBeginQueryEXT": _emscripten_glBeginQueryEXT, "emscripten_glBeginTransformFeedback": _emscripten_glBeginTransformFeedback, "emscripten_glBindAttribLocation": _emscripten_glBindAttribLocation, "emscripten_glBindBuffer": _emscripten_glBindBuffer, "emscripten_glBindBufferBase": _emscripten_glBindBufferBase, "emscripten_glBindBufferRange": _emscripten_glBindBufferRange, "emscripten_glBindFramebuffer": _emscripten_glBindFramebuffer, "emscripten_glBindRenderbuffer": _emscripten_glBindRenderbuffer, "emscripten_glBindSampler": _emscripten_glBindSampler, "emscripten_glBindTexture": _emscripten_glBindTexture, "emscripten_glBindTransformFeedback": _emscripten_glBindTransformFeedback, "emscripten_glBindVertexArray": _emscripten_glBindVertexArray, "emscripten_glBindVertexArrayOES": _emscripten_glBindVertexArrayOES, "emscripten_glBlendColor": _emscripten_glBlendColor, "emscripten_glBlendEquation": _emscripten_glBlendEquation, "emscripten_glBlendEquationSeparate": _emscripten_glBlendEquationSeparate, "emscripten_glBlendFunc": _emscripten_glBlendFunc, "emscripten_glBlendFuncSeparate": _emscripten_glBlendFuncSeparate, "emscripten_glBlitFramebuffer": _emscripten_glBlitFramebuffer, "emscripten_glBufferData": _emscripten_glBufferData, "emscripten_glBufferSubData": _emscripten_glBufferSubData, "emscripten_glCheckFramebufferStatus": _emscripten_glCheckFramebufferStatus, "emscripten_glClear": _emscripten_glClear, "emscripten_glClearBufferfi": _emscripten_glClearBufferfi, "emscripten_glClearBufferfv": _emscripten_glClearBufferfv, "emscripten_glClearBufferiv": _emscripten_glClearBufferiv, "emscripten_glClearBufferuiv": _emscripten_glClearBufferuiv, "emscripten_glClearColor": _emscripten_glClearColor, "emscripten_glClearDepthf": _emscripten_glClearDepthf, "emscripten_glClearStencil": _emscripten_glClearStencil, "emscripten_glClientWaitSync": _emscripten_glClientWaitSync, "emscripten_glColorMask": _emscripten_glColorMask, "emscripten_glCompileShader": _emscripten_glCompileShader, "emscripten_glCompressedTexImage2D": _emscripten_glCompressedTexImage2D, "emscripten_glCompressedTexImage3D": _emscripten_glCompressedTexImage3D, "emscripten_glCompressedTexSubImage2D": _emscripten_glCompressedTexSubImage2D, "emscripten_glCompressedTexSubImage3D": _emscripten_glCompressedTexSubImage3D, "emscripten_glCopyBufferSubData": _emscripten_glCopyBufferSubData, "emscripten_glCopyTexImage2D": _emscripten_glCopyTexImage2D, "emscripten_glCopyTexSubImage2D": _emscripten_glCopyTexSubImage2D, "emscripten_glCopyTexSubImage3D": _emscripten_glCopyTexSubImage3D, "emscripten_glCreateProgram": _emscripten_glCreateProgram, "emscripten_glCreateShader": _emscripten_glCreateShader, "emscripten_glCullFace": _emscripten_glCullFace, "emscripten_glDeleteBuffers": _emscripten_glDeleteBuffers, "emscripten_glDeleteFramebuffers": _emscripten_glDeleteFramebuffers, "emscripten_glDeleteProgram": _emscripten_glDeleteProgram, "emscripten_glDeleteQueries": _emscripten_glDeleteQueries, "emscripten_glDeleteQueriesEXT": _emscripten_glDeleteQueriesEXT, "emscripten_glDeleteRenderbuffers": _emscripten_glDeleteRenderbuffers, "emscripten_glDeleteSamplers": _emscripten_glDeleteSamplers, "emscripten_glDeleteShader": _emscripten_glDeleteShader, "emscripten_glDeleteSync": _emscripten_glDeleteSync, "emscripten_glDeleteTextures": _emscripten_glDeleteTextures, "emscripten_glDeleteTransformFeedbacks": _emscripten_glDeleteTransformFeedbacks, "emscripten_glDeleteVertexArrays": _emscripten_glDeleteVertexArrays, "emscripten_glDeleteVertexArraysOES": _emscripten_glDeleteVertexArraysOES, "emscripten_glDepthFunc": _emscripten_glDepthFunc, "emscripten_glDepthMask": _emscripten_glDepthMask, "emscripten_glDepthRangef": _emscripten_glDepthRangef, "emscripten_glDetachShader": _emscripten_glDetachShader, "emscripten_glDisable": _emscripten_glDisable, "emscripten_glDisableVertexAttribArray": _emscripten_glDisableVertexAttribArray, "emscripten_glDrawArrays": _emscripten_glDrawArrays, "emscripten_glDrawArraysInstanced": _emscripten_glDrawArraysInstanced, "emscripten_glDrawArraysInstancedANGLE": _emscripten_glDrawArraysInstancedANGLE, "emscripten_glDrawArraysInstancedARB": _emscripten_glDrawArraysInstancedARB, "emscripten_glDrawArraysInstancedEXT": _emscripten_glDrawArraysInstancedEXT, "emscripten_glDrawArraysInstancedNV": _emscripten_glDrawArraysInstancedNV, "emscripten_glDrawBuffers": _emscripten_glDrawBuffers, "emscripten_glDrawBuffersEXT": _emscripten_glDrawBuffersEXT, "emscripten_glDrawBuffersWEBGL": _emscripten_glDrawBuffersWEBGL, "emscripten_glDrawElements": _emscripten_glDrawElements, "emscripten_glDrawElementsInstanced": _emscripten_glDrawElementsInstanced, "emscripten_glDrawElementsInstancedANGLE": _emscripten_glDrawElementsInstancedANGLE, "emscripten_glDrawElementsInstancedARB": _emscripten_glDrawElementsInstancedARB, "emscripten_glDrawElementsInstancedEXT": _emscripten_glDrawElementsInstancedEXT, "emscripten_glDrawElementsInstancedNV": _emscripten_glDrawElementsInstancedNV, "emscripten_glDrawRangeElements": _emscripten_glDrawRangeElements, "emscripten_glEnable": _emscripten_glEnable, "emscripten_glEnableVertexAttribArray": _emscripten_glEnableVertexAttribArray, "emscripten_glEndQuery": _emscripten_glEndQuery, "emscripten_glEndQueryEXT": _emscripten_glEndQueryEXT, "emscripten_glEndTransformFeedback": _emscripten_glEndTransformFeedback, "emscripten_glFenceSync": _emscripten_glFenceSync, "emscripten_glFinish": _emscripten_glFinish, "emscripten_glFlush": _emscripten_glFlush, "emscripten_glFlushMappedBufferRange": _emscripten_glFlushMappedBufferRange, "emscripten_glFramebufferRenderbuffer": _emscripten_glFramebufferRenderbuffer, "emscripten_glFramebufferTexture2D": _emscripten_glFramebufferTexture2D, "emscripten_glFramebufferTextureLayer": _emscripten_glFramebufferTextureLayer, "emscripten_glFrontFace": _emscripten_glFrontFace, "emscripten_glGenBuffers": _emscripten_glGenBuffers, "emscripten_glGenFramebuffers": _emscripten_glGenFramebuffers, "emscripten_glGenQueries": _emscripten_glGenQueries, "emscripten_glGenQueriesEXT": _emscripten_glGenQueriesEXT, "emscripten_glGenRenderbuffers": _emscripten_glGenRenderbuffers, "emscripten_glGenSamplers": _emscripten_glGenSamplers, "emscripten_glGenTextures": _emscripten_glGenTextures, "emscripten_glGenTransformFeedbacks": _emscripten_glGenTransformFeedbacks, "emscripten_glGenVertexArrays": _emscripten_glGenVertexArrays, "emscripten_glGenVertexArraysOES": _emscripten_glGenVertexArraysOES, "emscripten_glGenerateMipmap": _emscripten_glGenerateMipmap, "emscripten_glGetActiveAttrib": _emscripten_glGetActiveAttrib, "emscripten_glGetActiveUniform": _emscripten_glGetActiveUniform, "emscripten_glGetActiveUniformBlockName": _emscripten_glGetActiveUniformBlockName, "emscripten_glGetActiveUniformBlockiv": _emscripten_glGetActiveUniformBlockiv, "emscripten_glGetActiveUniformsiv": _emscripten_glGetActiveUniformsiv, "emscripten_glGetAttachedShaders": _emscripten_glGetAttachedShaders, "emscripten_glGetAttribLocation": _emscripten_glGetAttribLocation, "emscripten_glGetBooleanv": _emscripten_glGetBooleanv, "emscripten_glGetBufferParameteri64v": _emscripten_glGetBufferParameteri64v, "emscripten_glGetBufferParameteriv": _emscripten_glGetBufferParameteriv, "emscripten_glGetBufferPointerv": _emscripten_glGetBufferPointerv, "emscripten_glGetError": _emscripten_glGetError, "emscripten_glGetFloatv": _emscripten_glGetFloatv, "emscripten_glGetFragDataLocation": _emscripten_glGetFragDataLocation, "emscripten_glGetFramebufferAttachmentParameteriv": _emscripten_glGetFramebufferAttachmentParameteriv, "emscripten_glGetInteger64i_v": _emscripten_glGetInteger64i_v, "emscripten_glGetInteger64v": _emscripten_glGetInteger64v, "emscripten_glGetIntegeri_v": _emscripten_glGetIntegeri_v, "emscripten_glGetIntegerv": _emscripten_glGetIntegerv, "emscripten_glGetInternalformativ": _emscripten_glGetInternalformativ, "emscripten_glGetProgramBinary": _emscripten_glGetProgramBinary, "emscripten_glGetProgramInfoLog": _emscripten_glGetProgramInfoLog, "emscripten_glGetProgramiv": _emscripten_glGetProgramiv, "emscripten_glGetQueryObjecti64vEXT": _emscripten_glGetQueryObjecti64vEXT, "emscripten_glGetQueryObjectivEXT": _emscripten_glGetQueryObjectivEXT, "emscripten_glGetQueryObjectui64vEXT": _emscripten_glGetQueryObjectui64vEXT, "emscripten_glGetQueryObjectuiv": _emscripten_glGetQueryObjectuiv, "emscripten_glGetQueryObjectuivEXT": _emscripten_glGetQueryObjectuivEXT, "emscripten_glGetQueryiv": _emscripten_glGetQueryiv, "emscripten_glGetQueryivEXT": _emscripten_glGetQueryivEXT, "emscripten_glGetRenderbufferParameteriv": _emscripten_glGetRenderbufferParameteriv, "emscripten_glGetSamplerParameterfv": _emscripten_glGetSamplerParameterfv, "emscripten_glGetSamplerParameteriv": _emscripten_glGetSamplerParameteriv, "emscripten_glGetShaderInfoLog": _emscripten_glGetShaderInfoLog, "emscripten_glGetShaderPrecisionFormat": _emscripten_glGetShaderPrecisionFormat, "emscripten_glGetShaderSource": _emscripten_glGetShaderSource, "emscripten_glGetShaderiv": _emscripten_glGetShaderiv, "emscripten_glGetString": _emscripten_glGetString, "emscripten_glGetStringi": _emscripten_glGetStringi, "emscripten_glGetSynciv": _emscripten_glGetSynciv, "emscripten_glGetTexParameterfv": _emscripten_glGetTexParameterfv, "emscripten_glGetTexParameteriv": _emscripten_glGetTexParameteriv, "emscripten_glGetTransformFeedbackVarying": _emscripten_glGetTransformFeedbackVarying, "emscripten_glGetUniformBlockIndex": _emscripten_glGetUniformBlockIndex, "emscripten_glGetUniformIndices": _emscripten_glGetUniformIndices, "emscripten_glGetUniformLocation": _emscripten_glGetUniformLocation, "emscripten_glGetUniformfv": _emscripten_glGetUniformfv, "emscripten_glGetUniformiv": _emscripten_glGetUniformiv, "emscripten_glGetUniformuiv": _emscripten_glGetUniformuiv, "emscripten_glGetVertexAttribIiv": _emscripten_glGetVertexAttribIiv, "emscripten_glGetVertexAttribIuiv": _emscripten_glGetVertexAttribIuiv, "emscripten_glGetVertexAttribPointerv": _emscripten_glGetVertexAttribPointerv, "emscripten_glGetVertexAttribfv": _emscripten_glGetVertexAttribfv, "emscripten_glGetVertexAttribiv": _emscripten_glGetVertexAttribiv, "emscripten_glHint": _emscripten_glHint, "emscripten_glInvalidateFramebuffer": _emscripten_glInvalidateFramebuffer, "emscripten_glInvalidateSubFramebuffer": _emscripten_glInvalidateSubFramebuffer, "emscripten_glIsBuffer": _emscripten_glIsBuffer, "emscripten_glIsEnabled": _emscripten_glIsEnabled, "emscripten_glIsFramebuffer": _emscripten_glIsFramebuffer, "emscripten_glIsProgram": _emscripten_glIsProgram, "emscripten_glIsQuery": _emscripten_glIsQuery, "emscripten_glIsQueryEXT": _emscripten_glIsQueryEXT, "emscripten_glIsRenderbuffer": _emscripten_glIsRenderbuffer, "emscripten_glIsSampler": _emscripten_glIsSampler, "emscripten_glIsShader": _emscripten_glIsShader, "emscripten_glIsSync": _emscripten_glIsSync, "emscripten_glIsTexture": _emscripten_glIsTexture, "emscripten_glIsTransformFeedback": _emscripten_glIsTransformFeedback, "emscripten_glIsVertexArray": _emscripten_glIsVertexArray, "emscripten_glIsVertexArrayOES": _emscripten_glIsVertexArrayOES, "emscripten_glLineWidth": _emscripten_glLineWidth, "emscripten_glLinkProgram": _emscripten_glLinkProgram, "emscripten_glMapBufferRange": _emscripten_glMapBufferRange, "emscripten_glPauseTransformFeedback": _emscripten_glPauseTransformFeedback, "emscripten_glPixelStorei": _emscripten_glPixelStorei, "emscripten_glPolygonOffset": _emscripten_glPolygonOffset, "emscripten_glProgramBinary": _emscripten_glProgramBinary, "emscripten_glProgramParameteri": _emscripten_glProgramParameteri, "emscripten_glQueryCounterEXT": _emscripten_glQueryCounterEXT, "emscripten_glReadBuffer": _emscripten_glReadBuffer, "emscripten_glReadPixels": _emscripten_glReadPixels, "emscripten_glReleaseShaderCompiler": _emscripten_glReleaseShaderCompiler, "emscripten_glRenderbufferStorage": _emscripten_glRenderbufferStorage, "emscripten_glRenderbufferStorageMultisample": _emscripten_glRenderbufferStorageMultisample, "emscripten_glResumeTransformFeedback": _emscripten_glResumeTransformFeedback, "emscripten_glSampleCoverage": _emscripten_glSampleCoverage, "emscripten_glSamplerParameterf": _emscripten_glSamplerParameterf, "emscripten_glSamplerParameterfv": _emscripten_glSamplerParameterfv, "emscripten_glSamplerParameteri": _emscripten_glSamplerParameteri, "emscripten_glSamplerParameteriv": _emscripten_glSamplerParameteriv, "emscripten_glScissor": _emscripten_glScissor, "emscripten_glShaderBinary": _emscripten_glShaderBinary, "emscripten_glShaderSource": _emscripten_glShaderSource, "emscripten_glStencilFunc": _emscripten_glStencilFunc, "emscripten_glStencilFuncSeparate": _emscripten_glStencilFuncSeparate, "emscripten_glStencilMask": _emscripten_glStencilMask, "emscripten_glStencilMaskSeparate": _emscripten_glStencilMaskSeparate, "emscripten_glStencilOp": _emscripten_glStencilOp, "emscripten_glStencilOpSeparate": _emscripten_glStencilOpSeparate, "emscripten_glTexImage2D": _emscripten_glTexImage2D, "emscripten_glTexImage3D": _emscripten_glTexImage3D, "emscripten_glTexParameterf": _emscripten_glTexParameterf, "emscripten_glTexParameterfv": _emscripten_glTexParameterfv, "emscripten_glTexParameteri": _emscripten_glTexParameteri, "emscripten_glTexParameteriv": _emscripten_glTexParameteriv, "emscripten_glTexStorage2D": _emscripten_glTexStorage2D, "emscripten_glTexStorage3D": _emscripten_glTexStorage3D, "emscripten_glTexSubImage2D": _emscripten_glTexSubImage2D, "emscripten_glTexSubImage3D": _emscripten_glTexSubImage3D, "emscripten_glTransformFeedbackVaryings": _emscripten_glTransformFeedbackVaryings, "emscripten_glUniform1f": _emscripten_glUniform1f, "emscripten_glUniform1fv": _emscripten_glUniform1fv, "emscripten_glUniform1i": _emscripten_glUniform1i, "emscripten_glUniform1iv": _emscripten_glUniform1iv, "emscripten_glUniform1ui": _emscripten_glUniform1ui, "emscripten_glUniform1uiv": _emscripten_glUniform1uiv, "emscripten_glUniform2f": _emscripten_glUniform2f, "emscripten_glUniform2fv": _emscripten_glUniform2fv, "emscripten_glUniform2i": _emscripten_glUniform2i, "emscripten_glUniform2iv": _emscripten_glUniform2iv, "emscripten_glUniform2ui": _emscripten_glUniform2ui, "emscripten_glUniform2uiv": _emscripten_glUniform2uiv, "emscripten_glUniform3f": _emscripten_glUniform3f, "emscripten_glUniform3fv": _emscripten_glUniform3fv, "emscripten_glUniform3i": _emscripten_glUniform3i, "emscripten_glUniform3iv": _emscripten_glUniform3iv, "emscripten_glUniform3ui": _emscripten_glUniform3ui, "emscripten_glUniform3uiv": _emscripten_glUniform3uiv, "emscripten_glUniform4f": _emscripten_glUniform4f, "emscripten_glUniform4fv": _emscripten_glUniform4fv, "emscripten_glUniform4i": _emscripten_glUniform4i, "emscripten_glUniform4iv": _emscripten_glUniform4iv, "emscripten_glUniform4ui": _emscripten_glUniform4ui, "emscripten_glUniform4uiv": _emscripten_glUniform4uiv, "emscripten_glUniformBlockBinding": _emscripten_glUniformBlockBinding, "emscripten_glUniformMatrix2fv": _emscripten_glUniformMatrix2fv, "emscripten_glUniformMatrix2x3fv": _emscripten_glUniformMatrix2x3fv, "emscripten_glUniformMatrix2x4fv": _emscripten_glUniformMatrix2x4fv, "emscripten_glUniformMatrix3fv": _emscripten_glUniformMatrix3fv, "emscripten_glUniformMatrix3x2fv": _emscripten_glUniformMatrix3x2fv, "emscripten_glUniformMatrix3x4fv": _emscripten_glUniformMatrix3x4fv, "emscripten_glUniformMatrix4fv": _emscripten_glUniformMatrix4fv, "emscripten_glUniformMatrix4x2fv": _emscripten_glUniformMatrix4x2fv, "emscripten_glUniformMatrix4x3fv": _emscripten_glUniformMatrix4x3fv, "emscripten_glUnmapBuffer": _emscripten_glUnmapBuffer, "emscripten_glUseProgram": _emscripten_glUseProgram, "emscripten_glValidateProgram": _emscripten_glValidateProgram, "emscripten_glVertexAttrib1f": _emscripten_glVertexAttrib1f, "emscripten_glVertexAttrib1fv": _emscripten_glVertexAttrib1fv, "emscripten_glVertexAttrib2f": _emscripten_glVertexAttrib2f, "emscripten_glVertexAttrib2fv": _emscripten_glVertexAttrib2fv, "emscripten_glVertexAttrib3f": _emscripten_glVertexAttrib3f, "emscripten_glVertexAttrib3fv": _emscripten_glVertexAttrib3fv, "emscripten_glVertexAttrib4f": _emscripten_glVertexAttrib4f, "emscripten_glVertexAttrib4fv": _emscripten_glVertexAttrib4fv, "emscripten_glVertexAttribDivisor": _emscripten_glVertexAttribDivisor, "emscripten_glVertexAttribDivisorANGLE": _emscripten_glVertexAttribDivisorANGLE, "emscripten_glVertexAttribDivisorARB": _emscripten_glVertexAttribDivisorARB, "emscripten_glVertexAttribDivisorEXT": _emscripten_glVertexAttribDivisorEXT, "emscripten_glVertexAttribDivisorNV": _emscripten_glVertexAttribDivisorNV, "emscripten_glVertexAttribI4i": _emscripten_glVertexAttribI4i, "emscripten_glVertexAttribI4iv": _emscripten_glVertexAttribI4iv, "emscripten_glVertexAttribI4ui": _emscripten_glVertexAttribI4ui, "emscripten_glVertexAttribI4uiv": _emscripten_glVertexAttribI4uiv, "emscripten_glVertexAttribIPointer": _emscripten_glVertexAttribIPointer, "emscripten_glVertexAttribPointer": _emscripten_glVertexAttribPointer, "emscripten_glViewport": _emscripten_glViewport, "emscripten_glWaitSync": _emscripten_glWaitSync, "emscripten_has_asyncify": _emscripten_has_asyncify, "emscripten_memcpy_big": _emscripten_memcpy_big, "emscripten_request_fullscreen_strategy": _emscripten_request_fullscreen_strategy, "emscripten_request_pointerlock": _emscripten_request_pointerlock, "emscripten_resize_heap": _emscripten_resize_heap, "emscripten_sample_gamepad_data": _emscripten_sample_gamepad_data, "emscripten_set_beforeunload_callback_on_thread": _emscripten_set_beforeunload_callback_on_thread, "emscripten_set_blur_callback_on_thread": _emscripten_set_blur_callback_on_thread, "emscripten_set_canvas_element_size": _emscripten_set_canvas_element_size, "emscripten_set_element_css_size": _emscripten_set_element_css_size, "emscripten_set_focus_callback_on_thread": _emscripten_set_focus_callback_on_thread, "emscripten_set_fullscreenchange_callback_on_thread": _emscripten_set_fullscreenchange_callback_on_thread, "emscripten_set_gamepadconnected_callback_on_thread": _emscripten_set_gamepadconnected_callback_on_thread, "emscripten_set_gamepaddisconnected_callback_on_thread": _emscripten_set_gamepaddisconnected_callback_on_thread, "emscripten_set_keydown_callback_on_thread": _emscripten_set_keydown_callback_on_thread, "emscripten_set_keypress_callback_on_thread": _emscripten_set_keypress_callback_on_thread, "emscripten_set_keyup_callback_on_thread": _emscripten_set_keyup_callback_on_thread, "emscripten_set_main_loop_arg": _emscripten_set_main_loop_arg, "emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "emscripten_set_mousedown_callback_on_thread": _emscripten_set_mousedown_callback_on_thread, "emscripten_set_mouseenter_callback_on_thread": _emscripten_set_mouseenter_callback_on_thread, "emscripten_set_mouseleave_callback_on_thread": _emscripten_set_mouseleave_callback_on_thread, "emscripten_set_mousemove_callback_on_thread": _emscripten_set_mousemove_callback_on_thread, "emscripten_set_mouseup_callback_on_thread": _emscripten_set_mouseup_callback_on_thread, "emscripten_set_pointerlockchange_callback_on_thread": _emscripten_set_pointerlockchange_callback_on_thread, "emscripten_set_resize_callback_on_thread": _emscripten_set_resize_callback_on_thread, "emscripten_set_touchcancel_callback_on_thread": _emscripten_set_touchcancel_callback_on_thread, "emscripten_set_touchend_callback_on_thread": _emscripten_set_touchend_callback_on_thread, "emscripten_set_touchmove_callback_on_thread": _emscripten_set_touchmove_callback_on_thread, "emscripten_set_touchstart_callback_on_thread": _emscripten_set_touchstart_callback_on_thread, "emscripten_set_visibilitychange_callback_on_thread": _emscripten_set_visibilitychange_callback_on_thread, "emscripten_set_wheel_callback_on_thread": _emscripten_set_wheel_callback_on_thread, "emscripten_set_window_title": _emscripten_set_window_title, "emscripten_sleep": _emscripten_sleep, "endStats": _endStats, "environ_get": _environ_get, "environ_sizes_get": _environ_sizes_get, "exit": _exit, "fd_close": _fd_close, "fd_read": _fd_read, "fd_seek": _fd_seek, "fd_write": _fd_write, "findAutoInputConfigName": _findAutoInputConfigName, "glActiveTexture": _glActiveTexture, "glAttachShader": _glAttachShader, "glBindAttribLocation": _glBindAttribLocation, "glBindBuffer": _glBindBuffer, "glBindTexture": _glBindTexture, "glBlendFunc": _glBlendFunc, "glBufferData": _glBufferData, "glBufferSubData": _glBufferSubData, "glClear": _glClear, "glClearColor": _glClearColor, "glClearDepthf": _glClearDepthf, "glCompileShader": _glCompileShader, "glCreateProgram": _glCreateProgram, "glCreateShader": _glCreateShader, "glCullFace": _glCullFace, "glDeleteProgram": _glDeleteProgram, "glDeleteShader": _glDeleteShader, "glDeleteTextures": _glDeleteTextures, "glDepthFunc": _glDepthFunc, "glDepthMask": _glDepthMask, "glDepthRangef": _glDepthRangef, "glDetachShader": _glDetachShader, "glDisable": _glDisable, "glDisableVertexAttribArray": _glDisableVertexAttribArray, "glDrawArrays": _glDrawArrays, "glDrawElements": _glDrawElements, "glEnable": _glEnable, "glEnableVertexAttribArray": _glEnableVertexAttribArray, "glFinish": _glFinish, "glFlush": _glFlush, "glFrontFace": _glFrontFace, "glGenBuffers": _glGenBuffers, "glGenTextures": _glGenTextures, "glGenerateMipmap": _glGenerateMipmap, "glGetIntegerv": _glGetIntegerv, "glGetProgramInfoLog": _glGetProgramInfoLog, "glGetProgramiv": _glGetProgramiv, "glGetShaderInfoLog": _glGetShaderInfoLog, "glGetShaderiv": _glGetShaderiv, "glGetString": _glGetString, "glGetTexParameteriv": _glGetTexParameteriv, "glGetUniformLocation": _glGetUniformLocation, "glIsEnabled": _glIsEnabled, "glIsProgram": _glIsProgram, "glIsShader": _glIsShader, "glLinkProgram": _glLinkProgram, "glPolygonOffset": _glPolygonOffset, "glReadPixels": _glReadPixels, "glScissor": _glScissor, "glShaderSource": _glShaderSource, "glTexImage2D": _glTexImage2D, "glTexParameteri": _glTexParameteri, "glTexSubImage2D": _glTexSubImage2D, "glUniform1f": _glUniform1f, "glUniform1i": _glUniform1i, "glUniform2f": _glUniform2f, "glUniform3f": _glUniform3f, "glUniform4f": _glUniform4f, "glUseProgram": _glUseProgram, "glVertexAttribPointer": _glVertexAttribPointer, "glViewport": _glViewport, "initIDBFS": initIDBFS, "initWasmRecompiler": _initWasmRecompiler, "invoke_ii": invoke_ii, "invoke_iii": invoke_iii, "invoke_iiii": invoke_iiii, "invoke_iiiii": invoke_iiiii, "invoke_iiiiii": invoke_iiiiii, "invoke_iiiiiiiiii": invoke_iiiiiiiiii, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viii": invoke_viii, "invoke_viiii": invoke_viiii, "invoke_viiiiiiiii": invoke_viiiiiiiii, "loadRomConfigOptionOverride": loadRomConfigOptionOverride, "netplayInit": _netplayInit, "requestFileSync": _requestFileSync, "sendReliableMessage": _sendReliableMessage, "sendUnreliableMessage": _sendUnreliableMessage, "startCore": startCore, "strftime_l": _strftime_l, "waitForReliableMessage": _waitForReliableMessage, "wasmReleaseBlock": _wasmReleaseBlock, "writeROM": writeROM };
        var asm = createWasm();
        var ___wasm_call_ctors = Module2["___wasm_call_ctors"] = function() {
          return (___wasm_call_ctors = Module2["___wasm_call_ctors"] = Module2["asm"]["__wasm_call_ctors"]).apply(null, arguments);
        };
        var _malloc = Module2["_malloc"] = function() {
          return (_malloc = Module2["_malloc"] = Module2["asm"]["malloc"]).apply(null, arguments);
        };
        var _free = Module2["_free"] = function() {
          return (_free = Module2["_free"] = Module2["asm"]["free"]).apply(null, arguments);
        };
        var _main = Module2["_main"] = function() {
          return (_main = Module2["_main"] = Module2["asm"]["__main_argc_argv"]).apply(null, arguments);
        };
        var _start = Module2["_start"] = function() {
          return (_start = Module2["_start"] = Module2["asm"]["start"]).apply(null, arguments);
        };
        var _startEmulator = Module2["_startEmulator"] = function() {
          return (_startEmulator = Module2["_startEmulator"] = Module2["asm"]["startEmulator"]).apply(null, arguments);
        };
        var _pauseEmulator = Module2["_pauseEmulator"] = function() {
          return (_pauseEmulator = Module2["_pauseEmulator"] = Module2["asm"]["pauseEmulator"]).apply(null, arguments);
        };
        var _resumeEmulator = Module2["_resumeEmulator"] = function() {
          return (_resumeEmulator = Module2["_resumeEmulator"] = Module2["asm"]["resumeEmulator"]).apply(null, arguments);
        };
        var _stopEmulator = Module2["_stopEmulator"] = function() {
          return (_stopEmulator = Module2["_stopEmulator"] = Module2["asm"]["stopEmulator"]).apply(null, arguments);
        };
        var _memcpy = Module2["_memcpy"] = function() {
          return (_memcpy = Module2["_memcpy"] = Module2["asm"]["memcpy"]).apply(null, arguments);
        };
        var _dump_save_files = Module2["_dump_save_files"] = function() {
          return (_dump_save_files = Module2["_dump_save_files"] = Module2["asm"]["dump_save_files"]).apply(null, arguments);
        };
        var ___errno_location = Module2["___errno_location"] = function() {
          return (___errno_location = Module2["___errno_location"] = Module2["asm"]["__errno_location"]).apply(null, arguments);
        };
        var _saveSetjmp = Module2["_saveSetjmp"] = function() {
          return (_saveSetjmp = Module2["_saveSetjmp"] = Module2["asm"]["saveSetjmp"]).apply(null, arguments);
        };
        var _netplay_request_input = Module2["_netplay_request_input"] = function() {
          return (_netplay_request_input = Module2["_netplay_request_input"] = Module2["asm"]["netplay_request_input"]).apply(null, arguments);
        };
        var _check_valid = Module2["_check_valid"] = function() {
          return (_check_valid = Module2["_check_valid"] = Module2["asm"]["check_valid"]).apply(null, arguments);
        };
        var _process_udp_packet = Module2["_process_udp_packet"] = function() {
          return (_process_udp_packet = Module2["_process_udp_packet"] = Module2["asm"]["process_udp_packet"]).apply(null, arguments);
        };
        var _netplay_request_pause = Module2["_netplay_request_pause"] = function() {
          return (_netplay_request_pause = Module2["_netplay_request_pause"] = Module2["asm"]["netplay_request_pause"]).apply(null, arguments);
        };
        var _netplay_request_resume = Module2["_netplay_request_resume"] = function() {
          return (_netplay_request_resume = Module2["_netplay_request_resume"] = Module2["asm"]["netplay_request_resume"]).apply(null, arguments);
        };
        var ___dl_seterr = Module2["___dl_seterr"] = function() {
          return (___dl_seterr = Module2["___dl_seterr"] = Module2["asm"]["__dl_seterr"]).apply(null, arguments);
        };
        var _emscripten_builtin_memalign = Module2["_emscripten_builtin_memalign"] = function() {
          return (_emscripten_builtin_memalign = Module2["_emscripten_builtin_memalign"] = Module2["asm"]["emscripten_builtin_memalign"]).apply(null, arguments);
        };
        var _setThrew = Module2["_setThrew"] = function() {
          return (_setThrew = Module2["_setThrew"] = Module2["asm"]["setThrew"]).apply(null, arguments);
        };
        var _emscripten_stack_set_limits = Module2["_emscripten_stack_set_limits"] = function() {
          return (_emscripten_stack_set_limits = Module2["_emscripten_stack_set_limits"] = Module2["asm"]["emscripten_stack_set_limits"]).apply(null, arguments);
        };
        var _emscripten_stack_get_base = Module2["_emscripten_stack_get_base"] = function() {
          return (_emscripten_stack_get_base = Module2["_emscripten_stack_get_base"] = Module2["asm"]["emscripten_stack_get_base"]).apply(null, arguments);
        };
        var _emscripten_stack_get_end = Module2["_emscripten_stack_get_end"] = function() {
          return (_emscripten_stack_get_end = Module2["_emscripten_stack_get_end"] = Module2["asm"]["emscripten_stack_get_end"]).apply(null, arguments);
        };
        var stackSave = Module2["stackSave"] = function() {
          return (stackSave = Module2["stackSave"] = Module2["asm"]["stackSave"]).apply(null, arguments);
        };
        var stackRestore = Module2["stackRestore"] = function() {
          return (stackRestore = Module2["stackRestore"] = Module2["asm"]["stackRestore"]).apply(null, arguments);
        };
        var stackAlloc = Module2["stackAlloc"] = function() {
          return (stackAlloc = Module2["stackAlloc"] = Module2["asm"]["stackAlloc"]).apply(null, arguments);
        };
        var ___cxa_demangle = Module2["___cxa_demangle"] = function() {
          return (___cxa_demangle = Module2["___cxa_demangle"] = Module2["asm"]["__cxa_demangle"]).apply(null, arguments);
        };
        var ___cxa_is_pointer_type = Module2["___cxa_is_pointer_type"] = function() {
          return (___cxa_is_pointer_type = Module2["___cxa_is_pointer_type"] = Module2["asm"]["__cxa_is_pointer_type"]).apply(null, arguments);
        };
        var dynCall_vi = Module2["dynCall_vi"] = function() {
          return (dynCall_vi = Module2["dynCall_vi"] = Module2["asm"]["dynCall_vi"]).apply(null, arguments);
        };
        var dynCall_vii = Module2["dynCall_vii"] = function() {
          return (dynCall_vii = Module2["dynCall_vii"] = Module2["asm"]["dynCall_vii"]).apply(null, arguments);
        };
        var dynCall_v = Module2["dynCall_v"] = function() {
          return (dynCall_v = Module2["dynCall_v"] = Module2["asm"]["dynCall_v"]).apply(null, arguments);
        };
        var dynCall_viii = Module2["dynCall_viii"] = function() {
          return (dynCall_viii = Module2["dynCall_viii"] = Module2["asm"]["dynCall_viii"]).apply(null, arguments);
        };
        var dynCall_ii = Module2["dynCall_ii"] = function() {
          return (dynCall_ii = Module2["dynCall_ii"] = Module2["asm"]["dynCall_ii"]).apply(null, arguments);
        };
        var dynCall_iii = Module2["dynCall_iii"] = function() {
          return (dynCall_iii = Module2["dynCall_iii"] = Module2["asm"]["dynCall_iii"]).apply(null, arguments);
        };
        var dynCall_iiiiiiii = Module2["dynCall_iiiiiiii"] = function() {
          return (dynCall_iiiiiiii = Module2["dynCall_iiiiiiii"] = Module2["asm"]["dynCall_iiiiiiii"]).apply(null, arguments);
        };
        var dynCall_iiiii = Module2["dynCall_iiiii"] = function() {
          return (dynCall_iiiii = Module2["dynCall_iiiii"] = Module2["asm"]["dynCall_iiiii"]).apply(null, arguments);
        };
        var dynCall_viiii = Module2["dynCall_viiii"] = function() {
          return (dynCall_viiii = Module2["dynCall_viiii"] = Module2["asm"]["dynCall_viiii"]).apply(null, arguments);
        };
        var dynCall_viiiii = Module2["dynCall_viiiii"] = function() {
          return (dynCall_viiiii = Module2["dynCall_viiiii"] = Module2["asm"]["dynCall_viiiii"]).apply(null, arguments);
        };
        var dynCall_iiiiii = Module2["dynCall_iiiiii"] = function() {
          return (dynCall_iiiiii = Module2["dynCall_iiiiii"] = Module2["asm"]["dynCall_iiiiii"]).apply(null, arguments);
        };
        var dynCall_ji = Module2["dynCall_ji"] = function() {
          return (dynCall_ji = Module2["dynCall_ji"] = Module2["asm"]["dynCall_ji"]).apply(null, arguments);
        };
        var dynCall_iiii = Module2["dynCall_iiii"] = function() {
          return (dynCall_iiii = Module2["dynCall_iiii"] = Module2["asm"]["dynCall_iiii"]).apply(null, arguments);
        };
        var dynCall_viiiiiiiii = Module2["dynCall_viiiiiiiii"] = function() {
          return (dynCall_viiiiiiiii = Module2["dynCall_viiiiiiiii"] = Module2["asm"]["dynCall_viiiiiiiii"]).apply(null, arguments);
        };
        var dynCall_i = Module2["dynCall_i"] = function() {
          return (dynCall_i = Module2["dynCall_i"] = Module2["asm"]["dynCall_i"]).apply(null, arguments);
        };
        var dynCall_iiijj = Module2["dynCall_iiijj"] = function() {
          return (dynCall_iiijj = Module2["dynCall_iiijj"] = Module2["asm"]["dynCall_iiijj"]).apply(null, arguments);
        };
        var dynCall_iiiji = Module2["dynCall_iiiji"] = function() {
          return (dynCall_iiiji = Module2["dynCall_iiiji"] = Module2["asm"]["dynCall_iiiji"]).apply(null, arguments);
        };
        var dynCall_jii = Module2["dynCall_jii"] = function() {
          return (dynCall_jii = Module2["dynCall_jii"] = Module2["asm"]["dynCall_jii"]).apply(null, arguments);
        };
        var dynCall_viiiiiiiiiiiiii = Module2["dynCall_viiiiiiiiiiiiii"] = function() {
          return (dynCall_viiiiiiiiiiiiii = Module2["dynCall_viiiiiiiiiiiiii"] = Module2["asm"]["dynCall_viiiiiiiiiiiiii"]).apply(null, arguments);
        };
        var dynCall_viiiiiiiiiiii = Module2["dynCall_viiiiiiiiiiii"] = function() {
          return (dynCall_viiiiiiiiiiii = Module2["dynCall_viiiiiiiiiiii"] = Module2["asm"]["dynCall_viiiiiiiiiiii"]).apply(null, arguments);
        };
        var dynCall_viiif = Module2["dynCall_viiif"] = function() {
          return (dynCall_viiif = Module2["dynCall_viiif"] = Module2["asm"]["dynCall_viiif"]).apply(null, arguments);
        };
        var dynCall_viiiiii = Module2["dynCall_viiiiii"] = function() {
          return (dynCall_viiiiii = Module2["dynCall_viiiiii"] = Module2["asm"]["dynCall_viiiiii"]).apply(null, arguments);
        };
        var dynCall_vif = Module2["dynCall_vif"] = function() {
          return (dynCall_vif = Module2["dynCall_vif"] = Module2["asm"]["dynCall_vif"]).apply(null, arguments);
        };
        var dynCall_iiiiiii = Module2["dynCall_iiiiiii"] = function() {
          return (dynCall_iiiiiii = Module2["dynCall_iiiiiii"] = Module2["asm"]["dynCall_iiiiiii"]).apply(null, arguments);
        };
        var dynCall_viiiiiiii = Module2["dynCall_viiiiiiii"] = function() {
          return (dynCall_viiiiiiii = Module2["dynCall_viiiiiiii"] = Module2["asm"]["dynCall_viiiiiiii"]).apply(null, arguments);
        };
        var dynCall_viffffffffiff = Module2["dynCall_viffffffffiff"] = function() {
          return (dynCall_viffffffffiff = Module2["dynCall_viffffffffiff"] = Module2["asm"]["dynCall_viffffffffiff"]).apply(null, arguments);
        };
        var dynCall_iiif = Module2["dynCall_iiif"] = function() {
          return (dynCall_iiif = Module2["dynCall_iiif"] = Module2["asm"]["dynCall_iiif"]).apply(null, arguments);
        };
        var dynCall_viiiiiiff = Module2["dynCall_viiiiiiff"] = function() {
          return (dynCall_viiiiiiff = Module2["dynCall_viiiiiiff"] = Module2["asm"]["dynCall_viiiiiiff"]).apply(null, arguments);
        };
        var dynCall_iiiiiiiiii = Module2["dynCall_iiiiiiiiii"] = function() {
          return (dynCall_iiiiiiiiii = Module2["dynCall_iiiiiiiiii"] = Module2["asm"]["dynCall_iiiiiiiiii"]).apply(null, arguments);
        };
        var dynCall_jiji = Module2["dynCall_jiji"] = function() {
          return (dynCall_jiji = Module2["dynCall_jiji"] = Module2["asm"]["dynCall_jiji"]).apply(null, arguments);
        };
        var dynCall_vffff = Module2["dynCall_vffff"] = function() {
          return (dynCall_vffff = Module2["dynCall_vffff"] = Module2["asm"]["dynCall_vffff"]).apply(null, arguments);
        };
        var dynCall_vf = Module2["dynCall_vf"] = function() {
          return (dynCall_vf = Module2["dynCall_vf"] = Module2["asm"]["dynCall_vf"]).apply(null, arguments);
        };
        var dynCall_vff = Module2["dynCall_vff"] = function() {
          return (dynCall_vff = Module2["dynCall_vff"] = Module2["asm"]["dynCall_vff"]).apply(null, arguments);
        };
        var dynCall_viiiiiii = Module2["dynCall_viiiiiii"] = function() {
          return (dynCall_viiiiiii = Module2["dynCall_viiiiiii"] = Module2["asm"]["dynCall_viiiiiii"]).apply(null, arguments);
        };
        var dynCall_vfi = Module2["dynCall_vfi"] = function() {
          return (dynCall_vfi = Module2["dynCall_vfi"] = Module2["asm"]["dynCall_vfi"]).apply(null, arguments);
        };
        var dynCall_viif = Module2["dynCall_viif"] = function() {
          return (dynCall_viif = Module2["dynCall_viif"] = Module2["asm"]["dynCall_viif"]).apply(null, arguments);
        };
        var dynCall_viff = Module2["dynCall_viff"] = function() {
          return (dynCall_viff = Module2["dynCall_viff"] = Module2["asm"]["dynCall_viff"]).apply(null, arguments);
        };
        var dynCall_vifff = Module2["dynCall_vifff"] = function() {
          return (dynCall_vifff = Module2["dynCall_vifff"] = Module2["asm"]["dynCall_vifff"]).apply(null, arguments);
        };
        var dynCall_viffff = Module2["dynCall_viffff"] = function() {
          return (dynCall_viffff = Module2["dynCall_viffff"] = Module2["asm"]["dynCall_viffff"]).apply(null, arguments);
        };
        var dynCall_viiiiiiiiii = Module2["dynCall_viiiiiiiiii"] = function() {
          return (dynCall_viiiiiiiiii = Module2["dynCall_viiiiiiiiii"] = Module2["asm"]["dynCall_viiiiiiiiii"]).apply(null, arguments);
        };
        var dynCall_viiiiiiiiiii = Module2["dynCall_viiiiiiiiiii"] = function() {
          return (dynCall_viiiiiiiiiii = Module2["dynCall_viiiiiiiiiii"] = Module2["asm"]["dynCall_viiiiiiiiiii"]).apply(null, arguments);
        };
        var dynCall_viifi = Module2["dynCall_viifi"] = function() {
          return (dynCall_viifi = Module2["dynCall_viifi"] = Module2["asm"]["dynCall_viifi"]).apply(null, arguments);
        };
        var dynCall_iidiiii = Module2["dynCall_iidiiii"] = function() {
          return (dynCall_iidiiii = Module2["dynCall_iidiiii"] = Module2["asm"]["dynCall_iidiiii"]).apply(null, arguments);
        };
        var dynCall_viijii = Module2["dynCall_viijii"] = function() {
          return (dynCall_viijii = Module2["dynCall_viijii"] = Module2["asm"]["dynCall_viijii"]).apply(null, arguments);
        };
        var dynCall_iiiiiiiii = Module2["dynCall_iiiiiiiii"] = function() {
          return (dynCall_iiiiiiiii = Module2["dynCall_iiiiiiiii"] = Module2["asm"]["dynCall_iiiiiiiii"]).apply(null, arguments);
        };
        var dynCall_iiiiij = Module2["dynCall_iiiiij"] = function() {
          return (dynCall_iiiiij = Module2["dynCall_iiiiij"] = Module2["asm"]["dynCall_iiiiij"]).apply(null, arguments);
        };
        var dynCall_iiiiid = Module2["dynCall_iiiiid"] = function() {
          return (dynCall_iiiiid = Module2["dynCall_iiiiid"] = Module2["asm"]["dynCall_iiiiid"]).apply(null, arguments);
        };
        var dynCall_iiiiijj = Module2["dynCall_iiiiijj"] = function() {
          return (dynCall_iiiiijj = Module2["dynCall_iiiiijj"] = Module2["asm"]["dynCall_iiiiijj"]).apply(null, arguments);
        };
        var dynCall_iiiiiijj = Module2["dynCall_iiiiiijj"] = function() {
          return (dynCall_iiiiiijj = Module2["dynCall_iiiiiijj"] = Module2["asm"]["dynCall_iiiiiijj"]).apply(null, arguments);
        };
        var _asyncify_start_unwind = Module2["_asyncify_start_unwind"] = function() {
          return (_asyncify_start_unwind = Module2["_asyncify_start_unwind"] = Module2["asm"]["asyncify_start_unwind"]).apply(null, arguments);
        };
        var _asyncify_stop_unwind = Module2["_asyncify_stop_unwind"] = function() {
          return (_asyncify_stop_unwind = Module2["_asyncify_stop_unwind"] = Module2["asm"]["asyncify_stop_unwind"]).apply(null, arguments);
        };
        var _asyncify_start_rewind = Module2["_asyncify_start_rewind"] = function() {
          return (_asyncify_start_rewind = Module2["_asyncify_start_rewind"] = Module2["asm"]["asyncify_start_rewind"]).apply(null, arguments);
        };
        var _asyncify_stop_rewind = Module2["_asyncify_stop_rewind"] = function() {
          return (_asyncify_stop_rewind = Module2["_asyncify_stop_rewind"] = Module2["asm"]["asyncify_stop_rewind"]).apply(null, arguments);
        };
        var ___start_em_js = Module2["___start_em_js"] = 1731320;
        var ___stop_em_js = Module2["___stop_em_js"] = 1733464;
        function invoke_iiiii(index, a1, a2, a3, a4) {
          var sp = stackSave();
          try {
            return dynCall_iiiii(index, a1, a2, a3, a4);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        function invoke_viii(index, a1, a2, a3) {
          var sp = stackSave();
          try {
            dynCall_viii(index, a1, a2, a3);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        function invoke_ii(index, a1) {
          var sp = stackSave();
          try {
            return dynCall_ii(index, a1);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        function invoke_vii(index, a1, a2) {
          var sp = stackSave();
          try {
            dynCall_vii(index, a1, a2);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        function invoke_iiii(index, a1, a2, a3) {
          var sp = stackSave();
          try {
            return dynCall_iiii(index, a1, a2, a3);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        function invoke_iii(index, a1, a2) {
          var sp = stackSave();
          try {
            return dynCall_iii(index, a1, a2);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        function invoke_viiii(index, a1, a2, a3, a4) {
          var sp = stackSave();
          try {
            dynCall_viiii(index, a1, a2, a3, a4);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        function invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
          var sp = stackSave();
          try {
            dynCall_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        function invoke_vi(index, a1) {
          var sp = stackSave();
          try {
            dynCall_vi(index, a1);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        function invoke_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
          var sp = stackSave();
          try {
            return dynCall_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
          var sp = stackSave();
          try {
            return dynCall_iiiiii(index, a1, a2, a3, a4, a5);
          } catch (e) {
            stackRestore(sp);
            if (e !== e + 0) throw e;
            _setThrew(1, 0);
          }
        }
        Module2["addRunDependency"] = addRunDependency;
        Module2["removeRunDependency"] = removeRunDependency;
        Module2["FS_createPath"] = FS.createPath;
        Module2["FS_createDataFile"] = FS.createDataFile;
        Module2["FS_createPreloadedFile"] = FS.createPreloadedFile;
        Module2["FS_createLazyFile"] = FS.createLazyFile;
        Module2["FS_createDevice"] = FS.createDevice;
        Module2["FS_unlink"] = FS.unlink;
        Module2["ccall"] = ccall;
        Module2["cwrap"] = cwrap;
        Module2["setValue"] = setValue;
        Module2["getValue"] = getValue;
        Module2["FS"] = FS;
        var calledRun;
        dependenciesFulfilled = function runCaller() {
          if (!calledRun) run();
          if (!calledRun) dependenciesFulfilled = runCaller;
        };
        function callMain(args) {
          var entryFunction = Module2["_main"];
          args = args || [];
          args.unshift(thisProgram);
          var argc = args.length;
          var argv = stackAlloc((argc + 1) * 4);
          var argv_ptr = argv >> 2;
          args.forEach((arg) => {
            HEAP32[argv_ptr++] = allocateUTF8OnStack(arg);
          });
          HEAP32[argv_ptr] = 0;
          try {
            var ret = entryFunction(argc, argv);
            exitJS(ret, true);
            return ret;
          } catch (e) {
            return handleException(e);
          }
        }
        function run(args) {
          args = args || arguments_;
          if (runDependencies > 0) {
            return;
          }
          preRun();
          if (runDependencies > 0) {
            return;
          }
          function doRun() {
            if (calledRun) return;
            calledRun = true;
            Module2["calledRun"] = true;
            if (ABORT) return;
            initRuntime();
            preMain();
            readyPromiseResolve(Module2);
            if (Module2["onRuntimeInitialized"]) Module2["onRuntimeInitialized"]();
            if (shouldRunNow) callMain(args);
            postRun();
          }
          if (Module2["setStatus"]) {
            Module2["setStatus"]("Running...");
            setTimeout(function() {
              setTimeout(function() {
                Module2["setStatus"]("");
              }, 1);
              doRun();
            }, 1);
          } else {
            doRun();
          }
        }
        if (Module2["preInit"]) {
          if (typeof Module2["preInit"] == "function") Module2["preInit"] = [Module2["preInit"]];
          while (Module2["preInit"].length > 0) {
            Module2["preInit"].pop()();
          }
        }
        var shouldRunNow = true;
        if (Module2["noInitialRun"]) shouldRunNow = false;
        run();
        return createModule3.ready;
      };
    })();
    if (typeof exports === "object" && typeof module === "object")
      module.exports = createModule2;
    else if (typeof define === "function" && define["amd"])
      define([], function() {
        return createModule2;
      });
    else if (typeof exports === "object")
      exports["createModule"] = createModule2;
  }
});

// artifacts/n64/mupen64plus-web-1.5.7-baseline/main.bundle-entry.js
var import_index_7f0ebbf78c = __toESM(require_index_7f0ebbf78c(), 1);

// node_modules/axios/lib/helpers/bind.js
function bind(fn, thisArg) {
  return function wrap() {
    return fn.apply(thisArg, arguments);
  };
}

// node_modules/axios/lib/utils.js
var { toString } = Object.prototype;
var { getPrototypeOf } = Object;
var { iterator, toStringTag } = Symbol;
var kindOf = /* @__PURE__ */ ((cache) => (thing) => {
  const str = toString.call(thing);
  return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
})(/* @__PURE__ */ Object.create(null));
var kindOfTest = (type) => {
  type = type.toLowerCase();
  return (thing) => kindOf(thing) === type;
};
var typeOfTest = (type) => (thing) => typeof thing === type;
var { isArray } = Array;
var isUndefined = typeOfTest("undefined");
function isBuffer(val) {
  return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && isFunction(val.constructor.isBuffer) && val.constructor.isBuffer(val);
}
var isArrayBuffer = kindOfTest("ArrayBuffer");
function isArrayBufferView(val) {
  let result;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) {
    result = ArrayBuffer.isView(val);
  } else {
    result = val && val.buffer && isArrayBuffer(val.buffer);
  }
  return result;
}
var isString = typeOfTest("string");
var isFunction = typeOfTest("function");
var isNumber = typeOfTest("number");
var isObject = (thing) => thing !== null && typeof thing === "object";
var isBoolean = (thing) => thing === true || thing === false;
var isPlainObject = (val) => {
  if (kindOf(val) !== "object") {
    return false;
  }
  const prototype2 = getPrototypeOf(val);
  return (prototype2 === null || prototype2 === Object.prototype || Object.getPrototypeOf(prototype2) === null) && !(toStringTag in val) && !(iterator in val);
};
var isEmptyObject = (val) => {
  if (!isObject(val) || isBuffer(val)) {
    return false;
  }
  try {
    return Object.keys(val).length === 0 && Object.getPrototypeOf(val) === Object.prototype;
  } catch (e) {
    return false;
  }
};
var isDate = kindOfTest("Date");
var isFile = kindOfTest("File");
var isReactNativeBlob = (value) => {
  return !!(value && typeof value.uri !== "undefined");
};
var isReactNative = (formData) => formData && typeof formData.getParts !== "undefined";
var isBlob = kindOfTest("Blob");
var isFileList = kindOfTest("FileList");
var isStream = (val) => isObject(val) && isFunction(val.pipe);
function getGlobal() {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof self !== "undefined") return self;
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined") return global;
  return {};
}
var G = getGlobal();
var FormDataCtor = typeof G.FormData !== "undefined" ? G.FormData : void 0;
var isFormData = (thing) => {
  if (!thing) return false;
  if (FormDataCtor && thing instanceof FormDataCtor) return true;
  const proto = getPrototypeOf(thing);
  if (!proto || proto === Object.prototype) return false;
  if (!isFunction(thing.append)) return false;
  const kind = kindOf(thing);
  return kind === "formdata" || // detect form-data instance
  kind === "object" && isFunction(thing.toString) && thing.toString() === "[object FormData]";
};
var isURLSearchParams = kindOfTest("URLSearchParams");
var [isReadableStream, isRequest, isResponse, isHeaders] = [
  "ReadableStream",
  "Request",
  "Response",
  "Headers"
].map(kindOfTest);
var trim = (str) => {
  return str.trim ? str.trim() : str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
};
function forEach(obj, fn, { allOwnKeys = false } = {}) {
  if (obj === null || typeof obj === "undefined") {
    return;
  }
  let i;
  let l;
  if (typeof obj !== "object") {
    obj = [obj];
  }
  if (isArray(obj)) {
    for (i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  } else {
    if (isBuffer(obj)) {
      return;
    }
    const keys = allOwnKeys ? Object.getOwnPropertyNames(obj) : Object.keys(obj);
    const len = keys.length;
    let key;
    for (i = 0; i < len; i++) {
      key = keys[i];
      fn.call(null, obj[key], key, obj);
    }
  }
}
function findKey(obj, key) {
  if (isBuffer(obj)) {
    return null;
  }
  key = key.toLowerCase();
  const keys = Object.keys(obj);
  let i = keys.length;
  let _key;
  while (i-- > 0) {
    _key = keys[i];
    if (key === _key.toLowerCase()) {
      return _key;
    }
  }
  return null;
}
var _global = (() => {
  if (typeof globalThis !== "undefined") return globalThis;
  return typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : global;
})();
var isContextDefined = (context) => !isUndefined(context) && context !== _global;
function merge() {
  const { caseless, skipUndefined } = isContextDefined(this) && this || {};
  const result = {};
  const assignValue = (val, key) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return;
    }
    const targetKey = caseless && findKey(result, key) || key;
    if (isPlainObject(result[targetKey]) && isPlainObject(val)) {
      result[targetKey] = merge(result[targetKey], val);
    } else if (isPlainObject(val)) {
      result[targetKey] = merge({}, val);
    } else if (isArray(val)) {
      result[targetKey] = val.slice();
    } else if (!skipUndefined || !isUndefined(val)) {
      result[targetKey] = val;
    }
  };
  for (let i = 0, l = arguments.length; i < l; i++) {
    arguments[i] && forEach(arguments[i], assignValue);
  }
  return result;
}
var extend = (a, b, thisArg, { allOwnKeys } = {}) => {
  forEach(
    b,
    (val, key) => {
      if (thisArg && isFunction(val)) {
        Object.defineProperty(a, key, {
          value: bind(val, thisArg),
          writable: true,
          enumerable: true,
          configurable: true
        });
      } else {
        Object.defineProperty(a, key, {
          value: val,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    },
    { allOwnKeys }
  );
  return a;
};
var stripBOM = (content) => {
  if (content.charCodeAt(0) === 65279) {
    content = content.slice(1);
  }
  return content;
};
var inherits = (constructor, superConstructor, props, descriptors) => {
  constructor.prototype = Object.create(superConstructor.prototype, descriptors);
  Object.defineProperty(constructor.prototype, "constructor", {
    value: constructor,
    writable: true,
    enumerable: false,
    configurable: true
  });
  Object.defineProperty(constructor, "super", {
    value: superConstructor.prototype
  });
  props && Object.assign(constructor.prototype, props);
};
var toFlatObject = (sourceObj, destObj, filter2, propFilter) => {
  let props;
  let i;
  let prop;
  const merged = {};
  destObj = destObj || {};
  if (sourceObj == null) return destObj;
  do {
    props = Object.getOwnPropertyNames(sourceObj);
    i = props.length;
    while (i-- > 0) {
      prop = props[i];
      if ((!propFilter || propFilter(prop, sourceObj, destObj)) && !merged[prop]) {
        destObj[prop] = sourceObj[prop];
        merged[prop] = true;
      }
    }
    sourceObj = filter2 !== false && getPrototypeOf(sourceObj);
  } while (sourceObj && (!filter2 || filter2(sourceObj, destObj)) && sourceObj !== Object.prototype);
  return destObj;
};
var endsWith = (str, searchString, position) => {
  str = String(str);
  if (position === void 0 || position > str.length) {
    position = str.length;
  }
  position -= searchString.length;
  const lastIndex = str.indexOf(searchString, position);
  return lastIndex !== -1 && lastIndex === position;
};
var toArray = (thing) => {
  if (!thing) return null;
  if (isArray(thing)) return thing;
  let i = thing.length;
  if (!isNumber(i)) return null;
  const arr = new Array(i);
  while (i-- > 0) {
    arr[i] = thing[i];
  }
  return arr;
};
var isTypedArray = /* @__PURE__ */ ((TypedArray) => {
  return (thing) => {
    return TypedArray && thing instanceof TypedArray;
  };
})(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array));
var forEachEntry = (obj, fn) => {
  const generator = obj && obj[iterator];
  const _iterator = generator.call(obj);
  let result;
  while ((result = _iterator.next()) && !result.done) {
    const pair = result.value;
    fn.call(obj, pair[0], pair[1]);
  }
};
var matchAll = (regExp, str) => {
  let matches;
  const arr = [];
  while ((matches = regExp.exec(str)) !== null) {
    arr.push(matches);
  }
  return arr;
};
var isHTMLForm = kindOfTest("HTMLFormElement");
var toCamelCase = (str) => {
  return str.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, function replacer(m, p1, p2) {
    return p1.toUpperCase() + p2;
  });
};
var hasOwnProperty = (({ hasOwnProperty: hasOwnProperty2 }) => (obj, prop) => hasOwnProperty2.call(obj, prop))(Object.prototype);
var isRegExp = kindOfTest("RegExp");
var reduceDescriptors = (obj, reducer) => {
  const descriptors = Object.getOwnPropertyDescriptors(obj);
  const reducedDescriptors = {};
  forEach(descriptors, (descriptor, name) => {
    let ret;
    if ((ret = reducer(descriptor, name, obj)) !== false) {
      reducedDescriptors[name] = ret || descriptor;
    }
  });
  Object.defineProperties(obj, reducedDescriptors);
};
var freezeMethods = (obj) => {
  reduceDescriptors(obj, (descriptor, name) => {
    if (isFunction(obj) && ["arguments", "caller", "callee"].indexOf(name) !== -1) {
      return false;
    }
    const value = obj[name];
    if (!isFunction(value)) return;
    descriptor.enumerable = false;
    if ("writable" in descriptor) {
      descriptor.writable = false;
      return;
    }
    if (!descriptor.set) {
      descriptor.set = () => {
        throw Error("Can not rewrite read-only method '" + name + "'");
      };
    }
  });
};
var toObjectSet = (arrayOrString, delimiter) => {
  const obj = {};
  const define2 = (arr) => {
    arr.forEach((value) => {
      obj[value] = true;
    });
  };
  isArray(arrayOrString) ? define2(arrayOrString) : define2(String(arrayOrString).split(delimiter));
  return obj;
};
var noop = () => {
};
var toFiniteNumber = (value, defaultValue) => {
  return value != null && Number.isFinite(value = +value) ? value : defaultValue;
};
function isSpecCompliantForm(thing) {
  return !!(thing && isFunction(thing.append) && thing[toStringTag] === "FormData" && thing[iterator]);
}
var toJSONObject = (obj) => {
  const stack = new Array(10);
  const visit = (source, i) => {
    if (isObject(source)) {
      if (stack.indexOf(source) >= 0) {
        return;
      }
      if (isBuffer(source)) {
        return source;
      }
      if (!("toJSON" in source)) {
        stack[i] = source;
        const target = isArray(source) ? [] : {};
        forEach(source, (value, key) => {
          const reducedValue = visit(value, i + 1);
          !isUndefined(reducedValue) && (target[key] = reducedValue);
        });
        stack[i] = void 0;
        return target;
      }
    }
    return source;
  };
  return visit(obj, 0);
};
var isAsyncFn = kindOfTest("AsyncFunction");
var isThenable = (thing) => thing && (isObject(thing) || isFunction(thing)) && isFunction(thing.then) && isFunction(thing.catch);
var _setImmediate = ((setImmediateSupported, postMessageSupported) => {
  if (setImmediateSupported) {
    return setImmediate;
  }
  return postMessageSupported ? ((token, callbacks) => {
    _global.addEventListener(
      "message",
      ({ source, data }) => {
        if (source === _global && data === token) {
          callbacks.length && callbacks.shift()();
        }
      },
      false
    );
    return (cb) => {
      callbacks.push(cb);
      _global.postMessage(token, "*");
    };
  })(`axios@${Math.random()}`, []) : (cb) => setTimeout(cb);
})(typeof setImmediate === "function", isFunction(_global.postMessage));
var asap = typeof queueMicrotask !== "undefined" ? queueMicrotask.bind(_global) : typeof process !== "undefined" && process.nextTick || _setImmediate;
var isIterable = (thing) => thing != null && isFunction(thing[iterator]);
var utils_default = {
  isArray,
  isArrayBuffer,
  isBuffer,
  isFormData,
  isArrayBufferView,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isPlainObject,
  isEmptyObject,
  isReadableStream,
  isRequest,
  isResponse,
  isHeaders,
  isUndefined,
  isDate,
  isFile,
  isReactNativeBlob,
  isReactNative,
  isBlob,
  isRegExp,
  isFunction,
  isStream,
  isURLSearchParams,
  isTypedArray,
  isFileList,
  forEach,
  merge,
  extend,
  trim,
  stripBOM,
  inherits,
  toFlatObject,
  kindOf,
  kindOfTest,
  endsWith,
  toArray,
  forEachEntry,
  matchAll,
  isHTMLForm,
  hasOwnProperty,
  hasOwnProp: hasOwnProperty,
  // an alias to avoid ESLint no-prototype-builtins detection
  reduceDescriptors,
  freezeMethods,
  toObjectSet,
  toCamelCase,
  noop,
  toFiniteNumber,
  findKey,
  global: _global,
  isContextDefined,
  isSpecCompliantForm,
  toJSONObject,
  isAsyncFn,
  isThenable,
  setImmediate: _setImmediate,
  asap,
  isIterable
};

// node_modules/axios/lib/core/AxiosError.js
var AxiosError = class _AxiosError extends Error {
  static from(error, code, config, request, response, customProps) {
    const axiosError = new _AxiosError(error.message, code || error.code, config, request, response);
    axiosError.cause = error;
    axiosError.name = error.name;
    if (error.status != null && axiosError.status == null) {
      axiosError.status = error.status;
    }
    customProps && Object.assign(axiosError, customProps);
    return axiosError;
  }
  /**
   * Create an Error with the specified message, config, error code, request and response.
   *
   * @param {string} message The error message.
   * @param {string} [code] The error code (for example, 'ECONNABORTED').
   * @param {Object} [config] The config.
   * @param {Object} [request] The request.
   * @param {Object} [response] The response.
   *
   * @returns {Error} The created error.
   */
  constructor(message, code, config, request, response) {
    super(message);
    Object.defineProperty(this, "message", {
      value: message,
      enumerable: true,
      writable: true,
      configurable: true
    });
    this.name = "AxiosError";
    this.isAxiosError = true;
    code && (this.code = code);
    config && (this.config = config);
    request && (this.request = request);
    if (response) {
      this.response = response;
      this.status = response.status;
    }
  }
  toJSON() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: utils_default.toJSONObject(this.config),
      code: this.code,
      status: this.status
    };
  }
};
AxiosError.ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
AxiosError.ERR_BAD_OPTION = "ERR_BAD_OPTION";
AxiosError.ECONNABORTED = "ECONNABORTED";
AxiosError.ETIMEDOUT = "ETIMEDOUT";
AxiosError.ERR_NETWORK = "ERR_NETWORK";
AxiosError.ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
AxiosError.ERR_DEPRECATED = "ERR_DEPRECATED";
AxiosError.ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
AxiosError.ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
AxiosError.ERR_CANCELED = "ERR_CANCELED";
AxiosError.ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
AxiosError.ERR_INVALID_URL = "ERR_INVALID_URL";
AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED = "ERR_FORM_DATA_DEPTH_EXCEEDED";
var AxiosError_default = AxiosError;

// node_modules/axios/lib/helpers/null.js
var null_default = null;

// node_modules/axios/lib/helpers/toFormData.js
function isVisitable(thing) {
  return utils_default.isPlainObject(thing) || utils_default.isArray(thing);
}
function removeBrackets(key) {
  return utils_default.endsWith(key, "[]") ? key.slice(0, -2) : key;
}
function renderKey(path, key, dots) {
  if (!path) return key;
  return path.concat(key).map(function each(token, i) {
    token = removeBrackets(token);
    return !dots && i ? "[" + token + "]" : token;
  }).join(dots ? "." : "");
}
function isFlatArray(arr) {
  return utils_default.isArray(arr) && !arr.some(isVisitable);
}
var predicates = utils_default.toFlatObject(utils_default, {}, null, function filter(prop) {
  return /^is[A-Z]/.test(prop);
});
function toFormData(obj, formData, options) {
  if (!utils_default.isObject(obj)) {
    throw new TypeError("target must be an object");
  }
  formData = formData || new (null_default || FormData)();
  options = utils_default.toFlatObject(
    options,
    {
      metaTokens: true,
      dots: false,
      indexes: false
    },
    false,
    function defined(option, source) {
      return !utils_default.isUndefined(source[option]);
    }
  );
  const metaTokens = options.metaTokens;
  const visitor = options.visitor || defaultVisitor;
  const dots = options.dots;
  const indexes = options.indexes;
  const _Blob = options.Blob || typeof Blob !== "undefined" && Blob;
  const maxDepth = options.maxDepth === void 0 ? 100 : options.maxDepth;
  const useBlob = _Blob && utils_default.isSpecCompliantForm(formData);
  if (!utils_default.isFunction(visitor)) {
    throw new TypeError("visitor must be a function");
  }
  function convertValue(value) {
    if (value === null) return "";
    if (utils_default.isDate(value)) {
      return value.toISOString();
    }
    if (utils_default.isBoolean(value)) {
      return value.toString();
    }
    if (!useBlob && utils_default.isBlob(value)) {
      throw new AxiosError_default("Blob is not supported. Use a Buffer instead.");
    }
    if (utils_default.isArrayBuffer(value) || utils_default.isTypedArray(value)) {
      return useBlob && typeof Blob === "function" ? new Blob([value]) : Buffer.from(value);
    }
    return value;
  }
  function defaultVisitor(value, key, path) {
    let arr = value;
    if (utils_default.isReactNative(formData) && utils_default.isReactNativeBlob(value)) {
      formData.append(renderKey(path, key, dots), convertValue(value));
      return false;
    }
    if (value && !path && typeof value === "object") {
      if (utils_default.endsWith(key, "{}")) {
        key = metaTokens ? key : key.slice(0, -2);
        value = JSON.stringify(value);
      } else if (utils_default.isArray(value) && isFlatArray(value) || (utils_default.isFileList(value) || utils_default.endsWith(key, "[]")) && (arr = utils_default.toArray(value))) {
        key = removeBrackets(key);
        arr.forEach(function each(el, index) {
          !(utils_default.isUndefined(el) || el === null) && formData.append(
            // eslint-disable-next-line no-nested-ternary
            indexes === true ? renderKey([key], index, dots) : indexes === null ? key : key + "[]",
            convertValue(el)
          );
        });
        return false;
      }
    }
    if (isVisitable(value)) {
      return true;
    }
    formData.append(renderKey(path, key, dots), convertValue(value));
    return false;
  }
  const stack = [];
  const exposedHelpers = Object.assign(predicates, {
    defaultVisitor,
    convertValue,
    isVisitable
  });
  function build(value, path, depth = 0) {
    if (utils_default.isUndefined(value)) return;
    if (depth > maxDepth) {
      throw new AxiosError_default(
        "Object is too deeply nested (" + depth + " levels). Max depth: " + maxDepth,
        AxiosError_default.ERR_FORM_DATA_DEPTH_EXCEEDED
      );
    }
    if (stack.indexOf(value) !== -1) {
      throw Error("Circular reference detected in " + path.join("."));
    }
    stack.push(value);
    utils_default.forEach(value, function each(el, key) {
      const result = !(utils_default.isUndefined(el) || el === null) && visitor.call(formData, el, utils_default.isString(key) ? key.trim() : key, path, exposedHelpers);
      if (result === true) {
        build(el, path ? path.concat(key) : [key], depth + 1);
      }
    });
    stack.pop();
  }
  if (!utils_default.isObject(obj)) {
    throw new TypeError("data must be an object");
  }
  build(obj);
  return formData;
}
var toFormData_default = toFormData;

// node_modules/axios/lib/helpers/AxiosURLSearchParams.js
function encode(str) {
  const charMap = {
    "!": "%21",
    "'": "%27",
    "(": "%28",
    ")": "%29",
    "~": "%7E",
    "%20": "+"
  };
  return encodeURIComponent(str).replace(/[!'()~]|%20/g, function replacer(match) {
    return charMap[match];
  });
}
function AxiosURLSearchParams(params, options) {
  this._pairs = [];
  params && toFormData_default(params, this, options);
}
var prototype = AxiosURLSearchParams.prototype;
prototype.append = function append(name, value) {
  this._pairs.push([name, value]);
};
prototype.toString = function toString2(encoder) {
  const _encode = encoder ? function(value) {
    return encoder.call(this, value, encode);
  } : encode;
  return this._pairs.map(function each(pair) {
    return _encode(pair[0]) + "=" + _encode(pair[1]);
  }, "").join("&");
};
var AxiosURLSearchParams_default = AxiosURLSearchParams;

// node_modules/axios/lib/helpers/buildURL.js
function encode2(val) {
  return encodeURIComponent(val).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
}
function buildURL(url, params, options) {
  if (!params) {
    return url;
  }
  const _encode = options && options.encode || encode2;
  const _options = utils_default.isFunction(options) ? {
    serialize: options
  } : options;
  const serializeFn = _options && _options.serialize;
  let serializedParams;
  if (serializeFn) {
    serializedParams = serializeFn(params, _options);
  } else {
    serializedParams = utils_default.isURLSearchParams(params) ? params.toString() : new AxiosURLSearchParams_default(params, _options).toString(_encode);
  }
  if (serializedParams) {
    const hashmarkIndex = url.indexOf("#");
    if (hashmarkIndex !== -1) {
      url = url.slice(0, hashmarkIndex);
    }
    url += (url.indexOf("?") === -1 ? "?" : "&") + serializedParams;
  }
  return url;
}

// node_modules/axios/lib/core/InterceptorManager.js
var InterceptorManager = class {
  constructor() {
    this.handlers = [];
  }
  /**
   * Add a new interceptor to the stack
   *
   * @param {Function} fulfilled The function to handle `then` for a `Promise`
   * @param {Function} rejected The function to handle `reject` for a `Promise`
   * @param {Object} options The options for the interceptor, synchronous and runWhen
   *
   * @return {Number} An ID used to remove interceptor later
   */
  use(fulfilled, rejected, options) {
    this.handlers.push({
      fulfilled,
      rejected,
      synchronous: options ? options.synchronous : false,
      runWhen: options ? options.runWhen : null
    });
    return this.handlers.length - 1;
  }
  /**
   * Remove an interceptor from the stack
   *
   * @param {Number} id The ID that was returned by `use`
   *
   * @returns {void}
   */
  eject(id) {
    if (this.handlers[id]) {
      this.handlers[id] = null;
    }
  }
  /**
   * Clear all interceptors from the stack
   *
   * @returns {void}
   */
  clear() {
    if (this.handlers) {
      this.handlers = [];
    }
  }
  /**
   * Iterate over all the registered interceptors
   *
   * This method is particularly useful for skipping over any
   * interceptors that may have become `null` calling `eject`.
   *
   * @param {Function} fn The function to call for each interceptor
   *
   * @returns {void}
   */
  forEach(fn) {
    utils_default.forEach(this.handlers, function forEachHandler(h) {
      if (h !== null) {
        fn(h);
      }
    });
  }
};
var InterceptorManager_default = InterceptorManager;

// node_modules/axios/lib/defaults/transitional.js
var transitional_default = {
  silentJSONParsing: true,
  forcedJSONParsing: true,
  clarifyTimeoutError: false,
  legacyInterceptorReqResOrdering: true
};

// node_modules/axios/lib/platform/browser/classes/URLSearchParams.js
var URLSearchParams_default = typeof URLSearchParams !== "undefined" ? URLSearchParams : AxiosURLSearchParams_default;

// node_modules/axios/lib/platform/browser/classes/FormData.js
var FormData_default = typeof FormData !== "undefined" ? FormData : null;

// node_modules/axios/lib/platform/browser/classes/Blob.js
var Blob_default = typeof Blob !== "undefined" ? Blob : null;

// node_modules/axios/lib/platform/browser/index.js
var browser_default = {
  isBrowser: true,
  classes: {
    URLSearchParams: URLSearchParams_default,
    FormData: FormData_default,
    Blob: Blob_default
  },
  protocols: ["http", "https", "file", "blob", "url", "data"]
};

// node_modules/axios/lib/platform/common/utils.js
var utils_exports = {};
__export(utils_exports, {
  hasBrowserEnv: () => hasBrowserEnv,
  hasStandardBrowserEnv: () => hasStandardBrowserEnv,
  hasStandardBrowserWebWorkerEnv: () => hasStandardBrowserWebWorkerEnv,
  navigator: () => _navigator,
  origin: () => origin
});
var hasBrowserEnv = typeof window !== "undefined" && typeof document !== "undefined";
var _navigator = typeof navigator === "object" && navigator || void 0;
var hasStandardBrowserEnv = hasBrowserEnv && (!_navigator || ["ReactNative", "NativeScript", "NS"].indexOf(_navigator.product) < 0);
var hasStandardBrowserWebWorkerEnv = (() => {
  return typeof WorkerGlobalScope !== "undefined" && // eslint-disable-next-line no-undef
  self instanceof WorkerGlobalScope && typeof self.importScripts === "function";
})();
var origin = hasBrowserEnv && window.location.href || "http://localhost";

// node_modules/axios/lib/platform/index.js
var platform_default = {
  ...utils_exports,
  ...browser_default
};

// node_modules/axios/lib/helpers/toURLEncodedForm.js
function toURLEncodedForm(data, options) {
  return toFormData_default(data, new platform_default.classes.URLSearchParams(), {
    visitor: function(value, key, path, helpers) {
      if (platform_default.isNode && utils_default.isBuffer(value)) {
        this.append(key, value.toString("base64"));
        return false;
      }
      return helpers.defaultVisitor.apply(this, arguments);
    },
    ...options
  });
}

// node_modules/axios/lib/helpers/formDataToJSON.js
function parsePropPath(name) {
  return utils_default.matchAll(/\w+|\[(\w*)]/g, name).map((match) => {
    return match[0] === "[]" ? "" : match[1] || match[0];
  });
}
function arrayToObject(arr) {
  const obj = {};
  const keys = Object.keys(arr);
  let i;
  const len = keys.length;
  let key;
  for (i = 0; i < len; i++) {
    key = keys[i];
    obj[key] = arr[key];
  }
  return obj;
}
function formDataToJSON(formData) {
  function buildPath(path, value, target, index) {
    let name = path[index++];
    if (name === "__proto__") return true;
    const isNumericKey = Number.isFinite(+name);
    const isLast = index >= path.length;
    name = !name && utils_default.isArray(target) ? target.length : name;
    if (isLast) {
      if (utils_default.hasOwnProp(target, name)) {
        target[name] = utils_default.isArray(target[name]) ? target[name].concat(value) : [target[name], value];
      } else {
        target[name] = value;
      }
      return !isNumericKey;
    }
    if (!target[name] || !utils_default.isObject(target[name])) {
      target[name] = [];
    }
    const result = buildPath(path, value, target[name], index);
    if (result && utils_default.isArray(target[name])) {
      target[name] = arrayToObject(target[name]);
    }
    return !isNumericKey;
  }
  if (utils_default.isFormData(formData) && utils_default.isFunction(formData.entries)) {
    const obj = {};
    utils_default.forEachEntry(formData, (name, value) => {
      buildPath(parsePropPath(name), value, obj, 0);
    });
    return obj;
  }
  return null;
}
var formDataToJSON_default = formDataToJSON;

// node_modules/axios/lib/defaults/index.js
var own = (obj, key) => obj != null && utils_default.hasOwnProp(obj, key) ? obj[key] : void 0;
function stringifySafely(rawValue, parser, encoder) {
  if (utils_default.isString(rawValue)) {
    try {
      (parser || JSON.parse)(rawValue);
      return utils_default.trim(rawValue);
    } catch (e) {
      if (e.name !== "SyntaxError") {
        throw e;
      }
    }
  }
  return (encoder || JSON.stringify)(rawValue);
}
var defaults = {
  transitional: transitional_default,
  adapter: ["xhr", "http", "fetch"],
  transformRequest: [
    function transformRequest(data, headers) {
      const contentType = headers.getContentType() || "";
      const hasJSONContentType = contentType.indexOf("application/json") > -1;
      const isObjectPayload = utils_default.isObject(data);
      if (isObjectPayload && utils_default.isHTMLForm(data)) {
        data = new FormData(data);
      }
      const isFormData2 = utils_default.isFormData(data);
      if (isFormData2) {
        return hasJSONContentType ? JSON.stringify(formDataToJSON_default(data)) : data;
      }
      if (utils_default.isArrayBuffer(data) || utils_default.isBuffer(data) || utils_default.isStream(data) || utils_default.isFile(data) || utils_default.isBlob(data) || utils_default.isReadableStream(data)) {
        return data;
      }
      if (utils_default.isArrayBufferView(data)) {
        return data.buffer;
      }
      if (utils_default.isURLSearchParams(data)) {
        headers.setContentType("application/x-www-form-urlencoded;charset=utf-8", false);
        return data.toString();
      }
      let isFileList2;
      if (isObjectPayload) {
        const formSerializer = own(this, "formSerializer");
        if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
          return toURLEncodedForm(data, formSerializer).toString();
        }
        if ((isFileList2 = utils_default.isFileList(data)) || contentType.indexOf("multipart/form-data") > -1) {
          const env = own(this, "env");
          const _FormData = env && env.FormData;
          return toFormData_default(
            isFileList2 ? { "files[]": data } : data,
            _FormData && new _FormData(),
            formSerializer
          );
        }
      }
      if (isObjectPayload || hasJSONContentType) {
        headers.setContentType("application/json", false);
        return stringifySafely(data);
      }
      return data;
    }
  ],
  transformResponse: [
    function transformResponse(data) {
      const transitional2 = own(this, "transitional") || defaults.transitional;
      const forcedJSONParsing = transitional2 && transitional2.forcedJSONParsing;
      const responseType = own(this, "responseType");
      const JSONRequested = responseType === "json";
      if (utils_default.isResponse(data) || utils_default.isReadableStream(data)) {
        return data;
      }
      if (data && utils_default.isString(data) && (forcedJSONParsing && !responseType || JSONRequested)) {
        const silentJSONParsing = transitional2 && transitional2.silentJSONParsing;
        const strictJSONParsing = !silentJSONParsing && JSONRequested;
        try {
          return JSON.parse(data, own(this, "parseReviver"));
        } catch (e) {
          if (strictJSONParsing) {
            if (e.name === "SyntaxError") {
              throw AxiosError_default.from(e, AxiosError_default.ERR_BAD_RESPONSE, this, null, own(this, "response"));
            }
            throw e;
          }
        }
      }
      return data;
    }
  ],
  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  maxContentLength: -1,
  maxBodyLength: -1,
  env: {
    FormData: platform_default.classes.FormData,
    Blob: platform_default.classes.Blob
  },
  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  },
  headers: {
    common: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": void 0
    }
  }
};
utils_default.forEach(["delete", "get", "head", "post", "put", "patch"], (method) => {
  defaults.headers[method] = {};
});
var defaults_default = defaults;

// node_modules/axios/lib/helpers/parseHeaders.js
var ignoreDuplicateOf = utils_default.toObjectSet([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "user-agent"
]);
var parseHeaders_default = (rawHeaders) => {
  const parsed = {};
  let key;
  let val;
  let i;
  rawHeaders && rawHeaders.split("\n").forEach(function parser(line) {
    i = line.indexOf(":");
    key = line.substring(0, i).trim().toLowerCase();
    val = line.substring(i + 1).trim();
    if (!key || parsed[key] && ignoreDuplicateOf[key]) {
      return;
    }
    if (key === "set-cookie") {
      if (parsed[key]) {
        parsed[key].push(val);
      } else {
        parsed[key] = [val];
      }
    } else {
      parsed[key] = parsed[key] ? parsed[key] + ", " + val : val;
    }
  });
  return parsed;
};

// node_modules/axios/lib/core/AxiosHeaders.js
var $internals = Symbol("internals");
var INVALID_HEADER_VALUE_CHARS_RE = /[^\x09\x20-\x7E\x80-\xFF]/g;
function trimSPorHTAB(str) {
  let start = 0;
  let end = str.length;
  while (start < end) {
    const code = str.charCodeAt(start);
    if (code !== 9 && code !== 32) {
      break;
    }
    start += 1;
  }
  while (end > start) {
    const code = str.charCodeAt(end - 1);
    if (code !== 9 && code !== 32) {
      break;
    }
    end -= 1;
  }
  return start === 0 && end === str.length ? str : str.slice(start, end);
}
function normalizeHeader(header) {
  return header && String(header).trim().toLowerCase();
}
function sanitizeHeaderValue(str) {
  return trimSPorHTAB(str.replace(INVALID_HEADER_VALUE_CHARS_RE, ""));
}
function normalizeValue(value) {
  if (value === false || value == null) {
    return value;
  }
  return utils_default.isArray(value) ? value.map(normalizeValue) : sanitizeHeaderValue(String(value));
}
function parseTokens(str) {
  const tokens = /* @__PURE__ */ Object.create(null);
  const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let match;
  while (match = tokensRE.exec(str)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}
var isValidHeaderName = (str) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str.trim());
function matchHeaderValue(context, value, header, filter2, isHeaderNameFilter) {
  if (utils_default.isFunction(filter2)) {
    return filter2.call(this, value, header);
  }
  if (isHeaderNameFilter) {
    value = header;
  }
  if (!utils_default.isString(value)) return;
  if (utils_default.isString(filter2)) {
    return value.indexOf(filter2) !== -1;
  }
  if (utils_default.isRegExp(filter2)) {
    return filter2.test(value);
  }
}
function formatHeader(header) {
  return header.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (w, char, str) => {
    return char.toUpperCase() + str;
  });
}
function buildAccessors(obj, header) {
  const accessorName = utils_default.toCamelCase(" " + header);
  ["get", "set", "has"].forEach((methodName) => {
    Object.defineProperty(obj, methodName + accessorName, {
      value: function(arg1, arg2, arg3) {
        return this[methodName].call(this, header, arg1, arg2, arg3);
      },
      configurable: true
    });
  });
}
var AxiosHeaders = class {
  constructor(headers) {
    headers && this.set(headers);
  }
  set(header, valueOrRewrite, rewrite) {
    const self2 = this;
    function setHeader(_value, _header, _rewrite) {
      const lHeader = normalizeHeader(_header);
      if (!lHeader) {
        throw new Error("header name must be a non-empty string");
      }
      const key = utils_default.findKey(self2, lHeader);
      if (!key || self2[key] === void 0 || _rewrite === true || _rewrite === void 0 && self2[key] !== false) {
        self2[key || _header] = normalizeValue(_value);
      }
    }
    const setHeaders = (headers, _rewrite) => utils_default.forEach(headers, (_value, _header) => setHeader(_value, _header, _rewrite));
    if (utils_default.isPlainObject(header) || header instanceof this.constructor) {
      setHeaders(header, valueOrRewrite);
    } else if (utils_default.isString(header) && (header = header.trim()) && !isValidHeaderName(header)) {
      setHeaders(parseHeaders_default(header), valueOrRewrite);
    } else if (utils_default.isObject(header) && utils_default.isIterable(header)) {
      let obj = {}, dest, key;
      for (const entry of header) {
        if (!utils_default.isArray(entry)) {
          throw TypeError("Object iterator must return a key-value pair");
        }
        obj[key = entry[0]] = (dest = obj[key]) ? utils_default.isArray(dest) ? [...dest, entry[1]] : [dest, entry[1]] : entry[1];
      }
      setHeaders(obj, valueOrRewrite);
    } else {
      header != null && setHeader(valueOrRewrite, header, rewrite);
    }
    return this;
  }
  get(header, parser) {
    header = normalizeHeader(header);
    if (header) {
      const key = utils_default.findKey(this, header);
      if (key) {
        const value = this[key];
        if (!parser) {
          return value;
        }
        if (parser === true) {
          return parseTokens(value);
        }
        if (utils_default.isFunction(parser)) {
          return parser.call(this, value, key);
        }
        if (utils_default.isRegExp(parser)) {
          return parser.exec(value);
        }
        throw new TypeError("parser must be boolean|regexp|function");
      }
    }
  }
  has(header, matcher) {
    header = normalizeHeader(header);
    if (header) {
      const key = utils_default.findKey(this, header);
      return !!(key && this[key] !== void 0 && (!matcher || matchHeaderValue(this, this[key], key, matcher)));
    }
    return false;
  }
  delete(header, matcher) {
    const self2 = this;
    let deleted = false;
    function deleteHeader(_header) {
      _header = normalizeHeader(_header);
      if (_header) {
        const key = utils_default.findKey(self2, _header);
        if (key && (!matcher || matchHeaderValue(self2, self2[key], key, matcher))) {
          delete self2[key];
          deleted = true;
        }
      }
    }
    if (utils_default.isArray(header)) {
      header.forEach(deleteHeader);
    } else {
      deleteHeader(header);
    }
    return deleted;
  }
  clear(matcher) {
    const keys = Object.keys(this);
    let i = keys.length;
    let deleted = false;
    while (i--) {
      const key = keys[i];
      if (!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
        delete this[key];
        deleted = true;
      }
    }
    return deleted;
  }
  normalize(format) {
    const self2 = this;
    const headers = {};
    utils_default.forEach(this, (value, header) => {
      const key = utils_default.findKey(headers, header);
      if (key) {
        self2[key] = normalizeValue(value);
        delete self2[header];
        return;
      }
      const normalized = format ? formatHeader(header) : String(header).trim();
      if (normalized !== header) {
        delete self2[header];
      }
      self2[normalized] = normalizeValue(value);
      headers[normalized] = true;
    });
    return this;
  }
  concat(...targets) {
    return this.constructor.concat(this, ...targets);
  }
  toJSON(asStrings) {
    const obj = /* @__PURE__ */ Object.create(null);
    utils_default.forEach(this, (value, header) => {
      value != null && value !== false && (obj[header] = asStrings && utils_default.isArray(value) ? value.join(", ") : value);
    });
    return obj;
  }
  [Symbol.iterator]() {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }
  toString() {
    return Object.entries(this.toJSON()).map(([header, value]) => header + ": " + value).join("\n");
  }
  getSetCookie() {
    return this.get("set-cookie") || [];
  }
  get [Symbol.toStringTag]() {
    return "AxiosHeaders";
  }
  static from(thing) {
    return thing instanceof this ? thing : new this(thing);
  }
  static concat(first, ...targets) {
    const computed = new this(first);
    targets.forEach((target) => computed.set(target));
    return computed;
  }
  static accessor(header) {
    const internals = this[$internals] = this[$internals] = {
      accessors: {}
    };
    const accessors = internals.accessors;
    const prototype2 = this.prototype;
    function defineAccessor(_header) {
      const lHeader = normalizeHeader(_header);
      if (!accessors[lHeader]) {
        buildAccessors(prototype2, _header);
        accessors[lHeader] = true;
      }
    }
    utils_default.isArray(header) ? header.forEach(defineAccessor) : defineAccessor(header);
    return this;
  }
};
AxiosHeaders.accessor([
  "Content-Type",
  "Content-Length",
  "Accept",
  "Accept-Encoding",
  "User-Agent",
  "Authorization"
]);
utils_default.reduceDescriptors(AxiosHeaders.prototype, ({ value }, key) => {
  let mapped = key[0].toUpperCase() + key.slice(1);
  return {
    get: () => value,
    set(headerValue) {
      this[mapped] = headerValue;
    }
  };
});
utils_default.freezeMethods(AxiosHeaders);
var AxiosHeaders_default = AxiosHeaders;

// node_modules/axios/lib/core/transformData.js
function transformData(fns, response) {
  const config = this || defaults_default;
  const context = response || config;
  const headers = AxiosHeaders_default.from(context.headers);
  let data = context.data;
  utils_default.forEach(fns, function transform(fn) {
    data = fn.call(config, data, headers.normalize(), response ? response.status : void 0);
  });
  headers.normalize();
  return data;
}

// node_modules/axios/lib/cancel/isCancel.js
function isCancel(value) {
  return !!(value && value.__CANCEL__);
}

// node_modules/axios/lib/cancel/CanceledError.js
var CanceledError = class extends AxiosError_default {
  /**
   * A `CanceledError` is an object that is thrown when an operation is canceled.
   *
   * @param {string=} message The message.
   * @param {Object=} config The config.
   * @param {Object=} request The request.
   *
   * @returns {CanceledError} The created error.
   */
  constructor(message, config, request) {
    super(message == null ? "canceled" : message, AxiosError_default.ERR_CANCELED, config, request);
    this.name = "CanceledError";
    this.__CANCEL__ = true;
  }
};
var CanceledError_default = CanceledError;

// node_modules/axios/lib/core/settle.js
function settle(resolve, reject, response) {
  const validateStatus2 = response.config.validateStatus;
  if (!response.status || !validateStatus2 || validateStatus2(response.status)) {
    resolve(response);
  } else {
    reject(
      new AxiosError_default(
        "Request failed with status code " + response.status,
        [AxiosError_default.ERR_BAD_REQUEST, AxiosError_default.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4],
        response.config,
        response.request,
        response
      )
    );
  }
}

// node_modules/axios/lib/helpers/parseProtocol.js
function parseProtocol(url) {
  const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
  return match && match[1] || "";
}

// node_modules/axios/lib/helpers/speedometer.js
function speedometer(samplesCount, min) {
  samplesCount = samplesCount || 10;
  const bytes = new Array(samplesCount);
  const timestamps = new Array(samplesCount);
  let head = 0;
  let tail = 0;
  let firstSampleTS;
  min = min !== void 0 ? min : 1e3;
  return function push(chunkLength) {
    const now = Date.now();
    const startedAt = timestamps[tail];
    if (!firstSampleTS) {
      firstSampleTS = now;
    }
    bytes[head] = chunkLength;
    timestamps[head] = now;
    let i = tail;
    let bytesCount = 0;
    while (i !== head) {
      bytesCount += bytes[i++];
      i = i % samplesCount;
    }
    head = (head + 1) % samplesCount;
    if (head === tail) {
      tail = (tail + 1) % samplesCount;
    }
    if (now - firstSampleTS < min) {
      return;
    }
    const passed = startedAt && now - startedAt;
    return passed ? Math.round(bytesCount * 1e3 / passed) : void 0;
  };
}
var speedometer_default = speedometer;

// node_modules/axios/lib/helpers/throttle.js
function throttle(fn, freq) {
  let timestamp = 0;
  let threshold = 1e3 / freq;
  let lastArgs;
  let timer;
  const invoke = (args, now = Date.now()) => {
    timestamp = now;
    lastArgs = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn(...args);
  };
  const throttled = (...args) => {
    const now = Date.now();
    const passed = now - timestamp;
    if (passed >= threshold) {
      invoke(args, now);
    } else {
      lastArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          invoke(lastArgs);
        }, threshold - passed);
      }
    }
  };
  const flush = () => lastArgs && invoke(lastArgs);
  return [throttled, flush];
}
var throttle_default = throttle;

// node_modules/axios/lib/helpers/progressEventReducer.js
var progressEventReducer = (listener, isDownloadStream, freq = 3) => {
  let bytesNotified = 0;
  const _speedometer = speedometer_default(50, 250);
  return throttle_default((e) => {
    const rawLoaded = e.loaded;
    const total = e.lengthComputable ? e.total : void 0;
    const loaded = total != null ? Math.min(rawLoaded, total) : rawLoaded;
    const progressBytes = Math.max(0, loaded - bytesNotified);
    const rate = _speedometer(progressBytes);
    bytesNotified = Math.max(bytesNotified, loaded);
    const data = {
      loaded,
      total,
      progress: total ? loaded / total : void 0,
      bytes: progressBytes,
      rate: rate ? rate : void 0,
      estimated: rate && total ? (total - loaded) / rate : void 0,
      event: e,
      lengthComputable: total != null,
      [isDownloadStream ? "download" : "upload"]: true
    };
    listener(data);
  }, freq);
};
var progressEventDecorator = (total, throttled) => {
  const lengthComputable = total != null;
  return [
    (loaded) => throttled[0]({
      lengthComputable,
      total,
      loaded
    }),
    throttled[1]
  ];
};
var asyncDecorator = (fn) => (...args) => utils_default.asap(() => fn(...args));

// node_modules/axios/lib/helpers/isURLSameOrigin.js
var isURLSameOrigin_default = platform_default.hasStandardBrowserEnv ? /* @__PURE__ */ ((origin2, isMSIE) => (url) => {
  url = new URL(url, platform_default.origin);
  return origin2.protocol === url.protocol && origin2.host === url.host && (isMSIE || origin2.port === url.port);
})(
  new URL(platform_default.origin),
  platform_default.navigator && /(msie|trident)/i.test(platform_default.navigator.userAgent)
) : () => true;

// node_modules/axios/lib/helpers/cookies.js
var cookies_default = platform_default.hasStandardBrowserEnv ? (
  // Standard browser envs support document.cookie
  {
    write(name, value, expires, path, domain, secure, sameSite) {
      if (typeof document === "undefined") return;
      const cookie = [`${name}=${encodeURIComponent(value)}`];
      if (utils_default.isNumber(expires)) {
        cookie.push(`expires=${new Date(expires).toUTCString()}`);
      }
      if (utils_default.isString(path)) {
        cookie.push(`path=${path}`);
      }
      if (utils_default.isString(domain)) {
        cookie.push(`domain=${domain}`);
      }
      if (secure === true) {
        cookie.push("secure");
      }
      if (utils_default.isString(sameSite)) {
        cookie.push(`SameSite=${sameSite}`);
      }
      document.cookie = cookie.join("; ");
    },
    read(name) {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : null;
    },
    remove(name) {
      this.write(name, "", Date.now() - 864e5, "/");
    }
  }
) : (
  // Non-standard browser env (web workers, react-native) lack needed support.
  {
    write() {
    },
    read() {
      return null;
    },
    remove() {
    }
  }
);

// node_modules/axios/lib/helpers/isAbsoluteURL.js
function isAbsoluteURL(url) {
  if (typeof url !== "string") {
    return false;
  }
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}

// node_modules/axios/lib/helpers/combineURLs.js
function combineURLs(baseURL, relativeURL) {
  return relativeURL ? baseURL.replace(/\/?\/$/, "") + "/" + relativeURL.replace(/^\/+/, "") : baseURL;
}

// node_modules/axios/lib/core/buildFullPath.js
function buildFullPath(baseURL, requestedURL, allowAbsoluteUrls) {
  let isRelativeUrl = !isAbsoluteURL(requestedURL);
  if (baseURL && (isRelativeUrl || allowAbsoluteUrls === false)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
}

// node_modules/axios/lib/core/mergeConfig.js
var headersToObject = (thing) => thing instanceof AxiosHeaders_default ? { ...thing } : thing;
function mergeConfig(config1, config2) {
  config2 = config2 || {};
  const config = /* @__PURE__ */ Object.create(null);
  Object.defineProperty(config, "hasOwnProperty", {
    value: Object.prototype.hasOwnProperty,
    enumerable: false,
    writable: true,
    configurable: true
  });
  function getMergedValue(target, source, prop, caseless) {
    if (utils_default.isPlainObject(target) && utils_default.isPlainObject(source)) {
      return utils_default.merge.call({ caseless }, target, source);
    } else if (utils_default.isPlainObject(source)) {
      return utils_default.merge({}, source);
    } else if (utils_default.isArray(source)) {
      return source.slice();
    }
    return source;
  }
  function mergeDeepProperties(a, b, prop, caseless) {
    if (!utils_default.isUndefined(b)) {
      return getMergedValue(a, b, prop, caseless);
    } else if (!utils_default.isUndefined(a)) {
      return getMergedValue(void 0, a, prop, caseless);
    }
  }
  function valueFromConfig2(a, b) {
    if (!utils_default.isUndefined(b)) {
      return getMergedValue(void 0, b);
    }
  }
  function defaultToConfig2(a, b) {
    if (!utils_default.isUndefined(b)) {
      return getMergedValue(void 0, b);
    } else if (!utils_default.isUndefined(a)) {
      return getMergedValue(void 0, a);
    }
  }
  function mergeDirectKeys(a, b, prop) {
    if (utils_default.hasOwnProp(config2, prop)) {
      return getMergedValue(a, b);
    } else if (utils_default.hasOwnProp(config1, prop)) {
      return getMergedValue(void 0, a);
    }
  }
  const mergeMap = {
    url: valueFromConfig2,
    method: valueFromConfig2,
    data: valueFromConfig2,
    baseURL: defaultToConfig2,
    transformRequest: defaultToConfig2,
    transformResponse: defaultToConfig2,
    paramsSerializer: defaultToConfig2,
    timeout: defaultToConfig2,
    timeoutMessage: defaultToConfig2,
    withCredentials: defaultToConfig2,
    withXSRFToken: defaultToConfig2,
    adapter: defaultToConfig2,
    responseType: defaultToConfig2,
    xsrfCookieName: defaultToConfig2,
    xsrfHeaderName: defaultToConfig2,
    onUploadProgress: defaultToConfig2,
    onDownloadProgress: defaultToConfig2,
    decompress: defaultToConfig2,
    maxContentLength: defaultToConfig2,
    maxBodyLength: defaultToConfig2,
    beforeRedirect: defaultToConfig2,
    transport: defaultToConfig2,
    httpAgent: defaultToConfig2,
    httpsAgent: defaultToConfig2,
    cancelToken: defaultToConfig2,
    socketPath: defaultToConfig2,
    allowedSocketPaths: defaultToConfig2,
    responseEncoding: defaultToConfig2,
    validateStatus: mergeDirectKeys,
    headers: (a, b, prop) => mergeDeepProperties(headersToObject(a), headersToObject(b), prop, true)
  };
  utils_default.forEach(Object.keys({ ...config1, ...config2 }), function computeConfigValue(prop) {
    if (prop === "__proto__" || prop === "constructor" || prop === "prototype") return;
    const merge2 = utils_default.hasOwnProp(mergeMap, prop) ? mergeMap[prop] : mergeDeepProperties;
    const a = utils_default.hasOwnProp(config1, prop) ? config1[prop] : void 0;
    const b = utils_default.hasOwnProp(config2, prop) ? config2[prop] : void 0;
    const configValue = merge2(a, b, prop);
    utils_default.isUndefined(configValue) && merge2 !== mergeDirectKeys || (config[prop] = configValue);
  });
  return config;
}

// node_modules/axios/lib/helpers/resolveConfig.js
var resolveConfig_default = (config) => {
  const newConfig = mergeConfig({}, config);
  const own2 = (key) => utils_default.hasOwnProp(newConfig, key) ? newConfig[key] : void 0;
  const data = own2("data");
  let withXSRFToken = own2("withXSRFToken");
  const xsrfHeaderName = own2("xsrfHeaderName");
  const xsrfCookieName = own2("xsrfCookieName");
  let headers = own2("headers");
  const auth = own2("auth");
  const baseURL = own2("baseURL");
  const allowAbsoluteUrls = own2("allowAbsoluteUrls");
  const url = own2("url");
  newConfig.headers = headers = AxiosHeaders_default.from(headers);
  newConfig.url = buildURL(
    buildFullPath(baseURL, url, allowAbsoluteUrls),
    config.params,
    config.paramsSerializer
  );
  if (auth) {
    headers.set(
      "Authorization",
      "Basic " + btoa(
        (auth.username || "") + ":" + (auth.password ? unescape(encodeURIComponent(auth.password)) : "")
      )
    );
  }
  if (utils_default.isFormData(data)) {
    if (platform_default.hasStandardBrowserEnv || platform_default.hasStandardBrowserWebWorkerEnv) {
      headers.setContentType(void 0);
    } else if (utils_default.isFunction(data.getHeaders)) {
      const formHeaders = data.getHeaders();
      const allowedHeaders = ["content-type", "content-length"];
      Object.entries(formHeaders).forEach(([key, val]) => {
        if (allowedHeaders.includes(key.toLowerCase())) {
          headers.set(key, val);
        }
      });
    }
  }
  if (platform_default.hasStandardBrowserEnv) {
    if (utils_default.isFunction(withXSRFToken)) {
      withXSRFToken = withXSRFToken(newConfig);
    }
    const shouldSendXSRF = withXSRFToken === true || withXSRFToken == null && isURLSameOrigin_default(newConfig.url);
    if (shouldSendXSRF) {
      const xsrfValue = xsrfHeaderName && xsrfCookieName && cookies_default.read(xsrfCookieName);
      if (xsrfValue) {
        headers.set(xsrfHeaderName, xsrfValue);
      }
    }
  }
  return newConfig;
};

// node_modules/axios/lib/adapters/xhr.js
var isXHRAdapterSupported = typeof XMLHttpRequest !== "undefined";
var xhr_default = isXHRAdapterSupported && function(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    const _config = resolveConfig_default(config);
    let requestData = _config.data;
    const requestHeaders = AxiosHeaders_default.from(_config.headers).normalize();
    let { responseType, onUploadProgress, onDownloadProgress } = _config;
    let onCanceled;
    let uploadThrottled, downloadThrottled;
    let flushUpload, flushDownload;
    function done() {
      flushUpload && flushUpload();
      flushDownload && flushDownload();
      _config.cancelToken && _config.cancelToken.unsubscribe(onCanceled);
      _config.signal && _config.signal.removeEventListener("abort", onCanceled);
    }
    let request = new XMLHttpRequest();
    request.open(_config.method.toUpperCase(), _config.url, true);
    request.timeout = _config.timeout;
    function onloadend() {
      if (!request) {
        return;
      }
      const responseHeaders = AxiosHeaders_default.from(
        "getAllResponseHeaders" in request && request.getAllResponseHeaders()
      );
      const responseData = !responseType || responseType === "text" || responseType === "json" ? request.responseText : request.response;
      const response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config,
        request
      };
      settle(
        function _resolve(value) {
          resolve(value);
          done();
        },
        function _reject(err) {
          reject(err);
          done();
        },
        response
      );
      request = null;
    }
    if ("onloadend" in request) {
      request.onloadend = onloadend;
    } else {
      request.onreadystatechange = function handleLoad() {
        if (!request || request.readyState !== 4) {
          return;
        }
        if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf("file:") === 0)) {
          return;
        }
        setTimeout(onloadend);
      };
    }
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }
      reject(new AxiosError_default("Request aborted", AxiosError_default.ECONNABORTED, config, request));
      request = null;
    };
    request.onerror = function handleError(event2) {
      const msg = event2 && event2.message ? event2.message : "Network Error";
      const err = new AxiosError_default(msg, AxiosError_default.ERR_NETWORK, config, request);
      err.event = event2 || null;
      reject(err);
      request = null;
    };
    request.ontimeout = function handleTimeout() {
      let timeoutErrorMessage = _config.timeout ? "timeout of " + _config.timeout + "ms exceeded" : "timeout exceeded";
      const transitional2 = _config.transitional || transitional_default;
      if (_config.timeoutErrorMessage) {
        timeoutErrorMessage = _config.timeoutErrorMessage;
      }
      reject(
        new AxiosError_default(
          timeoutErrorMessage,
          transitional2.clarifyTimeoutError ? AxiosError_default.ETIMEDOUT : AxiosError_default.ECONNABORTED,
          config,
          request
        )
      );
      request = null;
    };
    requestData === void 0 && requestHeaders.setContentType(null);
    if ("setRequestHeader" in request) {
      utils_default.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
        request.setRequestHeader(key, val);
      });
    }
    if (!utils_default.isUndefined(_config.withCredentials)) {
      request.withCredentials = !!_config.withCredentials;
    }
    if (responseType && responseType !== "json") {
      request.responseType = _config.responseType;
    }
    if (onDownloadProgress) {
      [downloadThrottled, flushDownload] = progressEventReducer(onDownloadProgress, true);
      request.addEventListener("progress", downloadThrottled);
    }
    if (onUploadProgress && request.upload) {
      [uploadThrottled, flushUpload] = progressEventReducer(onUploadProgress);
      request.upload.addEventListener("progress", uploadThrottled);
      request.upload.addEventListener("loadend", flushUpload);
    }
    if (_config.cancelToken || _config.signal) {
      onCanceled = (cancel) => {
        if (!request) {
          return;
        }
        reject(!cancel || cancel.type ? new CanceledError_default(null, config, request) : cancel);
        request.abort();
        request = null;
      };
      _config.cancelToken && _config.cancelToken.subscribe(onCanceled);
      if (_config.signal) {
        _config.signal.aborted ? onCanceled() : _config.signal.addEventListener("abort", onCanceled);
      }
    }
    const protocol = parseProtocol(_config.url);
    if (protocol && platform_default.protocols.indexOf(protocol) === -1) {
      reject(
        new AxiosError_default(
          "Unsupported protocol " + protocol + ":",
          AxiosError_default.ERR_BAD_REQUEST,
          config
        )
      );
      return;
    }
    request.send(requestData || null);
  });
};

// node_modules/axios/lib/helpers/composeSignals.js
var composeSignals = (signals, timeout) => {
  const { length } = signals = signals ? signals.filter(Boolean) : [];
  if (timeout || length) {
    let controller = new AbortController();
    let aborted;
    const onabort = function(reason) {
      if (!aborted) {
        aborted = true;
        unsubscribe();
        const err = reason instanceof Error ? reason : this.reason;
        controller.abort(
          err instanceof AxiosError_default ? err : new CanceledError_default(err instanceof Error ? err.message : err)
        );
      }
    };
    let timer = timeout && setTimeout(() => {
      timer = null;
      onabort(new AxiosError_default(`timeout of ${timeout}ms exceeded`, AxiosError_default.ETIMEDOUT));
    }, timeout);
    const unsubscribe = () => {
      if (signals) {
        timer && clearTimeout(timer);
        timer = null;
        signals.forEach((signal2) => {
          signal2.unsubscribe ? signal2.unsubscribe(onabort) : signal2.removeEventListener("abort", onabort);
        });
        signals = null;
      }
    };
    signals.forEach((signal2) => signal2.addEventListener("abort", onabort));
    const { signal } = controller;
    signal.unsubscribe = () => utils_default.asap(unsubscribe);
    return signal;
  }
};
var composeSignals_default = composeSignals;

// node_modules/axios/lib/helpers/trackStream.js
var streamChunk = function* (chunk, chunkSize) {
  let len = chunk.byteLength;
  if (!chunkSize || len < chunkSize) {
    yield chunk;
    return;
  }
  let pos = 0;
  let end;
  while (pos < len) {
    end = pos + chunkSize;
    yield chunk.slice(pos, end);
    pos = end;
  }
};
var readBytes = async function* (iterable, chunkSize) {
  for await (const chunk of readStream(iterable)) {
    yield* streamChunk(chunk, chunkSize);
  }
};
var readStream = async function* (stream) {
  if (stream[Symbol.asyncIterator]) {
    yield* stream;
    return;
  }
  const reader = stream.getReader();
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield value;
    }
  } finally {
    await reader.cancel();
  }
};
var trackStream = (stream, chunkSize, onProgress, onFinish) => {
  const iterator2 = readBytes(stream, chunkSize);
  let bytes = 0;
  let done;
  let _onFinish = (e) => {
    if (!done) {
      done = true;
      onFinish && onFinish(e);
    }
  };
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          const { done: done2, value } = await iterator2.next();
          if (done2) {
            _onFinish();
            controller.close();
            return;
          }
          let len = value.byteLength;
          if (onProgress) {
            let loadedBytes = bytes += len;
            onProgress(loadedBytes);
          }
          controller.enqueue(new Uint8Array(value));
        } catch (err) {
          _onFinish(err);
          throw err;
        }
      },
      cancel(reason) {
        _onFinish(reason);
        return iterator2.return();
      }
    },
    {
      highWaterMark: 2
    }
  );
};

// node_modules/axios/lib/adapters/fetch.js
var DEFAULT_CHUNK_SIZE = 64 * 1024;
var { isFunction: isFunction2 } = utils_default;
var globalFetchAPI = (({ Request, Response }) => ({
  Request,
  Response
}))(utils_default.global);
var { ReadableStream: ReadableStream2, TextEncoder: TextEncoder2 } = utils_default.global;
var test = (fn, ...args) => {
  try {
    return !!fn(...args);
  } catch (e) {
    return false;
  }
};
var factory = (env) => {
  env = utils_default.merge.call(
    {
      skipUndefined: true
    },
    globalFetchAPI,
    env
  );
  const { fetch: envFetch, Request, Response } = env;
  const isFetchSupported = envFetch ? isFunction2(envFetch) : typeof fetch === "function";
  const isRequestSupported = isFunction2(Request);
  const isResponseSupported = isFunction2(Response);
  if (!isFetchSupported) {
    return false;
  }
  const isReadableStreamSupported = isFetchSupported && isFunction2(ReadableStream2);
  const encodeText = isFetchSupported && (typeof TextEncoder2 === "function" ? /* @__PURE__ */ ((encoder) => (str) => encoder.encode(str))(new TextEncoder2()) : async (str) => new Uint8Array(await new Request(str).arrayBuffer()));
  const supportsRequestStream = isRequestSupported && isReadableStreamSupported && test(() => {
    let duplexAccessed = false;
    const request = new Request(platform_default.origin, {
      body: new ReadableStream2(),
      method: "POST",
      get duplex() {
        duplexAccessed = true;
        return "half";
      }
    });
    const hasContentType = request.headers.has("Content-Type");
    if (request.body != null) {
      request.body.cancel();
    }
    return duplexAccessed && !hasContentType;
  });
  const supportsResponseStream = isResponseSupported && isReadableStreamSupported && test(() => utils_default.isReadableStream(new Response("").body));
  const resolvers = {
    stream: supportsResponseStream && ((res) => res.body)
  };
  isFetchSupported && (() => {
    ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((type) => {
      !resolvers[type] && (resolvers[type] = (res, config) => {
        let method = res && res[type];
        if (method) {
          return method.call(res);
        }
        throw new AxiosError_default(
          `Response type '${type}' is not supported`,
          AxiosError_default.ERR_NOT_SUPPORT,
          config
        );
      });
    });
  })();
  const getBodyLength = async (body) => {
    if (body == null) {
      return 0;
    }
    if (utils_default.isBlob(body)) {
      return body.size;
    }
    if (utils_default.isSpecCompliantForm(body)) {
      const _request = new Request(platform_default.origin, {
        method: "POST",
        body
      });
      return (await _request.arrayBuffer()).byteLength;
    }
    if (utils_default.isArrayBufferView(body) || utils_default.isArrayBuffer(body)) {
      return body.byteLength;
    }
    if (utils_default.isURLSearchParams(body)) {
      body = body + "";
    }
    if (utils_default.isString(body)) {
      return (await encodeText(body)).byteLength;
    }
  };
  const resolveBodyLength = async (headers, body) => {
    const length = utils_default.toFiniteNumber(headers.getContentLength());
    return length == null ? getBodyLength(body) : length;
  };
  return async (config) => {
    let {
      url,
      method,
      data,
      signal,
      cancelToken,
      timeout,
      onDownloadProgress,
      onUploadProgress,
      responseType,
      headers,
      withCredentials = "same-origin",
      fetchOptions
    } = resolveConfig_default(config);
    let _fetch = envFetch || fetch;
    responseType = responseType ? (responseType + "").toLowerCase() : "text";
    let composedSignal = composeSignals_default(
      [signal, cancelToken && cancelToken.toAbortSignal()],
      timeout
    );
    let request = null;
    const unsubscribe = composedSignal && composedSignal.unsubscribe && (() => {
      composedSignal.unsubscribe();
    });
    let requestContentLength;
    try {
      if (onUploadProgress && supportsRequestStream && method !== "get" && method !== "head" && (requestContentLength = await resolveBodyLength(headers, data)) !== 0) {
        let _request = new Request(url, {
          method: "POST",
          body: data,
          duplex: "half"
        });
        let contentTypeHeader;
        if (utils_default.isFormData(data) && (contentTypeHeader = _request.headers.get("content-type"))) {
          headers.setContentType(contentTypeHeader);
        }
        if (_request.body) {
          const [onProgress, flush] = progressEventDecorator(
            requestContentLength,
            progressEventReducer(asyncDecorator(onUploadProgress))
          );
          data = trackStream(_request.body, DEFAULT_CHUNK_SIZE, onProgress, flush);
        }
      }
      if (!utils_default.isString(withCredentials)) {
        withCredentials = withCredentials ? "include" : "omit";
      }
      const isCredentialsSupported = isRequestSupported && "credentials" in Request.prototype;
      if (utils_default.isFormData(data)) {
        const contentType = headers.getContentType();
        if (contentType && /^multipart\/form-data/i.test(contentType) && !/boundary=/i.test(contentType)) {
          headers.delete("content-type");
        }
      }
      const resolvedOptions = {
        ...fetchOptions,
        signal: composedSignal,
        method: method.toUpperCase(),
        headers: headers.normalize().toJSON(),
        body: data,
        duplex: "half",
        credentials: isCredentialsSupported ? withCredentials : void 0
      };
      request = isRequestSupported && new Request(url, resolvedOptions);
      let response = await (isRequestSupported ? _fetch(request, fetchOptions) : _fetch(url, resolvedOptions));
      const isStreamResponse = supportsResponseStream && (responseType === "stream" || responseType === "response");
      if (supportsResponseStream && (onDownloadProgress || isStreamResponse && unsubscribe)) {
        const options = {};
        ["status", "statusText", "headers"].forEach((prop) => {
          options[prop] = response[prop];
        });
        const responseContentLength = utils_default.toFiniteNumber(response.headers.get("content-length"));
        const [onProgress, flush] = onDownloadProgress && progressEventDecorator(
          responseContentLength,
          progressEventReducer(asyncDecorator(onDownloadProgress), true)
        ) || [];
        response = new Response(
          trackStream(response.body, DEFAULT_CHUNK_SIZE, onProgress, () => {
            flush && flush();
            unsubscribe && unsubscribe();
          }),
          options
        );
      }
      responseType = responseType || "text";
      let responseData = await resolvers[utils_default.findKey(resolvers, responseType) || "text"](
        response,
        config
      );
      !isStreamResponse && unsubscribe && unsubscribe();
      return await new Promise((resolve, reject) => {
        settle(resolve, reject, {
          data: responseData,
          headers: AxiosHeaders_default.from(response.headers),
          status: response.status,
          statusText: response.statusText,
          config,
          request
        });
      });
    } catch (err) {
      unsubscribe && unsubscribe();
      if (err && err.name === "TypeError" && /Load failed|fetch/i.test(err.message)) {
        throw Object.assign(
          new AxiosError_default(
            "Network Error",
            AxiosError_default.ERR_NETWORK,
            config,
            request,
            err && err.response
          ),
          {
            cause: err.cause || err
          }
        );
      }
      throw AxiosError_default.from(err, err && err.code, config, request, err && err.response);
    }
  };
};
var seedCache = /* @__PURE__ */ new Map();
var getFetch = (config) => {
  let env = config && config.env || {};
  const { fetch: fetch2, Request, Response } = env;
  const seeds = [Request, Response, fetch2];
  let len = seeds.length, i = len, seed, target, map = seedCache;
  while (i--) {
    seed = seeds[i];
    target = map.get(seed);
    target === void 0 && map.set(seed, target = i ? /* @__PURE__ */ new Map() : factory(env));
    map = target;
  }
  return target;
};
var adapter = getFetch();

// node_modules/axios/lib/adapters/adapters.js
var knownAdapters = {
  http: null_default,
  xhr: xhr_default,
  fetch: {
    get: getFetch
  }
};
utils_default.forEach(knownAdapters, (fn, value) => {
  if (fn) {
    try {
      Object.defineProperty(fn, "name", { value });
    } catch (e) {
    }
    Object.defineProperty(fn, "adapterName", { value });
  }
});
var renderReason = (reason) => `- ${reason}`;
var isResolvedHandle = (adapter2) => utils_default.isFunction(adapter2) || adapter2 === null || adapter2 === false;
function getAdapter(adapters, config) {
  adapters = utils_default.isArray(adapters) ? adapters : [adapters];
  const { length } = adapters;
  let nameOrAdapter;
  let adapter2;
  const rejectedReasons = {};
  for (let i = 0; i < length; i++) {
    nameOrAdapter = adapters[i];
    let id;
    adapter2 = nameOrAdapter;
    if (!isResolvedHandle(nameOrAdapter)) {
      adapter2 = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];
      if (adapter2 === void 0) {
        throw new AxiosError_default(`Unknown adapter '${id}'`);
      }
    }
    if (adapter2 && (utils_default.isFunction(adapter2) || (adapter2 = adapter2.get(config)))) {
      break;
    }
    rejectedReasons[id || "#" + i] = adapter2;
  }
  if (!adapter2) {
    const reasons = Object.entries(rejectedReasons).map(
      ([id, state]) => `adapter ${id} ` + (state === false ? "is not supported by the environment" : "is not available in the build")
    );
    let s = length ? reasons.length > 1 ? "since :\n" + reasons.map(renderReason).join("\n") : " " + renderReason(reasons[0]) : "as no adapter specified";
    throw new AxiosError_default(
      `There is no suitable adapter to dispatch the request ` + s,
      "ERR_NOT_SUPPORT"
    );
  }
  return adapter2;
}
var adapters_default = {
  /**
   * Resolve an adapter from a list of adapter names or functions.
   * @type {Function}
   */
  getAdapter,
  /**
   * Exposes all known adapters
   * @type {Object<string, Function|Object>}
   */
  adapters: knownAdapters
};

// node_modules/axios/lib/core/dispatchRequest.js
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
  if (config.signal && config.signal.aborted) {
    throw new CanceledError_default(null, config);
  }
}
function dispatchRequest(config) {
  throwIfCancellationRequested(config);
  config.headers = AxiosHeaders_default.from(config.headers);
  config.data = transformData.call(config, config.transformRequest);
  if (["post", "put", "patch"].indexOf(config.method) !== -1) {
    config.headers.setContentType("application/x-www-form-urlencoded", false);
  }
  const adapter2 = adapters_default.getAdapter(config.adapter || defaults_default.adapter, config);
  return adapter2(config).then(
    function onAdapterResolution(response) {
      throwIfCancellationRequested(config);
      response.data = transformData.call(config, config.transformResponse, response);
      response.headers = AxiosHeaders_default.from(response.headers);
      return response;
    },
    function onAdapterRejection(reason) {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);
        if (reason && reason.response) {
          reason.response.data = transformData.call(
            config,
            config.transformResponse,
            reason.response
          );
          reason.response.headers = AxiosHeaders_default.from(reason.response.headers);
        }
      }
      return Promise.reject(reason);
    }
  );
}

// node_modules/axios/lib/env/data.js
var VERSION = "1.15.2";

// node_modules/axios/lib/helpers/validator.js
var validators = {};
["object", "boolean", "number", "function", "string", "symbol"].forEach((type, i) => {
  validators[type] = function validator(thing) {
    return typeof thing === type || "a" + (i < 1 ? "n " : " ") + type;
  };
});
var deprecatedWarnings = {};
validators.transitional = function transitional(validator, version, message) {
  function formatMessage(opt, desc) {
    return "[Axios v" + VERSION + "] Transitional option '" + opt + "'" + desc + (message ? ". " + message : "");
  }
  return (value, opt, opts) => {
    if (validator === false) {
      throw new AxiosError_default(
        formatMessage(opt, " has been removed" + (version ? " in " + version : "")),
        AxiosError_default.ERR_DEPRECATED
      );
    }
    if (version && !deprecatedWarnings[opt]) {
      deprecatedWarnings[opt] = true;
      console.warn(
        formatMessage(
          opt,
          " has been deprecated since v" + version + " and will be removed in the near future"
        )
      );
    }
    return validator ? validator(value, opt, opts) : true;
  };
};
validators.spelling = function spelling(correctSpelling) {
  return (value, opt) => {
    console.warn(`${opt} is likely a misspelling of ${correctSpelling}`);
    return true;
  };
};
function assertOptions(options, schema, allowUnknown) {
  if (typeof options !== "object") {
    throw new AxiosError_default("options must be an object", AxiosError_default.ERR_BAD_OPTION_VALUE);
  }
  const keys = Object.keys(options);
  let i = keys.length;
  while (i-- > 0) {
    const opt = keys[i];
    const validator = Object.prototype.hasOwnProperty.call(schema, opt) ? schema[opt] : void 0;
    if (validator) {
      const value = options[opt];
      const result = value === void 0 || validator(value, opt, options);
      if (result !== true) {
        throw new AxiosError_default(
          "option " + opt + " must be " + result,
          AxiosError_default.ERR_BAD_OPTION_VALUE
        );
      }
      continue;
    }
    if (allowUnknown !== true) {
      throw new AxiosError_default("Unknown option " + opt, AxiosError_default.ERR_BAD_OPTION);
    }
  }
}
var validator_default = {
  assertOptions,
  validators
};

// node_modules/axios/lib/core/Axios.js
var validators2 = validator_default.validators;
var Axios = class {
  constructor(instanceConfig) {
    this.defaults = instanceConfig || {};
    this.interceptors = {
      request: new InterceptorManager_default(),
      response: new InterceptorManager_default()
    };
  }
  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  async request(configOrUrl, config) {
    try {
      return await this._request(configOrUrl, config);
    } catch (err) {
      if (err instanceof Error) {
        let dummy = {};
        Error.captureStackTrace ? Error.captureStackTrace(dummy) : dummy = new Error();
        const stack = (() => {
          if (!dummy.stack) {
            return "";
          }
          const firstNewlineIndex = dummy.stack.indexOf("\n");
          return firstNewlineIndex === -1 ? "" : dummy.stack.slice(firstNewlineIndex + 1);
        })();
        try {
          if (!err.stack) {
            err.stack = stack;
          } else if (stack) {
            const firstNewlineIndex = stack.indexOf("\n");
            const secondNewlineIndex = firstNewlineIndex === -1 ? -1 : stack.indexOf("\n", firstNewlineIndex + 1);
            const stackWithoutTwoTopLines = secondNewlineIndex === -1 ? "" : stack.slice(secondNewlineIndex + 1);
            if (!String(err.stack).endsWith(stackWithoutTwoTopLines)) {
              err.stack += "\n" + stack;
            }
          }
        } catch (e) {
        }
      }
      throw err;
    }
  }
  _request(configOrUrl, config) {
    if (typeof configOrUrl === "string") {
      config = config || {};
      config.url = configOrUrl;
    } else {
      config = configOrUrl || {};
    }
    config = mergeConfig(this.defaults, config);
    const { transitional: transitional2, paramsSerializer, headers } = config;
    if (transitional2 !== void 0) {
      validator_default.assertOptions(
        transitional2,
        {
          silentJSONParsing: validators2.transitional(validators2.boolean),
          forcedJSONParsing: validators2.transitional(validators2.boolean),
          clarifyTimeoutError: validators2.transitional(validators2.boolean),
          legacyInterceptorReqResOrdering: validators2.transitional(validators2.boolean)
        },
        false
      );
    }
    if (paramsSerializer != null) {
      if (utils_default.isFunction(paramsSerializer)) {
        config.paramsSerializer = {
          serialize: paramsSerializer
        };
      } else {
        validator_default.assertOptions(
          paramsSerializer,
          {
            encode: validators2.function,
            serialize: validators2.function
          },
          true
        );
      }
    }
    if (config.allowAbsoluteUrls !== void 0) {
    } else if (this.defaults.allowAbsoluteUrls !== void 0) {
      config.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls;
    } else {
      config.allowAbsoluteUrls = true;
    }
    validator_default.assertOptions(
      config,
      {
        baseUrl: validators2.spelling("baseURL"),
        withXsrfToken: validators2.spelling("withXSRFToken")
      },
      true
    );
    config.method = (config.method || this.defaults.method || "get").toLowerCase();
    let contextHeaders = headers && utils_default.merge(headers.common, headers[config.method]);
    headers && utils_default.forEach(["delete", "get", "head", "post", "put", "patch", "common"], (method) => {
      delete headers[method];
    });
    config.headers = AxiosHeaders_default.concat(contextHeaders, headers);
    const requestInterceptorChain = [];
    let synchronousRequestInterceptors = true;
    this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
      if (typeof interceptor.runWhen === "function" && interceptor.runWhen(config) === false) {
        return;
      }
      synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
      const transitional3 = config.transitional || transitional_default;
      const legacyInterceptorReqResOrdering = transitional3 && transitional3.legacyInterceptorReqResOrdering;
      if (legacyInterceptorReqResOrdering) {
        requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
      } else {
        requestInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
      }
    });
    const responseInterceptorChain = [];
    this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
      responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
    });
    let promise;
    let i = 0;
    let len;
    if (!synchronousRequestInterceptors) {
      const chain = [dispatchRequest.bind(this), void 0];
      chain.unshift(...requestInterceptorChain);
      chain.push(...responseInterceptorChain);
      len = chain.length;
      promise = Promise.resolve(config);
      while (i < len) {
        promise = promise.then(chain[i++], chain[i++]);
      }
      return promise;
    }
    len = requestInterceptorChain.length;
    let newConfig = config;
    while (i < len) {
      const onFulfilled = requestInterceptorChain[i++];
      const onRejected = requestInterceptorChain[i++];
      try {
        newConfig = onFulfilled(newConfig);
      } catch (error) {
        onRejected.call(this, error);
        break;
      }
    }
    try {
      promise = dispatchRequest.call(this, newConfig);
    } catch (error) {
      return Promise.reject(error);
    }
    i = 0;
    len = responseInterceptorChain.length;
    while (i < len) {
      promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
    }
    return promise;
  }
  getUri(config) {
    config = mergeConfig(this.defaults, config);
    const fullPath = buildFullPath(config.baseURL, config.url, config.allowAbsoluteUrls);
    return buildURL(fullPath, config.params, config.paramsSerializer);
  }
};
utils_default.forEach(["delete", "get", "head", "options"], function forEachMethodNoData(method) {
  Axios.prototype[method] = function(url, config) {
    return this.request(
      mergeConfig(config || {}, {
        method,
        url,
        data: (config || {}).data
      })
    );
  };
});
utils_default.forEach(["post", "put", "patch"], function forEachMethodWithData(method) {
  function generateHTTPMethod(isForm) {
    return function httpMethod(url, data, config) {
      return this.request(
        mergeConfig(config || {}, {
          method,
          headers: isForm ? {
            "Content-Type": "multipart/form-data"
          } : {},
          url,
          data
        })
      );
    };
  }
  Axios.prototype[method] = generateHTTPMethod();
  Axios.prototype[method + "Form"] = generateHTTPMethod(true);
});
var Axios_default = Axios;

// node_modules/axios/lib/cancel/CancelToken.js
var CancelToken = class _CancelToken {
  constructor(executor) {
    if (typeof executor !== "function") {
      throw new TypeError("executor must be a function.");
    }
    let resolvePromise;
    this.promise = new Promise(function promiseExecutor(resolve) {
      resolvePromise = resolve;
    });
    const token = this;
    this.promise.then((cancel) => {
      if (!token._listeners) return;
      let i = token._listeners.length;
      while (i-- > 0) {
        token._listeners[i](cancel);
      }
      token._listeners = null;
    });
    this.promise.then = (onfulfilled) => {
      let _resolve;
      const promise = new Promise((resolve) => {
        token.subscribe(resolve);
        _resolve = resolve;
      }).then(onfulfilled);
      promise.cancel = function reject() {
        token.unsubscribe(_resolve);
      };
      return promise;
    };
    executor(function cancel(message, config, request) {
      if (token.reason) {
        return;
      }
      token.reason = new CanceledError_default(message, config, request);
      resolvePromise(token.reason);
    });
  }
  /**
   * Throws a `CanceledError` if cancellation has been requested.
   */
  throwIfRequested() {
    if (this.reason) {
      throw this.reason;
    }
  }
  /**
   * Subscribe to the cancel signal
   */
  subscribe(listener) {
    if (this.reason) {
      listener(this.reason);
      return;
    }
    if (this._listeners) {
      this._listeners.push(listener);
    } else {
      this._listeners = [listener];
    }
  }
  /**
   * Unsubscribe from the cancel signal
   */
  unsubscribe(listener) {
    if (!this._listeners) {
      return;
    }
    const index = this._listeners.indexOf(listener);
    if (index !== -1) {
      this._listeners.splice(index, 1);
    }
  }
  toAbortSignal() {
    const controller = new AbortController();
    const abort = (err) => {
      controller.abort(err);
    };
    this.subscribe(abort);
    controller.signal.unsubscribe = () => this.unsubscribe(abort);
    return controller.signal;
  }
  /**
   * Returns an object that contains a new `CancelToken` and a function that, when called,
   * cancels the `CancelToken`.
   */
  static source() {
    let cancel;
    const token = new _CancelToken(function executor(c) {
      cancel = c;
    });
    return {
      token,
      cancel
    };
  }
};
var CancelToken_default = CancelToken;

// node_modules/axios/lib/helpers/spread.js
function spread(callback) {
  return function wrap(arr) {
    return callback.apply(null, arr);
  };
}

// node_modules/axios/lib/helpers/isAxiosError.js
function isAxiosError(payload) {
  return utils_default.isObject(payload) && payload.isAxiosError === true;
}

// node_modules/axios/lib/helpers/HttpStatusCode.js
var HttpStatusCode = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  Ok: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  ImUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  Unused: 306,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  UriTooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HttpVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
  WebServerIsDown: 521,
  ConnectionTimedOut: 522,
  OriginIsUnreachable: 523,
  TimeoutOccurred: 524,
  SslHandshakeFailed: 525,
  InvalidSslCertificate: 526
};
Object.entries(HttpStatusCode).forEach(([key, value]) => {
  HttpStatusCode[value] = key;
});
var HttpStatusCode_default = HttpStatusCode;

// node_modules/axios/lib/axios.js
function createInstance(defaultConfig) {
  const context = new Axios_default(defaultConfig);
  const instance = bind(Axios_default.prototype.request, context);
  utils_default.extend(instance, Axios_default.prototype, context, { allOwnKeys: true });
  utils_default.extend(instance, context, null, { allOwnKeys: true });
  instance.create = function create(instanceConfig) {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };
  return instance;
}
var axios = createInstance(defaults_default);
axios.Axios = Axios_default;
axios.CanceledError = CanceledError_default;
axios.CancelToken = CancelToken_default;
axios.isCancel = isCancel;
axios.VERSION = VERSION;
axios.toFormData = toFormData_default;
axios.AxiosError = AxiosError_default;
axios.Cancel = axios.CanceledError;
axios.all = function all(promises) {
  return Promise.all(promises);
};
axios.spread = spread;
axios.isAxiosError = isAxiosError;
axios.mergeConfig = mergeConfig;
axios.AxiosHeaders = AxiosHeaders_default;
axios.formToJSON = (thing) => formDataToJSON_default(utils_default.isHTMLForm(thing) ? new FormData(thing) : thing);
axios.getAdapter = adapters_default.getAdapter;
axios.HttpStatusCode = HttpStatusCode_default;
axios.default = axios;
var axios_default = axios;

// node_modules/axios/index.js
var {
  Axios: Axios2,
  AxiosError: AxiosError2,
  CanceledError: CanceledError2,
  isCancel: isCancel2,
  CancelToken: CancelToken2,
  VERSION: VERSION2,
  all: all2,
  Cancel,
  isAxiosError: isAxiosError2,
  spread: spread2,
  toFormData: toFormData2,
  AxiosHeaders: AxiosHeaders2,
  HttpStatusCode: HttpStatusCode2,
  formToJSON,
  getAdapter: getAdapter2,
  mergeConfig: mergeConfig2
} = axios_default;

// artifacts/n64/mupen64plus-web-1.5.7-baseline/idbfs-file-utils.js
var onUpgradeNeeded = function(event2) {
  var db = event2.target.result;
  if (!db.objectStoreNames.contains("FILE_DATA")) {
    const objectStore = db.createObjectStore("FILE_DATA");
    objectStore.createIndex("timestamp", "timestamp", { unique: false, multiEntry: false });
    objectStore.add({
      timestamp: new Date(Date.now()),
      mode: 16832
    }, "/mupen64plus/saves");
    objectStore.add({
      timestamp: new Date(Date.now()),
      mode: 16832
    }, "/mupen64plus/data");
  }
};
var getFile = function(fileKey) {
  return new Promise(function(resolve, reject) {
    const connection = indexedDB.open("/mupen64plus");
    connection.onupgradeneeded = onUpgradeNeeded;
    connection.onerror = (event2) => {
      console.error("Error while updating IDBFS store: %o", event2);
      reject(event2);
    };
    connection.onsuccess = (e) => {
      const db = e.target.result;
      const transaction = db.transaction("FILE_DATA", "readonly");
      const store = transaction.objectStore("FILE_DATA");
      const request = store.get(fileKey);
      request.onerror = function(event2) {
        console.error("Error while loading file %s from IDBFS: %o", fileKey, event2);
        reject(event2);
      };
      request.onsuccess = function(event2) {
        const contents = event2.target.result ? event2.target.result.contents : null;
        resolve({ fileKey, contents });
      };
    };
  });
};
var putFile = function(fileKey, data) {
  return new Promise(function(resolve, reject) {
    const connection = indexedDB.open("/mupen64plus");
    connection.onupgradeneeded = onUpgradeNeeded;
    connection.onerror = function(event2) {
      console.error("Error while updating IDBFS store: %o", event2);
      reject(event2);
    };
    connection.onsuccess = (e) => {
      const db = e.target.result;
      const transaction = db.transaction("FILE_DATA", "readwrite");
      const store = transaction.objectStore("FILE_DATA");
      const toSave = {
        contents: data,
        timestamp: new Date(Date.now()),
        mode: 33206
        // whatever this means
      };
      const request = store.put(toSave, fileKey);
      request.onerror = function(event2) {
        console.error("Error while loading file %s from IDBFS: %o", fileKey, event2);
        reject(event2);
      };
      request.onsuccess = function(event2) {
        const contents = event2.target.result ? event2.target.result.contents : null;
        resolve({ fileKey, contents });
      };
    };
  });
};

// artifacts/n64/mupen64plus-web-1.5.7-baseline/gamepad-utils.js
function preloadAutoInputConfig(publicPath, shouldForce) {
  return getFile("/mupen64plus/data/InputAutoCfg.ini").then((result) => {
    if (!result.contents || shouldForce) {
      return axios_default.get(`${publicPath}/InputAutoCfg.ini`).then((resp) => {
        return putFile("/mupen64plus/data/InputAutoCfg.ini", new TextEncoder().encode(resp.data));
      });
    }
  });
}
function findAutoInputConfig(joystickName) {
  return getFile("/mupen64plus/data/InputAutoCfg.ini").then((result) => {
    if (!result.contents) {
      return null;
    } else {
      const text = new TextDecoder().decode(result.contents);
      const match = findBestMatch(text, joystickName);
      const matchedConfig = parseConfigAtLine(text, match.lineNumber);
      return { matchName: match.name, matchScore: match.joyFoundScore, config: matchedConfig };
    }
  });
}
function writeAutoInputConfig(name, config) {
  return getFile("/mupen64plus/data/InputAutoCfg.ini").then((result) => {
    let text;
    if (result.contents) {
      text = new TextDecoder().decode(result.contents);
    } else {
      text = "\n[Keyboard]\nplugged = True\nplugin = 2\nmouse = False\nDPad R = key(100)\nDPad L = key(97)\nDPad D = key(115)\nDPad U = key(119)\nStart = key(13)\nZ Trig = key(122)\nB Button = key(306)\nA Button = key(304)\nC Button R = key(108)\nC Button L = key(106)\nC Button D = key(107)\nC Button U = key(105)\nR Trig = key(99)\nL Trig = key(120)\nMempak switch = key(44)\nRumblepak switch = key(46)\nX Axis = key(276,275)\nY Axis = key(273,274)\n\n";
    }
    text = updateAutoInputConfig(text, name, config);
    return putFile("/mupen64plus/data/InputAutoCfg.ini", new TextEncoder().encode(text));
  });
}
function updateAutoInputConfig(inputIniText, name, configEntry) {
  let text = inputIniText;
  let lines = text.split("\n");
  const maybeExistingConfigIndex = lines.findIndex((line) => {
    if (line[0] === "[") {
      const trimmed = line.trim().replace(/^\[/g, "").replace(/\]$/g, "").trim();
      if (trimmed === name.trim()) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  });
  let configStartLine = 0;
  if (maybeExistingConfigIndex !== -1) {
    configStartLine = maybeExistingConfigIndex;
    for (let line of lines.slice(configStartLine + 1, lines.length)) {
      if (line[0] !== "[") {
        break;
      }
      configStartLine++;
    }
    configStartLine++;
    text = removeConfigStartingAtLine(text, configStartLine);
    lines = text.split("\n");
  } else {
    text += "\n";
    text += `[${name}]`;
    lines = text.split("\n");
    configStartLine = lines.length - 1 + 2;
  }
  text = putConfigAtLine(configEntry, text, configStartLine);
  return text;
}
function putConfigAtLine(config, text, configStartLine) {
  const lines = text.split("\n");
  const newConfigLines = Object.entries(config).map((entry) => {
    return `${entry[0]} = ${entry[1]}`;
  });
  lines.splice(configStartLine, 0, ...newConfigLines);
  return lines.join("\n");
}
function removeConfigStartingAtLine(text, startLine) {
  const lines = text.split("\n");
  let offsetEndLine = lines.slice(startLine).findIndex((line) => line.trim() === "") === -1 ? lines.slice(startLine).length : lines.slice(startLine).findIndex((line) => line.trim() === "");
  const endLine = startLine + offsetEndLine;
  const numberOfConfigLines = endLine - startLine;
  lines.splice(startLine, numberOfConfigLines);
  return lines.join("\n");
}
function parseConfigAtLine(text, lineNumber) {
  const lines = text.split("\n");
  let configEnd = lineNumber;
  for (const line of lines.slice(lineNumber)) {
    if (line.trim() === "") {
      break;
    }
    configEnd++;
  }
  const configLines = lines.slice(lineNumber, configEnd).filter((line) => line[0] !== "[");
  return configLines.map((line) => {
    const entry = line.split("=");
    const key = entry[0].trim();
    const value = entry[1] ? entry[1].trim() : "";
    return { [key]: value };
  }).reduce((acc, value) => {
    return Object.assign({}, acc, value);
  });
}
function findBestMatch(text, gamepadName) {
  const nameResults = text.split("\n").map((line, index) => ({ text: line, lineNumber: index })).filter((line) => line.text[0] === "[").map((line) => {
    return {
      text: line.text.substring(1, line.text.length - 1),
      lineNumber: line.lineNumber
    };
  });
  const bestMatch = nameResults.map((name) => {
    let joyFoundScore = 0;
    name.text.split(" ").map((word) => word.trim().toUpperCase()).filter((word) => word !== "").forEach((word) => {
      if (gamepadName.toUpperCase().indexOf(word) !== -1) {
        joyFoundScore += 4;
      }
    });
    return { joyFoundScore, name: name.text, lineNumber: name.lineNumber };
  }).reduce((a, b) => {
    if (Math.max(a.joyFoundScore, b.joyFoundScore) === a.joyFoundScore) {
      return a;
    } else {
      return b;
    }
  });
  return bestMatch;
}

// artifacts/n64/mupen64plus-web-1.5.7-baseline/module.js
var Module = {
  preRun: [],
  postRun: [],
  // mupen64plus config
  coreConfig: {
    mainLoopTimingMode: 0,
    // 0 = requestAnimationFrame, 1+ = setTimeout(n)
    emuMode: 0
    // 0 = pure_interpreter (recomended) ; 1 = cached (seems to somewhat work)
  },
  romData: void 0,
  netplay: {},
  netplayConfig: {
    player: 0
    // netplay is only activated if player != 0
    // Also need to provide: 'reliableChannel' and 'unreliableChannel'
  },
  findAutoInputConfig,
  // end mupen64plus config
  print: /* @__PURE__ */ function() {
    return function(text) {
      if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(" ");
      console.log(text);
    };
  }(),
  printErr: function(text) {
    if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(" ");
    if (0) {
      dump(text + "\n");
    } else {
      console.error(text);
    }
  },
  setErrorStatus: function(message) {
    console.log("Module.setErrorStatus: %o", message);
  },
  setStatus: function(text) {
  },
  totalDependencies: 0,
  monitorRunDependencies: function(left) {
    this.totalDependencies = Math.max(this.totalDependencies, left);
    Module.setStatus(left ? "Preparing... (" + (this.totalDependencies - left) + "/" + this.totalDependencies + ")" : "All downloads complete.");
  },
  fetchFile: function(url, filepath, onload, onerror) {
    console.log("Fetching file ", filepath, " from url: ", url);
    var path = filepath.substr(0, filepath.lastIndexOf("/"));
    var filename = filepath.substr(filepath.lastIndexOf("/") + 1);
    console.log("will create file at path: ", path, " and filename: ", filename);
    var xhr = new XMLHttpRequest();
    xhr.overrideMimeType("test/pain; charset=x-user-defined");
    xhr.onreadystatechange = (e) => {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          try {
            console.log("size of xhr is ", xhr.response.length);
            this.FS.createDataFile(path, filename, xhr.response, true, true);
            console.log("url ", url, " loaded and written to file ", filepath);
            if (onload) {
              onload();
            }
          } catch (e2) {
            if (onerror) {
              onerror(e2);
            }
          }
        } else {
          if (onerror) {
            onerror();
          }
        }
      }
    };
    xhr.onerror = function(e) {
      console.error("error loding url: ", url, " error: ", e);
      if (onerror) {
        onerror(e);
      }
    };
    xhr.open("GET", url, true);
    xhr.send();
  }
};
var module_default = Module;

// artifacts/n64/mupen64plus-web-1.5.7-baseline/main.bundle-entry.js
var mainMupen64PlusWebJsFileName = "index.7f0ebbf78c.js";
var putSaveFile = function(fileName, fileData) {
  return putFile("/mupen64plus/saves/" + fileName, new Int8Array(fileData));
};
var getAllSaveFiles = function() {
  return new Promise(function(resolve, reject) {
    const connection = indexedDB.open("/mupen64plus");
    connection.onupgradeneeded = function(e) {
      console.log("onupgradeneeded");
      var db = e.target.result;
      if (!db.objectStoreNames.contains("FILE_DATA")) {
        const objectStore = db.createObjectStore("FILE_DATA");
        objectStore.createIndex("timestamp", "timestamp", { unique: false, multiEntry: false });
        objectStore.add({
          timestamp: new Date(Date.now()),
          mode: 16832
        }, "/mupen64plus/saves");
        objectStore.add({
          timestamp: new Date(Date.now()),
          mode: 16832
        }, "/mupen64plus/data");
      }
    };
    connection.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("FILE_DATA")) {
        resolve([]);
        return;
      }
      const transaction = db.transaction("FILE_DATA", "readonly");
      const store = transaction.objectStore("FILE_DATA");
      const request = store.getAllKeys();
      request.onerror = function(event2) {
        console.error("Error while querying keys from IDBFS: %o", event2);
        reject(event2);
      };
      request.onsuccess = function(event2) {
        const keys = event2.target.result;
        const saveFileKeys = keys.filter((key) => {
          return key !== "/mupen64plus/saves" && key.includes("/mupen64plus/saves");
        });
        const getFilePromises = saveFileKeys.map((key) => {
          return getFile(key);
        });
        Promise.all(getFilePromises).then((results) => {
          resolve(results);
        });
      };
    };
  });
};
var createMupen64PlusWeb = function(extraModuleArgs) {
  console.log(module_default);
  const m = Object.assign({}, module_default, extraModuleArgs);
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
  m.canvas.addEventListener("webglcontextlost", function(e) {
    alert("WebGL context lost. You will need to reload the page.");
    e.preventDefault();
  }, false);
  console.log("module: %o", m);
  window.onerror = function(event2) {
    console.error("Exception thrown: ", event2);
    m.setErrorStatus(event2);
  };
  return (0, import_index_7f0ebbf78c.default)(m).then((module) => {
    return module.emulatorControls;
  });
};
var main_bundle_entry_default = createMupen64PlusWeb;
export {
  main_bundle_entry_default as default,
  findAutoInputConfig,
  getAllSaveFiles,
  mainMupen64PlusWebJsFileName,
  preloadAutoInputConfig,
  putSaveFile,
  writeAutoInputConfig
};
