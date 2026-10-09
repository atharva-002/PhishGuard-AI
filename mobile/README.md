# PhishGuard mobile app (Android & iOS)

Expo SDK 57 / React Native app. Paste any SMS, WhatsApp or e-mail message and get a verdict.

* **Works offline.** The on-device model (`assets/on_device.json`, character n-gram Logistic Regression, 98.91% accuracy / 95.89% F1 on the held-out test set) runs on the phone, so the message never leaves it.
* **Server double-check (optional).** With a server URL in Settings, each scan is also sent to the PhishGuard API (3 models + Threat Hub lookup).
* **Threat Hub.** Look up a number or link, and report scams.
* **History** stays on the phone (AsyncStorage).

## Run it on your phone (Expo Go)

```bash
cd mobile
npm install
npx expo start
```

Install **Expo Go** from the Play Store / App Store and scan the QR code. Phone and PC must be on the same Wi-Fi.

To use the server from the phone, start the backend so it listens on your network:

```bash
cd backend
uvicorn server:app --host 0.0.0.0 --port 8000
```

Then in the app: **Settings → `http://<your-PC-IP>:8000` → Save & test** (find the IP with `ipconfig`).

## Build an installable APK

```bash
npm install -g eas-cli
eas login            # free Expo account
eas build -p android --profile preview
```

EAS builds in the cloud and gives you a download link for the `.apk`.

## After retraining the model

```bash
cd backend && python -m ml.export_on_device
cd ../mobile && npm run sync-model
```

`npm run sync-model` copies the new `on_device.json` and the shared JavaScript model code (`shared/model-core.js`) into the app. `node shared/parity-check.js` confirms the JavaScript port gives the same scores as scikit-learn.

## Not included (and why)

Reading the SMS inbox automatically needs the Android `READ_SMS` permission, which Google Play only allows for default SMS apps, plus a custom native module. The app therefore works on pasted / shared text.
