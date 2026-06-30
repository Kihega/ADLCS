/**
 * responsive.ts — Shared responsive sizing helpers for TzCRVS Mobile
 *
 * Many screens previously read `Dimensions.get('window')` once at module
 * load time and used the raw pixel values directly. That breaks in two
 * ways: (1) it never updates on rotation/fold/multi-window resize, and
 * (2) the same fixed numbers are used on a small phone (e.g. Pixel 3a,
 * ~393\u00d7785dp) and a large tablet (e.g. ~1024\u00d71366dp), so layouts either
 * look cramped or absurdly small depending on the device.
 *
 * `useResponsive()` wraps `useWindowDimensions` (which DOES update live on
 * rotation/resize) and exposes a small set of helpers screens can use to
 * scale sizes and cap content width on larger screens.
 *
 * Usage:
 *   import { useResponsive } from '../../utils/responsive'
 *   const { isTablet, scale, contentMaxWidth } = useResponsive()
 *   <View style={{ width: scale(80), height: scale(96) }} />
 */
import { useWindowDimensions } from 'react-native'

// Baseline reference width used to compute the scale ratio \u2014 a standard
// medium-size phone (e.g. Pixel 3a / iPhone 11 logical width).
export const BASE_WIDTH = 390

// Devices at/above this logical width are treated as tablets.
export const TABLET_BREAKPOINT = 768

export type ResponsiveInfo = {
  width: number
  height: number
  isTablet: boolean
  isLandscape: boolean
  /** Linearly scales a size relative to the 390dp baseline, clamped to
   *  0.85x\u20131.6x so it never shrinks/grows too aggressively. */
  scale: (size: number) => number
  /** Caps content width on large screens/tablets so layouts don't stretch
   *  edge-to-edge and become hard to read; equals the raw width on phones. */
  contentMaxWidth: number
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions()
  const isTablet = width >= TABLET_BREAKPOINT
  const isLandscape = width > height
  const ratio = Math.min(Math.max(width / BASE_WIDTH, 0.85), 1.6)

  const scale = (size: number): number => Math.round(size * ratio)
  const contentMaxWidth = isTablet ? 720 : width

  return { width, height, isTablet, isLandscape, scale, contentMaxWidth }
}
