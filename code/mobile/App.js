/**
 * App.js — ADLCS Mobile Navigation Root  v3.0
 *
 * Providers (outermost → innermost):
 *   SafeAreaProvider
 *   ThemeProvider    — global dark/light theme shared by all screens
 *   GeofenceProvider — GPS boundary monitoring, 3-hr logout timer
 *   NavigationContainer (ref={navigationRef} — used by GeofenceContext)
 *
 * Screens registered:
 *   Splash          — animated launch screen
 *   Login           — shared auth (village + hospital officers)
 *   VillageHome     — village officer dashboard
 *   HospitalHome    — hospital officer dashboard
 *   RegisterBirth   — multi-step birth registration
 *   RecordDeath     — death recording form
 *   IssueCertificate— certificate issuance workflow
 *   ViewRecords     — paginated record list
 *   PendingCases    — pending / incomplete registrations
 *   SyncData        — manual sync status screen
 *
 * Dev behaviour:
 *   When __DEV__ === true (Expo Go), AsyncStorage is cleared on every mount
 *   so the full onboarding flow (OTP → device binding → password setup)
 *   runs fresh on every QR scan — no need to reinstall or wipe data manually.
 */

import { useEffect }                         from 'react'
import { NavigationContainer }               from '@react-navigation/native'
import { createNativeStackNavigator }        from '@react-navigation/native-stack'
import { SafeAreaProvider }                  from 'react-native-safe-area-context'
import AsyncStorage                          from '@react-native-async-storage/async-storage'

import { ThemeProvider }                     from './src/context/ThemeContext'
import { GeofenceProvider }                  from './src/context/GeofenceContext'
import { navigationRef }                     from './src/navigation/navigationService'

import SplashScreen                          from './src/screens/SplashScreen'
import LoginScreen                           from './src/screens/auth/LoginScreen'
import VillageHomeScreen                     from './src/screens/village/VillageHomeScreen'
import HospitalHomeScreen                    from './src/screens/hospital/HospitalHomeScreen'
import RegisterBirthScreen                   from './src/screens/hospital/RegisterBirthScreen'
import RecordDeathScreen                     from './src/screens/hospital/RecordDeathScreen'
import IssueCertificateScreen                from './src/screens/hospital/IssueCertificateScreen'
import ViewRecordsScreen                     from './src/screens/hospital/ViewRecordsScreen'
import PendingCasesScreen                    from './src/screens/hospital/PendingCasesScreen'
import SyncDataScreen                        from './src/screens/hospital/SyncDataScreen'

const Stack = createNativeStackNavigator()

// Keys to wipe on every dev reload so the full onboarding flow is re-triggered
const DEV_CLEAR_KEYS = [
  'adlcs_device_activated',
  'adlcs_access_token',
  'adlcs_refresh_token',
  'adlcs_role',
  'adlcs_officer_name',
  'adlcs_facility',
  'adlcs_out_since',
]

function Root() {
  useEffect(() => {
    if (__DEV__) {
      // ── DEV MODE: wipe state on every Expo Go reload / QR scan ──────────
      // This ensures the full OTP → device-bind → password-setup flow runs
      // every time, simulating a genuine first-install on a new device.
      AsyncStorage.multiRemove(DEV_CLEAR_KEYS).then(() => {
        if (__DEV__) console.log('[DEV] AsyncStorage cleared — fresh onboarding flow')
      })
    }
  }, [])

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown:  false,
          animation:    'fade',
          contentStyle: { backgroundColor: '#050d1a' },
        }}
      >
        <Stack.Screen name="Splash"           component={SplashScreen} />
        <Stack.Screen name="Login"            component={LoginScreen} />
        <Stack.Screen name="VillageHome"      component={VillageHomeScreen} />
        <Stack.Screen name="HospitalHome"     component={HospitalHomeScreen} />
        <Stack.Screen
          name="RegisterBirth"
          component={RegisterBirthScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="RecordDeath"
          component={RecordDeathScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="IssueCertificate"
          component={IssueCertificateScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ViewRecords"
          component={ViewRecordsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="PendingCases"
          component={PendingCasesScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="SyncData"
          component={SyncDataScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <GeofenceProvider>
          <Root />
        </GeofenceProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
