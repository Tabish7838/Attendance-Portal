import "react-native-gesture-handler";

import type React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";

import AttendanceScreen from "./src/screens/AttendanceScreen";
import { AttendanceProvider } from "./src/context/AttendanceContext";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { BranchProvider } from "./src/context/BranchContext";
import SplashScreen from "./src/screens/SplashScreen";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import AbsencesScreen from "./src/screens/AbsencesScreen";
import RosterScreen from "./src/screens/RosterScreen";
import SignupScreen from "./src/screens/SignupScreen";
import { AuthStackParamList, RootTabParamList } from "./src/navigation/types";
import SyncListener from "./src/offline/syncListener";
import { theme } from "./src/theme";

const Tab = createBottomTabNavigator<RootTabParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const tabIcons: Record<keyof RootTabParamList, { focused: IoniconName; unfocused: IoniconName }> = {
  Home: { focused: "home", unfocused: "home-outline" },
  Attendance: { focused: "checkmark-done", unfocused: "checkmark-done-outline" },
  Absences: { focused: "trending-down", unfocused: "trending-down-outline" },
  Roster: { focused: "people", unfocused: "people-outline" },
};

const TabNavigator = () => (
  <AttendanceProvider>
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: -2,
        },
        tabBarStyle: {
          height: 70,
          paddingTop: 8,
          paddingBottom: 10,
        },
        tabBarItemStyle: {
          justifyContent: "center",
          alignItems: "center",
        },
        tabBarIcon: ({ focused, color }) => {
          const icons = tabIcons[route.name as keyof RootTabParamList];
          const name = focused ? icons.focused : icons.unfocused;
          const size = route.name === "Attendance" ? 28 : 24;
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Attendance" component={AttendanceScreen} />
      <Tab.Screen name="Absences" component={AbsencesScreen} />
      <Tab.Screen name="Roster" component={RosterScreen} />
    </Tab.Navigator>
  </AttendanceProvider>
);

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={LoginScreen} />
    <AuthStack.Screen name="Signup" component={SignupScreen} />
  </AuthStack.Navigator>
);

const AppNavigation = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: theme.colors.bg,
        },
      }}
    >
      {user ? <TabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <SyncListener />
      <BranchProvider>
        <AppNavigation />
      </BranchProvider>
    </AuthProvider>
  );
}
