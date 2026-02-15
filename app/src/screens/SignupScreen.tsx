import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { AppShell, Button, Card } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { AuthStackParamList } from "../navigation/types";
import { buildApiUrl } from "../env";
import { supabase } from "../lib/supabase";
import { theme } from "../theme";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const RESEND_COOLDOWN_MS = 60_000;

const getFriendlySignupError = (stage: "otp" | "profile", error: any): string => {
  const rawMessage = typeof error?.message === "string" ? error.message : "";
  const status: number | undefined = error?.status ?? error?.cause?.status;
  const networkIssue = /network/i.test(rawMessage) || error?.name === "TypeError";

  if (stage === "otp") {
    if (/rate limit/i.test(rawMessage)) {
      return "Too many codes were requested. Please wait a bit and try again.";
    }
    if (networkIssue) {
      return "We couldn’t reach the sign-up service. Check your internet connection and try again.";
    }
    if (status === 400 || status === 401 || /invalid/i.test(rawMessage)) {
      return "That code didn’t work. Double-check it and try again.";
    }
    return rawMessage || "We hit a snag sending the code. Please try again.";
  }

  if (stage === "profile") {
    if (status === 409) {
      return "That name is already connected to another account. Pick a different one.";
    }
    if (networkIssue) {
      return "We created your account, but couldn’t save your profile due to a network issue. Try again.";
    }
    return rawMessage || "We couldn’t finish setting up your profile. Please try again.";
  }

  return rawMessage || "We couldn’t finish setting up your profile. Please try again.";
};

const SignupScreen: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"request" | "verify">("request");
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);

  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { requestEmailOtp, verifyEmailOtp } = useAuth();

  const trimmedName = name.trim();
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const isRequestValid =
    trimmedName.length > 0 && EMAIL_REGEX.test(normalizedEmail) && password.trim().length >= 6;
  const isCodeValid = code.trim().length >= 4;

  const resendRemainingMs = useMemo(() => {
    if (!lastSentAt) return 0;
    return Math.max(0, lastSentAt + RESEND_COOLDOWN_MS - Date.now());
  }, [lastSentAt]);

  const canResend = resendRemainingMs === 0;

  const handleRequestCode = async () => {
    if (!isRequestValid || isSubmitting) return;
    if (!canResend) {
      Alert.alert("Please wait", "Please wait a moment before requesting another code.");
      return;
    }

    setIsSubmitting(true);
    try {
      await requestEmailOtp({ email: normalizedEmail, name: trimmedName });
      setLastSentAt(Date.now());
      setStep("verify");
      Alert.alert("Code sent", "We’ve sent a verification code to your email.");
    } catch (err: any) {
      const message = getFriendlySignupError("otp", err);
      Alert.alert("Sign up failed", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!EMAIL_REGEX.test(normalizedEmail) || !isCodeValid || isSubmitting) return;
    setIsSubmitting(true);

    try {
      await verifyEmailOtp({ email: normalizedEmail, code: code.trim() });

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error("We couldn’t confirm your account. Please try again.");
      }

      const profileResponse = await fetch(buildApiUrl("/users"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supabase_id: user.id,
          username: trimmedName,
          email: normalizedEmail,
        }),
      });

      if (!profileResponse.ok) {
        let payload: any = {};
        try {
          payload = await profileResponse.json();
        } catch (err) {
          /* noop */
        }
        const profileError: any = new Error(payload.message || "Failed to save your profile.");
        profileError.stage = "profile";
        profileError.status = profileResponse.status;
        throw profileError;
      }

      Alert.alert(
        "Account created",
        "Account created successfully. You are now signed in."
      );
    } catch (err: any) {
      const stage = (err?.stage ?? "otp") as "otp" | "profile";
      const message = getFriendlySignupError(stage, err);
      Alert.alert("Sign up failed", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    if (isSubmitting) return;
    navigation.navigate("Login");
  };

  const handleEditEmail = () => {
    if (isSubmitting) return;
    setStep("request");
    setCode("");
  };

  return (
    <AppShell>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.content}>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Set up your teacher profile so you can manage attendance on the go.
            </Text>

            <Card style={styles.card}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Mrs Sharma"
                  placeholderTextColor={theme.colors.muted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  style={styles.input}
                  returnKeyType="next"
                />
              </View>

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
                  editable={step === "request" && !isSubmitting}
                />
              </View>

              {step === "request" ? (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Minimum 6 characters"
                    placeholderTextColor={theme.colors.muted}
                    secureTextEntry
                    style={styles.input}
                    returnKeyType="done"
                  />
                  <Text style={styles.helper}>At least 6 characters.</Text>
                </View>
              ) : null}

              {step === "verify" ? (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Verification code</Text>
                    <TextInput
                      value={code}
                      onChangeText={setCode}
                      placeholder="Enter the code"
                      placeholderTextColor={theme.colors.muted}
                      keyboardType="number-pad"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                      returnKeyType="done"
                    />
                    <Text style={styles.helper}>Check your email for the code.</Text>
                    <View style={styles.inlineRow}>
                      <Pressable onPress={handleEditEmail} disabled={isSubmitting}>
                        <Text style={[styles.inlineLink, isSubmitting && styles.inlineLinkDisabled]}>Edit email</Text>
                      </Pressable>
                      <Pressable onPress={handleRequestCode} disabled={isSubmitting || !canResend}>
                        <Text
                          style={[
                            styles.inlineLink,
                            (!canResend || isSubmitting) && styles.inlineLinkDisabled,
                          ]}
                        >
                          {canResend
                            ? "Resend code"
                            : `Resend in ${Math.ceil(resendRemainingMs / 1000)}s`}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              ) : null}

              <Button
                label={
                  isSubmitting
                    ? step === "request"
                      ? "Sending..."
                      : "Verifying..."
                    : step === "request"
                      ? "Send code"
                      : "Verify & create"
                }
                onPress={step === "request" ? handleRequestCode : handleVerifyCode}
                loading={isSubmitting}
                disabled={
                  (step === "request" && !isRequestValid) ||
                  (step === "verify" && !isCodeValid) ||
                  isSubmitting
                }
                style={styles.primaryButton}
              />

              <View style={styles.linkRow}>
                <Text style={styles.linkPrompt}>Already have an account?</Text>
                <Pressable onPress={handleBackToLogin} disabled={isSubmitting}>
                  <Text style={[styles.linkText, isSubmitting && styles.linkTextDisabled]}>
                    Back to login
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

export default SignupScreen;

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
  inlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.sm,
  },
  inlineLink: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
  },
  inlineLinkDisabled: {
    color: theme.colors.muted,
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
