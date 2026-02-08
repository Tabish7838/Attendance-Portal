import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

const SplashScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1d4ed8" />
      <Text style={styles.message}>Loading your workspace…</Text>
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  message: {
    marginTop: 16,
    fontSize: 16,
    color: "#475569",
  },
});
