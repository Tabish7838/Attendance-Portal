import "react-native-gesture-handler";

import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";

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

const tabIcons: Record<keyof RootTabParamList, string> = {
  Home: "🏠",
  Attendance: "✅",
  Absences: "📉",
  Roster: "�",
};

const TabNavigator = () => (
  <AttendanceProvider>
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#1d4ed8",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarStyle: {
          height: 64,
          paddingBottom: 10,
          paddingTop: 10,
        },
        tabBarIcon: ({ focused, color }) => (
          <Text style={{ fontSize: 20, color, opacity: focused ? 1 : 0.7 }}>
            {tabIcons[route.name as keyof RootTabParamList]}
          </Text>
        ),
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
