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

import { useAuth } from "../context/AuthContext";
import { AuthStackParamList } from "../navigation/types";
import { buildApiUrl } from "../env";
import { supabase } from "../lib/supabase";

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

          <View style={styles.formGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Mrs Sharma"
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
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  returnKeyType="done"
                />
                <Text style={styles.helper}>Check your email for the code.</Text>
                <View style={styles.inlineRow}>
                  <Pressable onPress={handleEditEmail} disabled={isSubmitting}>
                    <Text style={styles.inlineLink}>Edit email</Text>
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

          <Pressable
            onPress={step === "request" ? handleRequestCode : handleVerifyCode}
            style={[
              styles.button,
              ((step === "request" && !isRequestValid) || (step === "verify" && !isCodeValid) || isSubmitting) &&
                styles.buttonDisabled,
            ]}
            disabled={(step === "request" && !isRequestValid) || (step === "verify" && !isCodeValid) || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>{step === "request" ? "Send code" : "Verify & create"}</Text>
            )}
          </Pressable>

          <View style={styles.linkRow}>
            <Text style={styles.linkPrompt}>Already have an account?</Text>
            <Pressable onPress={handleBackToLogin}>
              <Text style={styles.linkText}>Back to login</Text>
            </Pressable>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

export default SignupScreen;

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
