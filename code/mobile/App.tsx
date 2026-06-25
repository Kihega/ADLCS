// @ts-nocheck
/**
 * App.js — ADLCS Mobile Root  v8.0  ONLINE-ONLY
 * Offline SQLite removed. Geofencing disabled for dev/test.
 * App boots instantly to Login (via Splash).
 * All data goes directly to backend → Supabase.
 */
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { ThemeProvider }    from './src/context/ThemeContext'
import { GeofenceProvider } from './src/context/GeofenceContext'
import { navigationRef }    from './src/navigation/navigationService'

// ── Shared ────────────────────────────────────────────────────────────────────
import SplashScreen  from './src/screens/SplashScreen'
import LoginScreen   from './src/screens/auth/LoginScreen'

// ── Hospital officer ──────────────────────────────────────────────────────────
import HospitalHomeScreen     from './src/screens/hospital/HospitalHomeScreen'
import RegisterBirthScreen    from './src/screens/hospital/RegisterBirthScreen'
import RecordDeathScreen      from './src/screens/hospital/RecordDeathScreen'
import IssueCertificateScreen from './src/screens/hospital/IssueCertificateScreen'
import ViewRecordsScreen      from './src/screens/hospital/ViewRecordsScreen'
import PendingCasesScreen     from './src/screens/hospital/PendingCasesScreen'
import SyncDataScreen         from './src/screens/hospital/SyncDataScreen'

// ── Village officer ───────────────────────────────────────────────────────────
import VillageHomeScreen            from './src/screens/village/VillageHomeScreen'
import RegisterCitizenScreen        from './src/screens/village/RegisterCitizenScreen'
import RegisterMarriageScreen       from './src/screens/village/RegisterMarriageScreen'
import VillageRecordDeathScreen     from './src/screens/village/VillageRecordDeathScreen'
import TrackMigrationScreen         from './src/screens/village/TrackMigrationScreen'
import VillageViewRecordsScreen     from './src/screens/village/VillageViewRecordsScreen'
import NINRegistrationScreen        from './src/screens/village/NINRegistrationScreen'

const Stack = createNativeStackNavigator()

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {/* GeofenceProvider is a no-op stub — geofencing disabled for dev */}
        <GeofenceProvider>
          <NavigationContainer ref={navigationRef}>
            <Stack.Navigator
              initialRouteName="Splash"
              screenOptions={{
                headerShown:  false,
                animation:    'fade',
                contentStyle: { backgroundColor: '#050d1a' },
              }}
            >
              {/* ── Shared ────────────────────────────────────────── */}
              <Stack.Screen name="Splash"   component={SplashScreen} />
              <Stack.Screen name="Login"    component={LoginScreen} />

              {/* ── Hospital Officer ──────────────────────────────── */}
              <Stack.Screen name="HospitalHome"     component={HospitalHomeScreen} />
              <Stack.Screen name="RegisterBirth"    component={RegisterBirthScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="RecordDeath"      component={RecordDeathScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="IssueCertificate" component={IssueCertificateScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="ViewRecords"      component={ViewRecordsScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="PendingCases"     component={PendingCasesScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="SyncData"         component={SyncDataScreen}
                options={{ animation: 'slide_from_bottom' }} />

              {/* ── Village Officer ───────────────────────────────── */}
              <Stack.Screen name="VillageHome"             component={VillageHomeScreen} />
              <Stack.Screen name="RegisterCitizen"         component={RegisterCitizenScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="RegisterMarriage"        component={RegisterMarriageScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="VillageRecordDeath"      component={VillageRecordDeathScreen}
                options={{ animation: 'slide_from_right' }} />
                options={{ animation: 'slide_from_right' }} />
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="TrackMigration"          component={TrackMigrationScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="VillageViewRecords"      component={VillageViewRecordsScreen}
                options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="NINRegistration"         component={NINRegistrationScreen}
                options={{ animation: 'slide_from_right' }} />
            </Stack.Navigator>
          </NavigationContainer>
        </GeofenceProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
