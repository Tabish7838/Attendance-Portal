import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";

import { theme } from "../../theme";

export type ButtonVariant = "primary" | "secondary" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  style?: ViewStyle;
  left?: ReactNode;
};

const Button = ({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  style,
  left,
}: Props) => {
  const isDisabled = disabled || loading;
  const containerStyle =
    variant === "secondary"
      ? styles.secondary
      : variant === "danger"
      ? styles.danger
      : styles.primary;

  const textStyle = variant === "secondary" ? styles.secondaryText : styles.primaryText;

  const spinnerColor = variant === "secondary" ? theme.colors.text : theme.colors.surface;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        containerStyle,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <>
          {left}
          <Text style={textStyle}>{label}</Text>
        </>
      )}
    </Pressable>
  );
};

export default Button;

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: theme.radius.button,
    paddingHorizontal: theme.spacing.xl,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  primary: {
    backgroundColor: theme.colors.text,
  },
  danger: {
    backgroundColor: theme.colors.danger,
  },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  primaryText: {
    color: theme.colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.6,
  },
});
