import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import ScanScreen from "./src/screens/ScanScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import ReportScreen from "./src/screens/ReportScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./src/storage";
import { C } from "./src/theme";

const TABS = [
  ["scan", "Scan", "🛡"],
  ["history", "History", "🕘"],
  ["report", "Threat Hub", "🚩"],
  ["settings", "Settings", "⚙"],
];

export default function App() {
  const [tab, setTab] = useState("scan");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [prefill, setPrefill] = useState("");

  useEffect(() => { loadSettings().then(setSettings); }, []);

  const update = async (s) => { setSettings(s); await saveSettings(s); };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.brand}>PhishGuard<Text style={{ color: C.cyan }}>.AI</Text></Text>
          <Text style={styles.mode}>{settings.server && settings.useServer ? "online + offline" : "offline mode"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          {tab === "scan" && <ScanScreen settings={settings} onReport={(t) => { setPrefill(t); setTab("report"); }} />}
          {tab === "history" && <HistoryScreen />}
          {tab === "report" && <ReportScreen settings={settings} prefill={prefill} />}
          {tab === "settings" && <SettingsScreen settings={settings} onChange={update} />}
        </View>
        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map(([id, label, icon]) => (
            <Pressable key={id} onPress={() => setTab(id)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}>
              <Text style={{ fontSize: 18 }}>{icon}</Text>
              <Text style={[styles.tabText, tab === id && { color: C.cyan }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border },
  brand: { color: C.text, fontSize: 18, fontWeight: "800" },
  mode: { color: C.dim, fontSize: 12 },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8 },
  tabText: { color: C.muted, fontSize: 11, marginTop: 2 },
});
