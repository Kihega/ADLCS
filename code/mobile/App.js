/**
 * App.js — ADLCS Mobile Navigation Root
 *
 * Stack:
 *   Splash        → animated launch screen with loading bar
 *   Login         → LoginScreen (village & hospital officers)
 *   VillageHome   → placeholder dashboard (village_officer)
 *   HospitalHome  → placeholder dashboard (hospital_officer)
 *
 * Kept as .js (not .tsx) so Expo's registerRootComponent in index.js
 * picks it up without any TypeScript config needed at the entry point.
 * All screens are .tsx.
 */

import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'

import SplashScreen        from './src/screens/SplashScreen'
import LoginScreen         from './src/screens/auth/LoginScreen'
import VillageHomeScreen   from './src/screens/village/VillageHomeScreen'
import HospitalHomeScreen  from './src/screens/hospital/HospitalHomeScreen'

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
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
