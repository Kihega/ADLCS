/**
 * SplashScreen.tsx — ADLCS Mobile Splash
 *
 * Layout (matches Image 1 / PoPtz style):
 *   • Full-screen dark-navy gradient background
 *   • Large centred cyan circle with subtle pulse
 *   • "ADLCS" text + "NBS" subtitle inside the circle
 *   • Thin loading bar that fills over 2.5 s
 *   • Fades out, then navigates to Login
 *
 * Works in Expo Go — only uses bundled Expo SDK packages.
 */

import React, { useEffect, useRef } from 'react'
import {
  View,
  Text,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// ── Types ─────────────────────────────────────────────────────────────────────
type RootStack = {
  Splash:       undefined
  Login:        undefined
  VillageHome:  undefined
  HospitalHome: undefined
}

type Props = {
  navigation: NativeStackNavigationProp<RootStack, 'Splash'>
}

// ── Constants ─────────────────────────────────────────────────────────────────
const { width: W, height: H } = Dimensions.get('window')
const CIRCLE_SIZE = W * 0.60   // 60 % of screen width — matches PoPtz large circle

const C = {
  bg1:    '#050d1a' as const,
  bg2:    '#071428' as const,
  bg3:    '#040b16' as const,
  cyan:   '#00d4ff' as const,
  white:  '#ffffff' as const,
  dim:    'rgba(255,255,255,0.35)' as const,
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SplashScreen({ navigation }: Props) {

  // Progress bar (JS driver — controls layout width, cannot use native driver)
  const progress  = useRef(new Animated.Value(0)).current

  // Fade-out of the entire screen (native driver — only transforms opacity)
  const screenFade = useRef(new Animated.Value(1)).current

  // Subtle pulse on the circle (native driver — scale transform)
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {

    // 1. Fill the progress bar over 2.5 s
    Animated.timing(progress, {
      toValue: 1,
      duration: 2500,
      useNativeDriver: false,   // must be false — animates a layout property (width)
    }).start()

    // 2. Gentle infinite pulse on the circle
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.00, duration: 900, useNativeDriver: true }),
      ])
    ).start()

    // 3. After 2.9 s: fade out, then navigate
    const navTimer = setTimeout(() => {
      Animated.timing(screenFade, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }).start(() => {
        navigation.replace('Login')
      })
    }, 2900)

    return () => clearTimeout(navTimer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const barWidth = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  })

  return (
    <Animated.View style={[s.root, { opacity: screenFade }]}>

      {/* ── Background gradient (matches Image 1: top-blue → bottom-dark) ── */}
      <LinearGradient
        colors={[C.bg2, C.bg1, C.bg3]}
        locations={[0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Subtle grid overlay (matches web dashboard bg grid) ─────────── */}
      <View style={s.gridOverlay} pointerEvents="none">
        {Array.from({ length: Math.ceil(H / 40) }).map((_, r) =>
          <View key={r} style={s.gridRow} />
        )}
      </View>

      {/* ── Centre: large teal circle (matches PoPtz big circle) ─────────── */}
      <Animated.View style={[s.circleOuter, { transform: [{ scale: pulse }] }]}>
        <LinearGradient
          colors={[`${C.cyan}28`, `${C.cyan}10`]}
          style={s.circleBg}
        >
          {/* Inner ring */}
          <View style={s.circleInner}>

            {/* ADLCS lettering — styled like PoPtz bold text */}
            <Text style={s.circleTitle}>ADLCS</Text>
            <View style={s.circleDivider} />
            <Text style={s.circleSubtitle}>NBS · Tanzania</Text>
            <Text style={s.circleVersion}>V 1.X.X</Text>

          </View>
        </LinearGradient>
      </Animated.View>

      {/* ── App name below circle ────────────────────────────────────────── */}
      <View style={s.labelBlock}>
        <Text style={s.labelMain}>Automated Digital Live Census</Text>
        <Text style={s.labelSub}>National Bureau of Statistics</Text>
      </View>

      {/* ── Loading bar (the extra element Image 1 doesn't have) ─────────── */}
      <View style={s.barArea}>
        <Text style={s.barLabel}>Loading…</Text>
        <View style={s.barTrack}>
          <Animated.View style={[s.barFill, { width: barWidth }]}>
            <LinearGradient
              colors={[C.cyan, '#00b8d9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </View>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <Text style={s.footer}>© 2026 NBS-ADLCS · All rights reserved</Text>

    </Animated.View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg1,
  },

  // Faint grid lines — same pattern as web dashboard
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  gridRow: {
    height: 40,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,212,255,0.04)',
    width: '100%',
  },

  // Circle — outer glow ring
  circleOuter: {
    width:        CIRCLE_SIZE + 24,
    height:       CIRCLE_SIZE + 24,
    borderRadius: (CIRCLE_SIZE + 24) / 2,
    borderWidth:  1.5,
    borderColor:  `${C.cyan}35`,
    alignItems:   'center',
    justifyContent: 'center',
    shadowColor:  C.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation:    10,
    marginBottom: 28,
  },
  circleBg: {
    width:        CIRCLE_SIZE,
    height:       CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems:   'center',
    justifyContent: 'center',
  },
  circleInner: {
    width:        CIRCLE_SIZE - 20,
    height:       CIRCLE_SIZE - 20,
    borderRadius: (CIRCLE_SIZE - 20) / 2,
    borderWidth:  1,
    borderColor:  `${C.cyan}20`,
    alignItems:   'center',
    justifyContent: 'center',
    gap: 4,
  },

  // Text inside circle — bold like "PoPtz"
  circleTitle: {
    fontSize:    CIRCLE_SIZE * 0.18,
    fontWeight:  '900',
    color:       C.cyan,
    letterSpacing: 3,
    textShadowColor: `${C.cyan}80`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  circleDivider: {
    width: 50, height: 1.5,
    backgroundColor: `${C.cyan}40`,
    marginVertical: 4,
  },
  circleSubtitle: {
    fontSize:   11,
    color:      C.dim,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  circleVersion: {
    fontSize:   9,
    color:      `${C.cyan}60`,
    fontVariant: ['tabular-nums'],
    marginTop:  2,
  },

  // Label block below circle
  labelBlock: {
    alignItems: 'center',
    gap: 3,
    marginBottom: 48,
  },
  labelMain: {
    fontSize:   14,
    color:      'rgba(255,255,255,0.80)',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  labelSub: {
    fontSize:   11,
    color:      'rgba(255,255,255,0.40)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Loading bar
  barArea: {
    position: 'absolute',
    bottom:   60,
    left:     36,
    right:    36,
    gap:      8,
  },
  barLabel: {
    fontSize:  10,
    color:     `${C.cyan}80`,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  barTrack: {
    height:       4,
    borderRadius: 2,
    backgroundColor: `${C.cyan}18`,
    overflow: 'hidden',
  },
  barFill: {
    height:       4,
    borderRadius: 2,
    overflow:     'hidden',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom:   20,
    fontSize: 9,
    color:    'rgba(255,255,255,0.18)',
    letterSpacing: 0.5,
  },
})