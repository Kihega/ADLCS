/**
 * App.js — TzCRVS Mobile Root  v9.0
 *
 * Changes:
 *  - GeofenceProvider removed (no geofencing)
 *  - Village screens trimmed to: NINRegistration, RegisterCitizen,
 *    VillageRecordDeath, RegisterMarriage
 *  - No `animation` keys anywhere (crashes native-stack v7 + rn-screens 4.x)
 *  - No JSX comments inside Stack.Navigator (crash in @react-navigation/core)
 *  - screenOptions as arrow function (required)
 *  - Background via NavigationContainer theme (not contentStyle)
 */
import React from 'react'
import { NavigationContainer, DarkTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { ThemeProvider } from './src/context/ThemeContext'
import { navigationRef } from './src/navigation/navigationService'

import SplashScreen from './src/screens/SplashScreen'
import LoginScreen from './src/screens/auth/LoginScreen'

import HospitalHomeScreen from './src/screens/hospital/HospitalHomeScreen'
import RegisterBirthScreen from './src/screens/hospital/RegisterBirthScreen'
import RecordDeathScreen from './src/screens/hospital/RecordDeathScreen'
import IssueCertificateScreen from './src/screens/hospital/IssueCertificateScreen'
import ViewRecordsScreen from './src/screens/hospital/ViewRecordsScreen'
import PendingCasesScreen from './src/screens/hospital/PendingCasesScreen'
import SyncDataScreen from './src/screens/hospital/SyncDataScreen'

import VillageHomeScreen from './src/screens/village/VillageHomeScreen'
import RegisterCitizenScreen from './src/screens/village/RegisterCitizenScreen'
import RegisterMarriageScreen from './src/screens/village/RegisterMarriageScreen'
import VillageRecordDeathScreen from './src/screens/village/VillageRecordDeathScreen'
import NINRegistrationScreen from './src/screens/village/NINRegistrationScreen'

const Stack = createNativeStackNavigator()

const NAV_THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#050d1a', card: '#050d1a' },
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NavigationContainer ref={navigationRef} theme={NAV_THEME}>
          <Stack.Navigator initialRouteName="Splash" screenOptions={() => ({ headerShown: false })}>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="HospitalHome" component={HospitalHomeScreen} />
            <Stack.Screen name="RegisterBirth" component={RegisterBirthScreen} />
            <Stack.Screen name="RecordDeath" component={RecordDeathScreen} />
            <Stack.Screen name="IssueCertificate" component={IssueCertificateScreen} />
            <Stack.Screen name="ViewRecords" component={ViewRecordsScreen} />
            <Stack.Screen name="PendingCases" component={PendingCasesScreen} />
            <Stack.Screen
              name="SyncData"
              component={SyncDataScreen}
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen name="VillageHome" component={VillageHomeScreen} />
            <Stack.Screen name="RegisterCitizen" component={RegisterCitizenScreen} />
            <Stack.Screen name="RegisterMarriage" component={RegisterMarriageScreen} />
            <Stack.Screen name="VillageRecordDeath" component={VillageRecordDeathScreen} />
            <Stack.Screen name="NINRegistration" component={NINRegistrationScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
