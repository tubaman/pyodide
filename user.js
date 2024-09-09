// ==UserScript==
// @name         Pyodide Demo
// @namespace    http://example.com
// @version      0.1
// @description  Demo Pyodide in a userscript
// @author       ryanowa
// @match        http://example.com
// @grant        GM.xmlHttpRequest
// @grant        GM.addElement
// @require      https://github.com/tubaman/pyodide/releases/download/v0.21.3-greasemonkey-20240909/pyodide.js
// ==/UserScript==

(function() {
    'use strict';

    function waitForPyodideScript() {
        return new Promise(resolve => {
            let interval = setInterval(() => {
                if (typeof loadPyodide !== undefined) {
                    console.log("Looks like loadPyodide is available");
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }

    async function main() {
        console.log("waiting for pyodide script");
        await waitForPyodideScript();
        console.log("loading pyodide");

        var pyodide = await loadPyodide({indexURL: "https://github.com/tubaman/pyodide/releases/download/v0.21.3-greasemonkey-20240909/"});
        console.log("pyodide loaded");

        await pyodide.runPythonAsync(`
          import sys
          print("python version: %s" % sys.version)
        `)

    }

    main();

})();