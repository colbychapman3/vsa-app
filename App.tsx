import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { validateBaseline, type Baseline } from './src/engine/index.ts';
import glovis from './docs/reference/glovis-condor-101-baseline.json';

// Temporary: proves the rules engine runs inside the app. Replaced by the check screen in T4.
const check = validateBaseline(glovis as Baseline);

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>TEST · Glovis Condor 101</Text>
      <Text style={styles.big}>{check.ok ? check.start.toLocaleString('en-US') : 'Baseline error'}</Text>
      <Text style={styles.label}>starting autos (rules engine)</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 18, color: '#111' },
  big: { fontSize: 64, fontWeight: '700', color: '#111' },
});
