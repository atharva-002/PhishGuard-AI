import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { loadHistory } from "../storage";
import { C, LEVEL_COLOR } from "../theme";

export default function HistoryScreen() {
  const [items, setItems] = useState([]);
  useEffect(() => { loadHistory().then(setItems); }, []);
  const flagged = items.filter((i) => i.label === "phishing").length;
  return (
    <FlatList
      contentContainerStyle={{ padding: 16 }}
      data={items}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={
        <View style={{ marginBottom: 8 }}>
          <Text style={styles.h1}>History</Text>
          <Text style={styles.sub}>{items.length} scans on this phone · {flagged} flagged. Stored only on this device.</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.sub}>No scans yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: LEVEL_COLOR[item.threat_level] || C.green }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.text} numberOfLines={2}>{item.text}</Text>
            <Text style={styles.meta}>
              {item.label === "phishing" ? `Phishing ${item.confidence}%` : "Genuine"} · {item.source} · {new Date(item.at).toLocaleString()}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  h1: { color: C.text, fontSize: 24, fontWeight: "800" },
  sub: { color: C.muted, marginTop: 6 },
  row: { flexDirection: "row", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  text: { color: C.text },
  meta: { color: C.dim, fontSize: 12, marginTop: 3 },
});
