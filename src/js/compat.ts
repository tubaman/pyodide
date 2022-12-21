// Detect if we're in node
declare var process: any;

export const IN_NODE =
  typeof process !== "undefined" &&
  process.release &&
  process.release.name === "node" &&
  typeof process.browser ===
    "undefined"; /* This last condition checks if we run the browser shim of process */

let nodeUrlMod: any;
let nodeFetch: any;
let nodePath: any;
let nodeVmMod: any;
/** @private */
export let nodeFsPromisesMod: any;

// Detect if we're in Greasemonkey
// @ts-ignore
export const IN_GM = typeof GM.xmlHttpRequest === "function";

declare var globalThis: {
  importScripts: (url: string) => void;
  document?: any;
  fetch?: any;
  asmData?: any;
};

/**
 * If we're in node, it's most convenient to import various node modules on
 * initialization. Otherwise, this does nothing.
 * @private
 */
export async function initNodeModules() {
  if (!IN_NODE) {
    return;
  }
  // @ts-ignore
  nodeUrlMod = (await import("url")).default;
  nodeFsPromisesMod = await import("fs/promises");
  if (globalThis.fetch) {
    nodeFetch = fetch;
  } else {
    // @ts-ignore
    nodeFetch = (await import("node-fetch")).default;
  }
  // @ts-ignore
  nodeVmMod = (await import("vm")).default;
  nodePath = await import("path");
  pathSep = nodePath.sep;

  // Emscripten uses `require`, so if it's missing (because we were imported as
  // an ES6 module) we need to polyfill `require` with `import`. `import` is
  // async and `require` is synchronous, so we import all packages that might be
  // required up front and define require to look them up in this table.

  if (typeof require !== "undefined") {
    return;
  }
  // These are all the packages required in pyodide.asm.js. You can get this
  // list with:
  // $ grep -o 'require("[a-z]*")' pyodide.asm.js  | sort -u
  const fs = await import("fs");
  const crypto = await import("crypto");
  const ws = await import("ws");
  const child_process = await import("child_process");
  const node_modules: { [mode: string]: any } = {
    fs,
    crypto,
    ws,
    child_process,
  };
  // Since we're in an ES6 module, this is only modifying the module namespace,
  // it's still private to Pyodide.
  (globalThis as any).require = function (mod: string): any {
    return node_modules[mod];
  };
}

function node_resolvePath(path: string, base?: string): string {
  return nodePath.resolve(base || ".", path);
}

function browser_resolvePath(path: string, base?: string): string {
  if (base === undefined) {
    // @ts-ignore
    base = location;
  }
  return new URL(path, base).toString();
}

export let resolvePath: (rest: string, base?: string) => string;
if (IN_NODE) {
  resolvePath = node_resolvePath;
} else {
  resolvePath = browser_resolvePath;
}

/**
 * Get the path separator. If we are on Linux or in the browser, it's /.
 * In Windows, it's \.
 * @private
 */
export let pathSep: string;

if (!IN_NODE) {
  pathSep = "/";
}

/**
 * Load a binary file, only for use in Node. If the path explicitly is a URL,
 * then fetch from a URL, else load from the file system.
 * @param indexURL base path to resolve relative paths
 * @param path the path to load
 * @param checksum sha-256 checksum of the package
 * @returns An ArrayBuffer containing the binary data
 * @private
 */
