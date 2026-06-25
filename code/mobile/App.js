/**
 * App.js -- NBS-CRVS Mobile Root  v8.2
 *
 * PATCH fix_animation_props.py -- fixes:
 *   "Objects are not valid as a React child (found: object with keys {animation})"
 *   Call stack: getRouteConfigsFromChildren -> mapChildren -> mapIntoArray
 *
 * Root cause:
 *   @react-navigation/native-stack v7.3.10 + react-native-screens v4.16.x
 *   changed how per-screen options are passed to the native layer.
 *   Setting `animation` on individual <Stack.Screen options={{animation:'...'}}>
 *   causes react-native-screens 4.x to attempt rendering the animation value
 *   as a native view child, which React rejects as "object with keys {animation}".
 *
 * Fix:
 *   - Removed `animation` from ALL individual Stack.Screen options props.
 *     slide_from_right is the DEFAULT in native-stack v7 -- no prop needed.
 *   - Removed `animation` from navigator screenOptions.
 *     Used `animationTypeForReplace: 'push'` which is the v7-safe alternative.
 *   - SyncData uses `presentation: 'modal'` (v7 API for slide_from_bottom).
 *   - screenOptions remains as arrow function (from previous fix).
 */
import React from 'react'
import { NavigationContainer, DarkTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { ThemeProvider }    from './src/context/ThemeContext'
import { GeofenceProvider } from './src/context/GeofenceContext'
import { navigationRef }    from './src/navigation/navigationService'

// -- Shared -------------------------------------------------------------------
import SplashScreen  from './src/screens/SplashScreen'
import LoginScreen   from './src/screens/auth/LoginScreen'

// -- Hospital officer ---------------------------------------------------------
import HospitalHomeScreen     from './src/screens/hospital/HospitalHomeScreen'
import RegisterBirthScreen    from './src/screens/hospital/RegisterBirthScreen'
import RecordDeathScreen      from './src/screens/hospital/RecordDeathScreen'
import IssueCertificateScreen from './src/screens/hospital/IssueCertificateScreen'
import ViewRecordsScreen      from './src/screens/hospital/ViewRecordsScreen'
import PendingCasesScreen     from './src/screens/hospital/PendingCasesScreen'
import SyncDataScreen         from './src/screens/hospital/SyncDataScreen'

// -- Village officer ----------------------------------------------------------
import VillageHomeScreen            from './src/screens/village/VillageHomeScreen'
import RegisterCitizenScreen        from './src/screens/village/RegisterCitizenScreen'
import RegisterMarriageScreen       from './src/screens/village/RegisterMarriageScreen'
import VillageRecordDeathScreen     from './src/screens/village/VillageRecordDeathScreen'
import RegisterBuildingScreen       from './src/screens/village/RegisterBuildingScreen'
import RegisterInfrastructureScreen from './src/screens/village/RegisterInfrastructureScreen'
import TrackMigrationScreen         from './src/screens/village/TrackMigrationScreen'
import VillageViewRecordsScreen     from './src/screens/village/VillageViewRecordsScreen'
import NINRegistrationScreen        from './src/screens/village/NINRegistrationScreen'

const Stack = createNativeStackNavigator()

// Sets background colour globally -- avoids contentStyle conflicts in native-stack v7
const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#050d1a',
    card:        '#050d1a',
  },
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <GeofenceProvider>
          <NavigationContainer ref={navigationRef} theme={NAV_THEME}>
            <Stack.Navigator
              initialRouteName="Splash"
              screenOptions={() => ({
                headerShown:           false,
                animationTypeForReplace: 'push',
                // NOTE: Do NOT put `animation` here or on individual screens.
                // native-stack v7 + rn-screens 4.x passes animation through
                // getRouteConfigsFromChildren which causes React to try to
                // render the option object as a child -> crash.
              })}
            >
              {/* -- Shared ------------------------------------------------ */}
              <Stack.Screen name="Splash" component={SplashScreen} />
              <Stack.Screen name="Login"  component={LoginScreen} />

              {/* -- Hospital Officer -------------------------------------- */}
              <Stack.Screen name="HospitalHome"     component={HospitalHomeScreen} />
              <Stack.Screen name="RegisterBirth"    component={RegisterBirthScreen} />
              <Stack.Screen name="RecordDeath"      component={RecordDeathScreen} />
              <Stack.Screen name="IssueCertificate" component={IssueCertificateScreen} />
              <Stack.Screen name="ViewRecords"      component={ViewRecordsScreen} />
              <Stack.Screen name="PendingCases"     component={PendingCasesScreen} />
              <Stack.Screen
                name="SyncData"
                component={SyncDataScreen}
                options={{ presentation: 'modal' }}
              />

              {/* -- Village Officer --------------------------------------- */}
              <Stack.Screen name="VillageHome"            component={VillageHomeScreen} />
              <Stack.Screen name="RegisterCitizen"        component={RegisterCitizenScreen} />
              <Stack.Screen name="RegisterMarriage"       component={RegisterMarriageScreen} />
              <Stack.Screen name="VillageRecordDeath"     component={VillageRecordDeathScreen} />
              <Stack.Screen name="RegisterBuilding"       component={RegisterBuildingScreen} />
              <Stack.Screen name="RegisterInfrastructure" component={RegisterInfrastructureScreen} />
              <Stack.Screen name="TrackMigration"         component={TrackMigrationScreen} />
              <Stack.Screen name="VillageViewRecords"     component={VillageViewRecordsScreen} />
              <Stack.Screen name="NINRegistration"        component={NINRegistrationScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </GeofenceProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
