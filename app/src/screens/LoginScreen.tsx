import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useAuth } from "../context/AuthContext";
import { AuthStackParamList } from "../navigation/types";

const getFriendlyAuthError = (error: any): string => {
  if (!error) {
    return "Something went wrong while signing you in. Please try again.";
  }

  const message = typeof error?.message === "string" ? error.message : "";
  const status: number | undefined = error?.status ?? error?.cause?.status;
  const isNetworkIssue = /network/i.test(message) || error?.name === "TypeError";

  if (status === 400 || status === 401 || /invalid login/i.test(message)) {
    return "That email and password combination didn’t work. Double-check your details and try again.";
  }

  if (isNetworkIssue) {
    return "We couldn’t reach the server. Check your internet connection and try again.";
  }

  return "We’re having trouble signing you in right now. Please try again in a moment.";
};

type AuthStackNavigation = NativeStackNavigationProp<AuthStackParamList>;

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signIn } = useAuth();
  const navigation = useNavigation<AuthStackNavigation>();

  const isFormValid = email.trim().length > 0 && password.trim().length >= 6;

  const handleGoToSignup = () => {
    if (isSubmitting) return;
    navigation.navigate("Signup");
  };

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;
    setIsSubmitting(true);

    try {
      await signIn({ email: email.trim().toLowerCase(), password });
    } catch (err: any) {
      const message = getFriendlyAuthError(err);
      Alert.alert("Sign in failed", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.content}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to manage your class attendance.</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              returnKeyType="next"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              style={styles.input}
              returnKeyType="done"
            />
            <Text style={styles.helper}>At least 6 characters.</Text>
          </View>

          <Pressable
            onPress={handleSubmit}
            style={[
              styles.button,
              (!isFormValid || isSubmitting) && styles.buttonDisabled,
            ]}
            disabled={!isFormValid || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>

          <View style={styles.linkRow}>
            <Text style={styles.linkPrompt}>New here?</Text>
            <Pressable onPress={handleGoToSignup}>
              <Text style={styles.linkText}>Create account</Text>
            </Pressable>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2933",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#52606d",
    marginBottom: 32,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#364152",
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9e2ec",
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#1f2933",
    backgroundColor: "#f9fbfd",
  },
  helper: {
    marginTop: 8,
    fontSize: 12,
    color: "#8292a0",
  },
  inlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  inlineLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },
  inlineLinkDisabled: {
    color: "#93c5fd",
  },
  button: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 4,
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: "#93c5fd",
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  linkPrompt: {
    fontSize: 14,
    color: "#52606d",
    marginRight: 6,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
  },
});
