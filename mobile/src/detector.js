// On-device model: runs entirely on the phone, no network needed.
import { createModel } from "./model";

let model = null;
let loadError = null;

export function getModel() {
  if (!model && !loadError) {
    try {
      model = createModel(require("../assets/on_device.json"));
    } catch (e) {
      loadError = e;
    }
  }
  if (loadError) throw loadError;
  return model;
}

export function scanOnDevice(text) {
  const t0 = Date.now();
  const r = getModel().predict(text);
  return { ...r, genuine_score: Math.round((100 - r.confidence) * 100) / 100, source: "on-device", ms: Date.now() - t0 };
}
