/**
 * AppDialog.tsx — every alert / error / warning in the app is shown as a
 * centred modal CARD (never the native system dialog, never an inline red line).
 *
 *   • Alerts / errors / success / info  →  one "OK" button.
 *   • Warnings (anything that needs a decision, i.e. two or more buttons)
 *                                         →  "Cancel" + "Confirm" buttons.
 *
 * Usage — drop-in replacement for react-native's Alert:
 *
 *   import { Alert } from '../../components/AppDialog'
 *   Alert.alert('Saved', 'Record saved.')                       // OK card
 *   Alert.alert('Sign out?', 'Are you sure?', [                 // Cancel / Confirm card
 *     { text: 'Cancel', style: 'cancel' },
 *     { text: 'Sign Out', style: 'destructive', onPress: doSignOut },
 *   ])
 *
 * Inline error text state can be routed to a card with the hook:
 *   useErrorDialog(error, () => setError(''), 'Sign-in error')
 *
 * <AppDialogHost /> is mounted once, inside ThemeProvider, in App.js.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

export type DialogKind = 'error' | 'warning' | 'success' | 'info'

export interface DialogButton {
  text?: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: () => void
}

interface DialogRequest {
  id: number
  kind: DialogKind
  title: string
  message?: string
  buttons: DialogButton[]
}

type Listener = (d: DialogRequest) => void

let listener: Listener | null = null
let pending: DialogRequest[] = []
let nextId = 1

function inferKind(title: string, hasDecision: boolean, buttons: DialogButton[]): DialogKind {
  if (hasDecision) return 'warning'
  const t = title.toLowerCase()
  if (/success|complete|confirmed|saved|synced|✓|done/.test(t)) return 'success'
  if (/error|fail|invalid|denied|not found|could not|couldn't|offline|cannot|unable/.test(t)) return 'error'
  if (/required|missing|select|enter/.test(t)) return 'warning'
  if (buttons.some((b) => b.style === 'destructive')) return 'warning'
  return 'info'
}

function enqueue(d: DialogRequest) {
  if (listener) listener(d)
  else pending.push(d)
}

/** Show a dialog card. Returns nothing; use button callbacks for decisions. */
export function showDialog(opts: {
  title: string
  message?: string
  kind?: DialogKind
  buttons?: DialogButton[]
}) {
  const buttons = opts.buttons && opts.buttons.length ? opts.buttons : [{ text: 'OK' }]
  const hasDecision = buttons.length >= 2
  enqueue({
    id: nextId++,
    kind: opts.kind ?? inferKind(opts.title, hasDecision, buttons),
    title: opts.title,
    message: opts.message,
    buttons,
  })
}

/** Drop-in for react-native's Alert.alert(title, message?, buttons?, options?) */
export const Alert = {
  alert(title: string, message?: string, buttons?: DialogButton[], _options?: unknown) {
    showDialog({ title, message, buttons })
  },
}

/** Pops a card whenever `error` becomes non-empty, then clears it. */
export function useErrorDialog(error: string, clear: () => void, title = 'Error') {
  const clearRef = useRef(clear)
  useEffect(() => {
    clearRef.current = clear
  })
  useEffect(() => {
    if (!error) return
    showDialog({ title, message: error, kind: 'error' })
    clearRef.current()
  }, [error, title])
}

const KIND_STYLE: Record<DialogKind, { Icon: typeof Info; color: (t: any) => string }> = {
  error: { Icon: XCircle, color: (t) => t.danger },
  warning: { Icon: AlertTriangle, color: (t) => t.warning },
  success: { Icon: CheckCircle2, color: (t) => t.success },
  info: { Icon: Info, color: (t) => t.blue },
}

export function AppDialogHost() {
  const { theme: T } = useTheme()
  const [queue, setQueue] = useState<DialogRequest[]>([])

  useEffect(() => {
    listener = (d) => setQueue((q) => [...q, d])
    if (pending.length) {
      const first = pending
      pending = []
      setQueue((q) => [...q, ...first])
    }
    return () => {
      listener = null
    }
  }, [])

  const current = queue[0]

  const finish = useCallback((btn?: DialogButton) => {
    setQueue((q) => q.slice(1))
    if (btn?.onPress) {
      // let the card finish closing before the action runs (navigation, next card…)
      setTimeout(() => btn.onPress && btn.onPress(), 60)
    }
  }, [])

  if (!current) return null

  const isDecision = current.buttons.length >= 2
  const cancelBtn = current.buttons.find((b) => b.style === 'cancel')
  const actionBtns = current.buttons.filter((b) => b !== cancelBtn)
  const { Icon, color } = KIND_STYLE[current.kind]
  const accent = color(T)

  const labelFor = (b: DialogButton) => {
    if (!isDecision) return 'OK'
    if (b === cancelBtn) return 'Cancel'
    // one decision button → the standard label; several → keep their own wording
    return actionBtns.length === 1 ? 'Confirm' : b.text || 'Confirm'
  }

  return (
    <Modal
      key={current.id}
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => finish(cancelBtn)}
    >
      <Pressable style={s.backdrop} onPress={() => (isDecision ? undefined : finish(current.buttons[0]))}>
        <Pressable style={[s.card, { backgroundColor: T.card, borderColor: T.border }]} onPress={() => undefined}>
          <View style={[s.iconWrap, { backgroundColor: accent + '22' }]}>
            <Icon size={28} color={accent} />
          </View>
          <Text style={[s.title, { color: T.text }]}>{current.title}</Text>
          {!!current.message && <Text style={[s.message, { color: T.textSub }]}>{current.message}</Text>}

          <View style={[s.btnRow, isDecision && actionBtns.length > 1 && { flexDirection: 'column' }]}>
            {isDecision ? (
              <>
                {cancelBtn && (
                  <TouchableOpacity
                    style={[s.btn, { borderColor: T.border, borderWidth: 1, backgroundColor: T.card2 }]}
                    onPress={() => finish(cancelBtn)}
                  >
                    <Text style={[s.btnText, { color: T.textSub }]}>{labelFor(cancelBtn)}</Text>
                  </TouchableOpacity>
                )}
                {actionBtns.map((b, i) => (
                  <TouchableOpacity
                    key={`${b.text}-${i}`}
                    style={[s.btn, { backgroundColor: b.style === 'destructive' ? T.danger : T.primary }]}
                    onPress={() => finish(b)}
                  >
                    <Text style={[s.btnText, { color: '#ffffff' }]}>{labelFor(b)}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <TouchableOpacity
                style={[s.btn, { backgroundColor: current.kind === 'error' ? T.danger : T.primary }]}
                onPress={() => finish(current.buttons[0])}
              >
                <Text style={[s.btnText, { color: '#ffffff' }]}>OK</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  btnText: { fontSize: 14, fontWeight: '800' },
})
