/**
 * KeyboardAware.tsx — the on-screen keyboard must never cover a text input.
 *
 *  KeyboardAwareScrollView  drop-in replacement for <ScrollView>.
 *  KeyboardSafeView         drop-in replacement for <KeyboardAvoidingView>
 *                           (the old `behavior` props are accepted and ignored).
 *                           Pass `pad` for bottom-sheets inside a <Modal>.
 *
 * Instead of guessing per platform (`padding` vs `height`, which breaks with
 * Android edge-to-edge), we MEASURE how far the keyboard really overlaps this
 * view (view bottom in window coordinates vs. keyboard top). That is 0 when
 * the OS already resized the window and the full keyboard height when it did
 * not, so the same code is right on iOS, Android resize and edge-to-edge.
 * The scroll view then pads its content by that amount and scrolls the focused
 * input above the keyboard.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native'
import { useIsFocused } from '@react-navigation/native'

const EXTRA_MARGIN = 24 // breathing room between the input and the keyboard

type Measurable = {
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void
  getNativeScrollRef?: () => Measurable | null
}

function measure(node: unknown, cb: (y: number, h: number) => void): boolean {
  const n = node as Measurable | null
  const target = n && typeof n.measureInWindow === 'function' ? n : n?.getNativeScrollRef?.()
  if (!target || typeof target.measureInWindow !== 'function') return false
  target.measureInWindow((_x, y, _w, h) => cb(y, h))
  return true
}

/** How many px of `ref`'s view the keyboard currently covers (+ keyboard top). */
function useKeyboardOverlap(ref: React.RefObject<unknown>, active: boolean) {
  const [state, setState] = useState<{ overlap: number; top: number | null }>({
    overlap: 0,
    top: null,
  })

  useEffect(() => {
    if (!active) return
    const ios = Platform.OS === 'ios'
    let timer: ReturnType<typeof setTimeout> | null = null

    const apply = (e: KeyboardEvent) => {
      const top = e.endCoordinates.screenY
      const fallback = Math.round(e.endCoordinates.height)
      const ok = measure(ref.current, (y, h) => {
        setState({ overlap: Math.max(0, Math.round(y + h - top)), top })
      })
      if (!ok) setState({ overlap: fallback, top })
    }
    const onShow = (e: KeyboardEvent) => {
      if (timer) clearTimeout(timer)
      // Android reports the keyboard before the window has finished resizing.
      timer = setTimeout(() => apply(e), ios ? 0 : 90)
    }
    const onHide = () => {
      if (timer) clearTimeout(timer)
      setState({ overlap: 0, top: null })
    }

    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillChangeFrame' : 'keyboardDidShow', onShow),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', onHide),
    ]
    return () => {
      if (timer) clearTimeout(timer)
      subs.forEach((s) => s.remove())
    }
  }, [ref, active])

  return state
}

// ─── KeyboardAwareScrollView ──────────────────────────────────────────────────
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function KeyboardAwareScrollView(props, ref) {
    const {
      contentContainerStyle,
      onScroll,
      onTouchEnd,
      horizontal,
      keyboardShouldPersistTaps,
      keyboardDismissMode,
      scrollEventThrottle,
      ...rest
    } = props

    const scrollRef = useRef<ScrollView>(null)
    useImperativeHandle(ref, () => scrollRef.current as ScrollView)
    const scrollY = useRef(0)
    const focused = useIsFocused() // only the visible screen reacts to the keyboard
    const { overlap, top } = useKeyboardOverlap(scrollRef, focused && !horizontal)
    const topRef = useRef<number | null>(null)
    topRef.current = top

    const revealFocusedInput = useCallback(() => {
      const kbTop = topRef.current
      if (kbTop == null) return
      const input = (TextInput as unknown as {
        State?: { currentlyFocusedInput?: () => unknown }
      }).State?.currentlyFocusedInput?.()
      measure(input, (y, h) => {
        const bottom = y + h + EXTRA_MARGIN
        if (bottom > kbTop) {
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollY.current + (bottom - kbTop)),
            animated: true,
          })
        }
      })
    }, [])

    // Keyboard opened (or its size changed) → bring the focused input into view.
    useEffect(() => {
      if (top == null) return
      const t = setTimeout(revealFocusedInput, 120)
      return () => clearTimeout(t)
    }, [top, overlap, revealFocusedInput])

    const handleScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollY.current = e.nativeEvent.contentOffset.y
        onScroll?.(e)
      },
      [onScroll]
    )

    // Tapping another input while the keyboard is already open fires no
    // keyboard event, so re-check after every touch.
    const handleTouchEnd = useCallback(
      (e: Parameters<NonNullable<ScrollViewProps['onTouchEnd']>>[0]) => {
        if (topRef.current != null) setTimeout(revealFocusedInput, 160)
        onTouchEnd?.(e)
      },
      [onTouchEnd, revealFocusedInput]
    )

    if (horizontal) {
      return <ScrollView ref={scrollRef} horizontal {...props} />
    }

    let containerStyle = contentContainerStyle
    if (overlap > 0) {
      const flat = (StyleSheet.flatten(contentContainerStyle) ?? {}) as Record<string, unknown>
      const base =
        typeof flat.paddingBottom === 'number'
          ? flat.paddingBottom
          : typeof flat.padding === 'number'
            ? flat.padding
            : 0
      containerStyle = { ...flat, paddingBottom: base + overlap }
    }

    return (
      <ScrollView
        ref={scrollRef}
        {...rest}
        contentContainerStyle={containerStyle}
        onScroll={handleScroll}
        onTouchEnd={handleTouchEnd}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}
        keyboardDismissMode={keyboardDismissMode ?? 'on-drag'}
      />
    )
  }
)

// ─── KeyboardSafeView ─────────────────────────────────────────────────────────
type SafeViewProps = ViewProps & {
  /** Lift the content above the keyboard (use for bottom-sheets in a Modal). */
  pad?: boolean
  /** Accepted for drop-in compatibility with KeyboardAvoidingView — ignored. */
  behavior?: string
  keyboardVerticalOffset?: number
  enabled?: boolean
}

export function KeyboardSafeView(props: SafeViewProps) {
  const { pad = false, style, children, ...rest } = props
  const viewProps: Record<string, unknown> = { ...rest }
  delete viewProps.behavior
  delete viewProps.keyboardVerticalOffset
  delete viewProps.enabled

  const ref = useRef<View>(null)
  const focused = useIsFocused()
  const { overlap } = useKeyboardOverlap(ref, pad && focused)

  return (
    <View
      ref={ref}
      collapsable={false}
      {...(viewProps as ViewProps)}
      style={[style, pad && overlap > 0 ? { paddingBottom: overlap } : null]}
    >
      {children}
    </View>
  )
}
