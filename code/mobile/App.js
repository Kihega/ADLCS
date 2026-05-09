/**
 * App.js — ADLCS Mobile Navigation Root  v2.1
 *
 * Stack:
 *   Splash          — animated launch screen with loading bar
 *   Login           — shared login (village + hospital officers)
 *   VillageHome     — village officer dashboard
 *   HospitalHome    — hospital officer dashboard  [redesigned v2.1]
 *   RegisterBirth   — multi-step birth registration [NEW v2.1]
 *
 * All screen implementations are .tsx; this entry file stays .js
 * so Expo registerRootComponent in index.js works without TS config.
 */

import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

import SplashScreen        from './src/screens/SplashScreen'
import LoginScreen         from './src/screens/auth/LoginScreen'
import VillageHomeScreen   from './src/screens/village/VillageHomeScreen'
import HospitalHomeScreen  from './src/screens/hospital/HospitalHomeScreen'
import RegisterBirthScreen from './src/screens/hospital/RegisterBirthScreen'

const Stack = createNativeStackNavigator()

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            contentStyle: { backgroundColor: '#050d1a' },
          }}
        >
          <Stack.Screen name="Splash"       component={SplashScreen} />
          <Stack.Screen name="Login"        component={LoginScreen} />
          <Stack.Screen name="VillageHome"  component={VillageHomeScreen} />
          <Stack.Screen name="HospitalHome" component={HospitalHomeScreen} />
          <Stack.Screen
            name="RegisterBirth"
            component={RegisterBirthScreen}
            options={{ animation: 'slide_from_right' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
