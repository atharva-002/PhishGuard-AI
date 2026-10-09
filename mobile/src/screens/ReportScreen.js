import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card } from "../components";
import { serverApi } from "../api";
import { C } from "../theme";

const CATS = [["bank", "Bank"], ["kyc", "KYC"], ["lottery", "Lottery"], ["job", "Job"], ["delivery", "Parcel"], ["loan", "Loan"], ["government", "Police / govt"], ["other", "Other"]];

export default function ReportScreen({ settings, prefill }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState(prefill || "");
  const [category, setCategory] = useState("other");
  const [status, setStatus] = useState("");
  const [lookup, setLookup] = useState("");
  const [lookupRes, setLookupRes] = useState("");

  useEffect(() => { if (prefill) setMessage(prefill); }, [prefill]);

  const noServer = !settings.server;

  const send = async () => {
    setStatus("Sending…");
    try {
      const r = await serverApi.report(settings.server, { value: value || null, message: message || null, category });
      setStatus(`Thank you! ${r.saved.length} link(s)/number(s) added to the Threat Hub.`);
      setValue("");
    } catch (e) {
      setStatus(`Could not report: ${e.message}`);
    }
  };

  const check = async () => {
    setLookupRes("Checking…");
    try {
      const r = await serverApi.lookup(settings.server, lookup.trim());
      setLookupRes(r.found ? `⚠ Reported as a scam ${r.matches.reduce((s, m) => s + (m.reports || 0), 0)} time(s).` : "Not reported yet. That doesn't make it safe.");
    } catch (e) {
      setLookupRes(e.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.h1}>Threat Hub</Text>
      {noServer && <Text style={[styles.sub, { color: C.amber }]}>Set your PhishGuard server in Settings to report and look up scams.</Text>}
      <Card>
        <Text style={styles.h2}>Check a link or number</Text>
        <TextInput style={styles.input} value={lookup} onChangeText={setLookup} placeholder="e.g. 9876543210 or sbi-kyc.in" placeholderTextColor={C.dim} autoCapitalize="none" />
        <Button title="Check" onPress={check} disabled={noServer || lookup.trim().length < 3} style={{ marginTop: 8 }} />
        {!!lookupRes && <Text style={styles.sub}>{lookupRes}</Text>}
      </Card>
      <Card>
        <Text style={styles.h2}>Report a scam</Text>
        <TextInput style={styles.input} value={value} onChangeText={setValue} placeholder="Link, phone number or sender ID" placeholderTextColor={C.dim} autoCapitalize="none" />
        <TextInput style={[styles.input, { minHeight: 90 }]} multiline textAlignVertical="top" value={message} onChangeText={setMessage} placeholder="Or paste the scam message" placeholderTextColor={C.dim} />
        <Text style={[styles.sub, { marginBottom: 6 }]}>Type of scam</Text>
        <View style={styles.cats}>
          {CATS.map(([v, l]) => (
            <Pressable key={v} onPress={() => setCategory(v)} style={[styles.cat, category === v && styles.catOn]}
              accessibilityRole="radio" accessibilityState={{ selected: category === v }}>
              <Text style={{ color: category === v ? C.cyan : C.muted }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <Button title="Report" kind="danger" onPress={send} disabled={noServer || (!value.trim() && !message.trim())} style={{ marginTop: 12 }} />
        {!!status && <Text style={styles.sub}>{status}</Text>}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { color: C.text, fontSize: 24, fontWeight: "800" },
  h2: { color: C.text, fontSize: 17, fontWeight: "700" },
  sub: { color: C.muted, marginTop: 8, lineHeight: 20 },
  input: { marginTop: 10, color: C.text, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10 },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cat: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  catOn: { borderColor: C.cyan },
});
