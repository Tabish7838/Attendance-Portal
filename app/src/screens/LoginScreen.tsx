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

import { AppShell, Button, Card } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { AuthStackParamList } from "../navigation/types";
import { theme } from "../theme";

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
    <AppShell>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.content}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to manage your class attendance.</Text>

            <Card style={styles.card}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.colors.muted}
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
                  placeholderTextColor={theme.colors.muted}
                  secureTextEntry
                  style={styles.input}
                  returnKeyType="done"
                />
                <Text style={styles.helper}>At least 6 characters.</Text>
              </View>

              <Button
                label={isSubmitting ? "Signing in..." : "Sign in"}
                onPress={handleSubmit}
                loading={isSubmitting}
                disabled={!isFormValid || isSubmitting}
                style={styles.primaryButton}
              />

              <View style={styles.linkRow}>
                <Text style={styles.linkPrompt}>New here?</Text>
                <Pressable onPress={handleGoToSignup} disabled={isSubmitting}>
                  <Text style={[styles.linkText, isSubmitting && styles.linkTextDisabled]}>
                    Create account
                  </Text>
                </Pressable>
              </View>
            </Card>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </AppShell>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    flex: 1,
    paddingTop: theme.spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.text2,
    marginBottom: theme.spacing.lg,
  },
  card: {
    padding: theme.spacing.lg,
  },
  formGroup: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: theme.colors.muted,
    marginBottom: theme.spacing.xs,
  },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  helper: {
    marginTop: theme.spacing.xs,
    fontSize: 12,
    color: theme.colors.text2,
  },
  primaryButton: {
    marginTop: theme.spacing.sm,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  linkPrompt: {
    fontSize: 14,
    color: theme.colors.text2,
    marginRight: 6,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  linkTextDisabled: {
    color: theme.colors.muted,
  },
});
