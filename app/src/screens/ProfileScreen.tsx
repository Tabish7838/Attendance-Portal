import { StyleSheet, Text, View } from "react-native";

const ProfileScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>
        This is a placeholder screen. We'll hook in user settings and account info soon.
      </Text>
    </View>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2933",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#52606d",
    lineHeight: 22,
  },
});
