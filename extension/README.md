# PhishGuard browser extension (Chrome, Edge, Firefox)

Flags phishing / smishing messages in **Gmail, Outlook, Google Messages for web and WhatsApp Web**, and lets you scan any selected text or check/report a link from the right-click menu.

* Uses your PhishGuard server (`/api/predict`, 3 models + Threat Hub) when it is reachable.
* Falls back to the built-in **on-device model** (`models/on_device.json`, 98.9% accuracy on the test split) when it is not, or always, if you tick *Offline only* in the settings.

## Install

**Chrome / Edge**: open `chrome://extensions` → turn on *Developer mode* → *Load unpacked* → choose this `extension` folder.

**Firefox (121+)**: open `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* → choose `manifest.json`. Then open the extension's settings, click *Save* once, and allow the permissions Firefox asks for.

Start the backend (`uvicorn server:app --port 8000` in `backend`) and the badge will say *server online*. For a backend on another PC, put its address in the settings.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | MV3 manifest for both browsers |
| `background.js` | API calls, offline fallback, right-click menu, notifications |
| `content.js` / `content.css` | Finds message bodies on the supported sites and adds the badge |
| `popup.*` | Paste-and-scan popup |
| `options.*` | Server URL, auto-scan, offline-only mode |
| `lib/model.js` | JavaScript port of the on-device model (copied from `shared/model-core.js`) |

Web apps change their HTML often. If badges stop appearing on a site, update its selector in the `SITES` table at the top of `content.js`.

After retraining (`python -m ml.export_on_device`), copy `backend/ml/models/on_device.json` into `extension/models/`.
