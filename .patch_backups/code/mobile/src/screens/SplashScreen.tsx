/**
 * SplashScreen.tsx — NBS-CRVS Mobile Splash
 *
 *   • Full-screen ocean-blue gradient (high visibility)
 *   • The official NBS logo, centred, repeatedly zooming OUT (big → normal)
 *     until the app opens the Login page
 *   • Loading bar directly BELOW the logo
 *
 * Works in Expo Go — only uses bundled Expo SDK packages.
 */

import React, { useEffect, useRef } from 'react'
import { View, Text, Animated, Easing, StyleSheet, Dimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

// ── Types ─────────────────────────────────────────────────────────────────────
type RootStack = {
  Splash: undefined
  Login: undefined
  VillageHome: undefined
  HospitalHome: undefined
}

type Props = {
  navigation: NativeStackNavigationProp<RootStack, 'Splash'>
}

// ── Constants ─────────────────────────────────────────────────────────────────
const { width: W } = Dimensions.get('window')
const LOGO_W = Math.min(W * 0.55, 260)
const LOGO_H = LOGO_W * (370 / 340) // logo asset is 340 x 370
const BAR_W = Math.min(W * 0.6, 280)

const SHOW_MS = 3400 // how long the splash stays before opening Login

const C = {
  top: '#00A8E8' as const, // bright ocean blue
  mid: '#0077B6' as const,
  bottom: '#023E8A' as const, // deep ocean
  white: '#ffffff' as const,
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SplashScreen({ navigation }: Props) {
  // Progress bar (JS driver — animates width, cannot use the native driver)
  const progress = useRef(new Animated.Value(0)).current
  // Logo zoom-out loop (native driver — transform + opacity only)
  const zoom = useRef(new Animated.Value(1.28)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  // Fade-out of the whole screen
  const screenFade = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: SHOW_MS - 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start()

    // Repeated zoom-out: starts big, shrinks to normal, short rest, repeat.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(zoom, {
            toValue: 1,
            duration: 1100,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(logoOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        ]),
        Animated.delay(300),
      ])
    )
    loop.start()

    const navTimer = setTimeout(() => {
      Animated.timing(screenFade, { toValue: 0, duration: 350, useNativeDriver: true }).start(
        () => {
          loop.stop()
          navigation.replace('Login')
        }
      )
    }, SHOW_MS)

    return () => {
      clearTimeout(navTimer)
      loop.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <Animated.View style={[s.root, { opacity: screenFade }]}>
      <LinearGradient
        colors={[C.top, C.mid, C.bottom]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Logo + loading bar, centred together as one block */}
      <View style={s.center}>
        <Animated.Image
          source={require('../../public/assets/longo_nbs.png')}
          style={[
            { width: LOGO_W, height: LOGO_H },
            { opacity: logoOpacity, transform: [{ scale: zoom }] },
          ]}
          resizeMode="contain"
        />

        <View style={s.barArea}>
          <View style={s.barTrack}>
            <Animated.View style={[s.barFill, { width: barWidth }]} />
          </View>
          <Text style={s.barLabel}>Loading…</Text>
        </View>
      </View>

      <Text style={s.footer}>© 2026 NBS-CRVS · All rights reserved</Text>
    </Animated.View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.mid },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  barArea: { width: BAR_W, marginTop: 36, alignItems: 'center', gap: 10 },
  barTrack: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.30)',
    overflow: 'hidden',
  },
  barFill: { height: 5, borderRadius: 3, backgroundColor: C.white },
  barLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 22,
    alignSelf: 'center',
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.5,
  },
})