async function node_loadBinaryFile(
  path: string,
  _file_sub_resource_hash?: string | undefined, // Ignoring sub resource hash. See issue-2431.
): Promise<Uint8Array> {
  if (path.startsWith("file://")) {
    // handle file:// with filesystem operations rather than with fetch.
    path = path.slice("file://".length);
  }
  if (path.includes("://")) {
    // If it has a protocol, make a fetch request
    let response = await nodeFetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load '${path}': request failed.`);
    }
    return new Uint8Array(await response.arrayBuffer());
  } else {
    // Otherwise get it from the file system
    const data = await nodeFsPromisesMod.readFile(path);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
}

/**
 * Load a binary file, only for use in browser. Resolves relative paths against
 * indexURL.
 *
 * @param path the path to load
 * @param subResourceHash the sub resource hash for fetch() integrity check
 * @returns A Uint8Array containing the binary data
 * @private
 */
async function browser_loadBinaryFile(
  path: string,
  subResourceHash: string | undefined,
): Promise<Uint8Array> {
  // @ts-ignore
  const url = new URL(path, location);
  let options = subResourceHash ? { integrity: subResourceHash } : {};
  // @ts-ignore
  let response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Failed to load '${url}': request failed.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Perform an HTTP GET, only for use in Greasemonkey.
 *
 * @param path the path to load
 * @returns A response
 * @private
 */
async function greasemonkey_get(
  path: string,
  responseType: string,
): Promise<any> {
  console.log("greasemonkey_get");
  console.log("path: " + path);
  return new Promise((resolve, reject) => {
    // @ts-ignore
    GM.xmlHttpRequest({
      method: "GET",
      url: path,
      responseType: responseType,
      // @ts-ignore
      onload: function(response) {
        console.log("greasemonkey_get GM.xmlHttpRequest onload response: " + JSON.stringify(response));
        console.log("greasemonkey_get GM.xmlHttpRequest onload response.responseText: " + JSON.stringify(response.responseText));
        console.log("greasemonkey_get GM.xmlHttpRequest onload response.response: " + JSON.stringify(response.response));
        resolve(response);
      },
      // @ts-ignore
      onerror: function(response) {
        console.log("greasemonkey_get GM.xmlHttpRequest onerror response: " + JSON.stringify(response));
        reject(response);
      }
    });
  });
}

/**
 * Load a binary file, only for use in Greasemonkey. Resolves relative paths against
 * indexURL.
 *
 * @param path the path to load
 * @param subResourceHash the sub resource hash for fetch() integrity check
 * @returns A Uint8Array containing the binary data
 * @private
 */
async function greasemonkey_loadBinaryFile(
  path: string,
  subResourceHash: string | undefined,
): Promise<Uint8Array> {
  console.log("greasemonkey_loadBinaryFile");
  console.log("path: " + path);
  let response = await greasemonkey_get(path, "arraybuffer");
  console.log("greasemonkey_loadBinaryFile byteLength: " + response.response.byteLength);
  return new Uint8Array(response.response);
}

/** @private */
export let loadBinaryFile: (
  path: string,
  file_sub_resource_hash?: string | undefined,
) => Promise<Uint8Array>;
if (IN_NODE) {
  loadBinaryFile = node_loadBinaryFile;
} else if (IN_GM) {
  loadBinaryFile = greasemonkey_loadBinaryFile;
} else {
  loadBinaryFile = browser_loadBinaryFile;
}

/**
 * Currently loadScript is only used once to load `pyodide.asm.js`.
 * @param url
 * @async
 * @private
 */
export let loadScript: (url: string) => Promise<void>;

if (IN_GM) {
  // greasemonkey
  loadScript = greasemonkeyLoadScript;
} else if (globalThis.document) {
  // browser
  loadScript = async (url) => await import(url);
} else if (globalThis.importScripts) {
  // webworker
  loadScript = async (url) => {
    try {
      // use importScripts in classic web worker
      globalThis.importScripts(url);
    } catch (e) {
      // importScripts throws TypeError in a module type web worker, use import instead
      if (e instanceof TypeError) {
        await import(url);
      } else {
        throw e;
      }
    }
  };
} else if (IN_NODE) {
  loadScript = nodeLoadScript;
} else {
  throw new Error("Cannot determine runtime environment");
}

/**
 * Load a text file and executes it as Javascript
 * @param url The path to load. May be a url or a relative file system path.
 * @private
 */
async function nodeLoadScript(url: string) {
  if (url.startsWith("file://")) {
    // handle file:// with filesystem operations rather than with fetch.
    url = url.slice("file://".length);
  }
  if (url.includes("://")) {
    // If it's a url, load it with fetch then eval it.
    nodeVmMod.runInThisContext(await (await nodeFetch(url)).text());
  } else {
    // Otherwise, hopefully it is a relative path we can load from the file
    // system.
    await import(nodeUrlMod.pathToFileURL(url).href);
  }
}

/**
 * Load a text file and executes it as Javascript
 * @param url The path to load.
 * @private
 */
async function greasemonkeyLoadScript(url: string) {
  // If it's a url, load it with fetch then eval it.
  console.log("greasemonkeyLoadScript");
  console.log("url: " + url);
  // TODO: check to see if we're loading pyodide.asm.js here
  // cache asm.data so we can use emscripten's Module.getPreloadedPackage
  globalThis.asmData = await greasemonkey_loadBinaryFile("http://localhost:8001/pyodide.asm.data", undefined);
  // @ts-ignore
  GM.xmlHttpRequest({
    method: "GET",
    url: url,
    responseType: "blob",
    // @ts-ignore
    onload: function(response) {
      eval?.(response.responseText);
    }
  });
}

/**
 * Load a file, only for use in Greasemonkey. Resolves relative paths against
 * indexURL.
 *
 * @param path the path to load
 * @returns a string containing the data
 * @private
 */
export async function greasemonkey_loadFile(
  path: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    GM.xmlHttpRequest({
      method: "GET",
      url: path,
      // @ts-ignore
      onload: function(response) {
        resolve(response.responseText);
      },
      // @ts-ignore
      onerror: function(response) {
        reject(response.statusText);
      }
    });
  });
}

export function getPreloadedPackage(
  remotePackageName: string,
  remotePackageSize: number,
): ArrayBuffer {
  console.log("getPreloadedPackage remotePackageName: " + remotePackageName);
  return globalThis.asmData.buffer;
}

export async function instantiateWasm(
  imports: object,
  successCallback: any,
): Promise<any> {
  let response = await greasemonkey_get('http://localhost:8001/pyodide.asm.wasm', 'arraybuffer')
  console.log("instantiateWasm response.responseText: " + JSON.stringify(response.responseText));
  let wasmData = response.response;

  // @ts-ignore
  let result = await WebAssembly.instantiate(wasmData, imports);
  console.log("result: " + JSON.stringify(result) + "(" + result + ")");
  successCallback(result['instance'], result['module']);
  return new Promise((resolve, reject) => {
    resolve({});
  });
}
