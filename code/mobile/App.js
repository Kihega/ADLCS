/**
 * App.js — ADLCS Mobile Root  v5.0  PRODUCTION
 *
 * Startup:
 *  1. Initialize local SQLite DB (getDb())
 *  2. Start network sync monitor (SyncService.init)
 *  3. In __DEV__ mode: clear AsyncStorage so onboarding runs fresh every QR scan
 *
 * Navigation registers ALL screens so no "undefined route" crashes.
 */

import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator }    from 'react-native'
import { NavigationContainer }        from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider }           from 'react-native-safe-area-context'
import AsyncStorage                   from '@react-native-async-storage/async-storage'

import { ThemeProvider }  from './src/context/ThemeContext'
import { GeofenceProvider } from './src/context/GeofenceContext'
import { navigationRef }  from './src/navigation/navigationService'
import { getDb }          from './src/services/localDb'
import * as SyncService   from './src/services/syncService'

// ─── Screens ──────────────────────────────────────────────────────────────────
import SplashScreen           from './src/screens/SplashScreen'
import LoginScreen            from './src/screens/auth/LoginScreen'
import HospitalHomeScreen     from './src/screens/hospital/HospitalHomeScreen'
import VillageHomeScreen      from './src/screens/village/VillageHomeScreen'
import RegisterBirthScreen    from './src/screens/hospital/RegisterBirthScreen'
import RecordDeathScreen      from './src/screens/hospital/RecordDeathScreen'
import IssueCertificateScreen from './src/screens/hospital/IssueCertificateScreen'
import ViewRecordsScreen      from './src/screens/hospital/ViewRecordsScreen'
import PendingCasesScreen     from './src/screens/hospital/PendingCasesScreen'
import SyncDataScreen         from './src/screens/hospital/SyncDataScreen'

const Stack = createNativeStackNavigator()

const DEV_CLEAR_KEYS = [
  'adlcs_device_activated','adlcs_access_token','adlcs_refresh_token',
  'adlcs_role','adlcs_officer_name','adlcs_facility','adlcs_out_since',
]

function Root() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function boot() {
      try {
        // 1. Init local SQLite DB
        await getDb()

        // 2. Dev mode: clear state so full onboarding triggers every QR scan
        if (__DEV__) {
          await AsyncStorage.multiRemove(DEV_CLEAR_KEYS)
          console.log('[DEV] Storage cleared — fresh onboarding flow')
        }

        // 3. Start sync monitor — auto-syncs when device comes online
        SyncService.init(async () => AsyncStorage.getItem('adlcs_access_token'))

      } catch (e) {
        console.error('[Boot] error:', e)
      } finally {
        setReady(true)
      }
    }
    boot()
    return () => { SyncService.stop() }
  }, [])

  if (!ready) {
    return (
      <View style={{ flex:1, backgroundColor:'#050d1a', alignItems:'center', justifyContent:'center' }}>
        <ActivityIndicator size="large" color="#0891b2" />
      </View>
    )
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown:  false,
          animation:    'fade',
          contentStyle: { backgroundColor:'#050d1a' },
        }}
      >
        <Stack.Screen name="Splash"           component={SplashScreen} />
        <Stack.Screen name="Login"            component={LoginScreen} />
        <Stack.Screen name="HospitalHome"     component={HospitalHomeScreen} />
        <Stack.Screen name="VillageHome"      component={VillageHomeScreen} />
        <Stack.Screen name="RegisterBirth"    component={RegisterBirthScreen}    options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="RecordDeath"      component={RecordDeathScreen}      options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="IssueCertificate" component={IssueCertificateScreen} options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="ViewRecords"      component={ViewRecordsScreen}      options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="PendingCases"     component={PendingCasesScreen}     options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="SyncData"         component={SyncDataScreen}         options={{ animation:'slide_from_bottom' }} />
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
