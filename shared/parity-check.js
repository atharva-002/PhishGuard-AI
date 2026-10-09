// Checks the JS port against scikit-learn on 400 held-out messages and the
// full Python clean_text. Run after `python -m ml.export_on_device`:
//   node shared/parity-check.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "model-core.js"), "utf8") + "\n;({cleanText, createModel})";
const { createModel } = vm.runInNewContext(src, { Map, Array, Math });
const models = path.join(__dirname, "../backend/ml/models");
const model = createModel(JSON.parse(fs.readFileSync(path.join(models, "on_device.json"), "utf8")));
const ref = JSON.parse(fs.readFileSync(path.join(models, "on_device_reference.json"), "utf8"));
let maxDiff = 0, agree = 0;
ref.texts.forEach((t, i) => {
  const p = model.score(t, true).p; // reference texts are already cleaned
  maxDiff = Math.max(maxDiff, Math.abs(p - ref.probs[i]));
  if ((p >= 0.5) === (ref.probs[i] >= 0.5)) agree++;
});
console.log(`label agreement ${agree}/${ref.texts.length}, max |p_js - p_py| = ${maxDiff.toExponential(2)}`);
// cleanText parity on raw messages
const raw = JSON.parse(fs.readFileSync(path.join(models, "clean_reference.json"), "utf8"));
const { cleanText } = vm.runInNewContext(src, { Map, Array, Math });
let same = 0;
const bad = [];
raw.forEach(([inp, out]) => { if (cleanText(inp) === out) same++; else if (bad.length < 3) bad.push([inp, cleanText(inp), out]); });
console.log(`cleanText identical on ${same}/${raw.length} raw messages`);
bad.forEach((b) => console.log(JSON.stringify(b)));
const cleanOk = same / raw.length > 0.995;
process.exit(cleanOk && agree === ref.texts.length && maxDiff < 1e-3 ? 0 : 1);
