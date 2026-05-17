/**
 * App.js — ADLCS Mobile Root  v7.0  PRODUCTION
 * All hospital + village screens registered.
 */
import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator }    from 'react-native'
import { NavigationContainer }        from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider }           from 'react-native-safe-area-context'
import AsyncStorage                   from '@react-native-async-storage/async-storage'

import { ThemeProvider }    from './src/context/ThemeContext'
import { GeofenceProvider } from './src/context/GeofenceContext'
import { navigationRef }    from './src/navigation/navigationService'
import { getDb }            from './src/services/localDb'
import * as SyncService     from './src/services/syncService'

// ── Shared ────────────────────────────────────────────────────────────────────
import SplashScreen           from './src/screens/SplashScreen'
import LoginScreen            from './src/screens/auth/LoginScreen'

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
import RegisterBuildingScreen       from './src/screens/village/RegisterBuildingScreen'
import RegisterInfrastructureScreen from './src/screens/village/RegisterInfrastructureScreen'
import TrackMigrationScreen         from './src/screens/village/TrackMigrationScreen'
import VillageViewRecordsScreen     from './src/screens/village/VillageViewRecordsScreen'

const Stack = createNativeStackNavigator()

const DEV_CLEAR_KEYS = [
  'adlcs_device_activated', 'adlcs_access_token', 'adlcs_refresh_token',
  'adlcs_role', 'adlcs_officer_name', 'adlcs_facility', 'adlcs_out_since',
]

function Root() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function boot() {
      try {
        await getDb()
        if (__DEV__) {
          await AsyncStorage.multiRemove(DEV_CLEAR_KEYS)
          console.log('[DEV] Storage cleared — fresh onboarding flow')
        }
        await SyncService.init(async () => AsyncStorage.getItem('adlcs_access_token'))
      } catch (e) {
        console.error('[Boot]', e)
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
        <ActivityIndicator size="large" color="#1eb53a" />
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
        {/* ── Shared ─────────────────────────────────────────────────────── */}
        <Stack.Screen name="Splash"   component={SplashScreen} />
        <Stack.Screen name="Login"    component={LoginScreen} />

        {/* ── Hospital Officer ───────────────────────────────────────────── */}
        <Stack.Screen name="HospitalHome"     component={HospitalHomeScreen} />
        <Stack.Screen name="RegisterBirth"    component={RegisterBirthScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="RecordDeath"      component={RecordDeathScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="IssueCertificate" component={IssueCertificateScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="ViewRecords"      component={ViewRecordsScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="PendingCases"     component={PendingCasesScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="SyncData"         component={SyncDataScreen}
          options={{ animation:'slide_from_bottom' }} />

        {/* ── Village Officer ─────────────────────────────────────────────── */}
        <Stack.Screen name="VillageHome"             component={VillageHomeScreen} />
        <Stack.Screen name="RegisterCitizen"         component={RegisterCitizenScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="RegisterMarriage"        component={RegisterMarriageScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="VillageRecordDeath"      component={VillageRecordDeathScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="RegisterBuilding"        component={RegisterBuildingScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="RegisterInfrastructure"  component={RegisterInfrastructureScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="TrackMigration"          component={TrackMigrationScreen}
          options={{ animation:'slide_from_right' }} />
        <Stack.Screen name="VillageViewRecords"      component={VillageViewRecordsScreen}
          options={{ animation:'slide_from_right' }} />
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
