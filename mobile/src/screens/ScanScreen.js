import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Button, Verdict } from "../components";
import { scanOnDevice } from "../detector";
import { serverApi } from "../api";
import { addHistory } from "../storage";
import { C } from "../theme";

export default function ScanScreen({ settings, onReport }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");

  const scan = async () => {
    const msg = text.trim();
    if (msg.length < 5) return;
    setNote("");
    // 1. instant offline verdict
    const local = scanOnDevice(msg);
    setResult(local);
    let final = local;
    // 2. full server check when available
    if (settings.useServer && settings.server) {
      setChecking(true);
      try {
        final = { ...(await serverApi.predict(settings.server, msg)), source: "server" };
        setResult(final);
      } catch (e) {
        setNote(`Server not reachable (${e.message}). Showing the offline result.`);
      } finally {
        setChecking(false);
      }
    }
    await addHistory({ id: String(Date.now()), at: Date.now(), text: msg.slice(0, 300), label: final.label,
      confidence: final.confidence, threat_level: final.threat_level, source: final.source });
  };

  const paste = async () => {
    const s = await Clipboard.getStringAsync();
    if (s) setText(s);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Is this message a scam?</Text>
        <Text style={styles.sub}>Paste an SMS, WhatsApp or e-mail message. Works in English, Hindi, Marathi, Tamil, Bengali, Telugu and Gujarati, even offline.</Text>
        <TextInput
          style={styles.input}
          multiline
          value={text}
          onChangeText={setText}
          placeholder="Paste the message here…"
          placeholderTextColor={C.dim}
          textAlignVertical="top"
          accessibilityLabel="Message to scan"
        />
        <View style={styles.row}>
          <Button title="Paste" kind="ghost" onPress={paste} />
          <Button title="Clear" kind="ghost" onPress={() => { setText(""); setResult(null); setNote(""); }} />
          <Button title="Scan" onPress={scan} style={{ flex: 1 }} />
        </View>
        {checking && (
          <View style={styles.checking}><ActivityIndicator color={C.cyan} /><Text style={styles.sub}>  Double-checking with the server…</Text></View>
        )}
        {!!note && <Text style={[styles.sub, { color: C.amber, marginTop: 10 }]}>{note}</Text>}
        <Verdict result={result} />
        {result?.label === "phishing" && (
          <Button title="Report this scam" kind="danger" style={{ marginTop: 12 }} onPress={() => onReport(text)} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40 },
  h1: { color: C.text, fontSize: 24, fontWeight: "800" },
  sub: { color: C.muted, marginTop: 6, lineHeight: 20 },
  input: { marginTop: 14, minHeight: 150, color: C.text, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 12, fontSize: 15 },
  row: { flexDirection: "row", gap: 8, marginTop: 10 },
  checking: { flexDirection: "row", alignItems: "center", marginTop: 12 },
});
