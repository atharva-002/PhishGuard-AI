import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Button, Card } from "../components";
import { serverApi } from "../api";
import { getModel } from "../detector";
import { clearHistory } from "../storage";
import { C } from "../theme";

export default function SettingsScreen({ settings, onChange }) {
  const [server, setServer] = useState(settings.server);
  const [status, setStatus] = useState("");
  let metrics = null;
  try { metrics = getModel().metrics; } catch { /* shown below */ }

  const save = async () => {
    const s = server.trim().replace(/\/+$/, "");
    await onChange({ ...settings, server: s });
    if (!s) { setStatus("Saved. Offline mode only."); return; }
    setStatus("Testing connection…");
    try {
      const h = await serverApi.health(s);
      setStatus(h.model_ready ? `Connected: ${h.models_loaded.length} models live.` : "Connected, but models are still loading.");
    } catch (e) {
      setStatus(`Saved, but can't reach it: ${e.message}. Is the phone on the same Wi-Fi?`);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.h1}>Settings</Text>
      <Card>
        <Text style={styles.h2}>PhishGuard server (optional)</Text>
        <Text style={styles.sub}>Your PC's address on the same Wi-Fi, e.g. http://192.168.0.105:8000. Start the backend with --host 0.0.0.0.</Text>
        <TextInput style={styles.input} value={server} onChangeText={setServer} placeholder="http://192.168.0.105:8000"
          placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Button title="Save & test" onPress={save} style={{ marginTop: 10 }} />
        {!!status && <Text style={styles.sub}>{status}</Text>}
        <View style={styles.switchRow}>
          <Text style={{ color: C.text, flex: 1 }}>Double-check scans with the server</Text>
          <Switch value={settings.useServer} onValueChange={(v) => onChange({ ...settings, useServer: v })}
            trackColor={{ true: C.cyan }} accessibilityLabel="Use server" />
        </View>
      </Card>
      <Card>
        <Text style={styles.h2}>On-device model</Text>
        {metrics ? (
          <Text style={styles.sub}>
            Character n-gram Logistic Regression, 30,000 features. Test accuracy {(metrics.accuracy * 100).toFixed(2)}%, F1 {(metrics.f1 * 100).toFixed(2)}%. Messages scanned offline never leave your phone.
          </Text>
        ) : <Text style={[styles.sub, { color: C.red }]}>The on-device model failed to load.</Text>}
      </Card>
      <Card>
        <Text style={styles.h2}>Privacy</Text>
        <Text style={styles.sub}>Scan history is stored only on this phone.</Text>
        <Button title="Clear history" kind="ghost" onPress={async () => { await clearHistory(); setStatus("History cleared."); }} style={{ marginTop: 10 }} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { color: C.text, fontSize: 24, fontWeight: "800" },
  h2: { color: C.text, fontSize: 17, fontWeight: "700" },
  sub: { color: C.muted, marginTop: 8, lineHeight: 20 },
  input: { marginTop: 10, color: C.text, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10 },
  switchRow: { flexDirection: "row", alignItems: "center", marginTop: 16 },
});
