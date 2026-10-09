// Copies shared/model-core.js into the mobile app and the extension.
const fs = require("fs");
const path = require("path");
const core = fs.readFileSync(path.join(__dirname, "model-core.js"), "utf8");
const head = "// AUTO-COPIED from shared/model-core.js (run: node shared/sync.js)\n";
fs.writeFileSync(path.join(__dirname, "../mobile/src/model.js"), head + core + "\nexport { cleanText, createModel };\n");
fs.writeFileSync(path.join(__dirname, "../extension/lib/model.js"), head + core + "\nglobalThis.PhishGuardModel = { cleanText, createModel };\n");
console.log("synced model-core.js -> mobile/src/model.js, extension/lib/model.js");
