import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "pg_settings";
const HISTORY_KEY = "pg_history";
export const DEFAULT_SETTINGS = { server: "", useServer: true };

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export async function loadHistory() {
  try {
    return JSON.parse((await AsyncStorage.getItem(HISTORY_KEY)) || "[]");
  } catch {
    return [];
  }
}

export async function addHistory(entry) {
  const list = await loadHistory();
  const next = [entry, ...list].slice(0, 200);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export async function clearHistory() {
  await AsyncStorage.removeItem(HISTORY_KEY);
}
