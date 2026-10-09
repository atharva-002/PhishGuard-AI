import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, LEVEL_COLOR, PRETTY } from "./theme";

export function Button({ title, onPress, kind = "primary", disabled, style }) {
  const s = kind === "primary" ? styles.primary : kind === "danger" ? styles.danger : styles.ghost;
  const t = kind === "primary" ? styles.primaryText : kind === "danger" ? styles.dangerText : styles.ghostText;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [styles.btn, s, (pressed || disabled) && { opacity: 0.6 }, style]}>
      <Text style={[styles.btnText, t]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Verdict({ result }) {
  if (!result) return null;
  const bad = result.label === "phishing";
  const color = LEVEL_COLOR[result.threat_level] || C.green;
  return (
    <Card style={{ borderColor: color + "66" }}>
      <Text style={[styles.verdict, { color }]}>{bad ? "⚠ Likely phishing" : "✓ Looks genuine"}</Text>
      <Text style={styles.meta}>
        {bad ? `${result.confidence}% scam score` : `${result.genuine_score}% genuine`} · {result.threat_level} risk
      </Text>
      <Text style={styles.meta}>
        Checked {result.source === "server" ? "by the PhishGuard server (3 models + Threat Hub)" : "on this phone (offline model)"}
      </Text>
      {result.known_threats?.length > 0 && (
        <Text style={[styles.meta, { color: C.red }]}>This link or number was already reported as a scam.</Text>
      )}
      {result.suspicious_keywords?.length > 0 && (
        <View style={styles.chips}>
          {result.suspicious_keywords.slice(0, 10).map((k) => (
            <Text key={k} style={styles.chip}>{PRETTY[k] || k}</Text>
          ))}
        </View>
      )}
      <Text style={styles.advice}>
        {result.recommendation ||
          (bad ? "Don't tap links, call back, or share OTPs, PINs or passwords. Report it at cybercrime.gov.in or call 1930."
               : "No strong scam signs. Still never share OTPs or PINs.")}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, alignItems: "center" },
  btnText: { fontWeight: "700", fontSize: 15 },
  primary: { backgroundColor: C.cyan },
  primaryText: { color: "#001018" },
  danger: { backgroundColor: C.red },
  dangerText: { color: "#fff" },
  ghost: { borderWidth: 1, borderColor: C.border },
  ghostText: { color: C.muted },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, marginTop: 14 },
  verdict: { fontSize: 22, fontWeight: "800" },
  meta: { color: C.muted, marginTop: 4, fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { color: C.amber, borderColor: C.amber + "55", borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: 12 },
  advice: { color: C.text, marginTop: 10, lineHeight: 20 },
});
