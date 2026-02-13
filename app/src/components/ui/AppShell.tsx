import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";

import { theme } from "../../theme";

type Props = PropsWithChildren<{
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}>;

const AppShell = ({ children, style, contentStyle }: Props) => {
  return (
    <View style={[styles.root, style]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, contentStyle]}
      >
        {children}
      </ScrollView>
    </View>
  );
};

export default AppShell;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 56,
    paddingBottom: 120,
  },
});
