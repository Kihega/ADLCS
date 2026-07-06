/**
 * ErrorBoundary.js — Last-resort crash screen for TzCRVS Mobile
 *
 * WHY THIS EXISTS:
 * Production/EAS-built APKs don't show React Native's red-box dev overlay
 * on a JS exception — by default an uncaught error during render can just
 * close the app silently, with nothing visible to the user and nothing
 * accessible without a full adb logcat session. That makes "the app closes
 * right after install, before the login screen even shows" extremely hard
 * to diagnose from the field.
 *
 * This component catches any JS render-time error anywhere below it in the
 * tree and shows a plain-text screen with the actual error message and
 * stack, instead of the app just vanishing. It does NOT catch native-level
 * crashes (those happen below the JS engine entirely and can only be seen
 * via adb logcat) — but it WILL catch the very common case of a JS
 * exception thrown during the first render (e.g. a context provider or
 * screen throwing because of missing configuration), which is one of the
 * most likely explanations for an instant close with zero visible error.
 */
import React from 'react'
import { View, Text, ScrollView, TouchableOpacity } from 'react-native'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    // Also surface it in whatever logs ARE reachable (Metro console in dev,
    // or any crash-reporting hook that might be wired up later).
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null })
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#050d1a', paddingTop: 60 }}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ color: '#ff6b6b', fontSize: 18, fontWeight: '800', marginBottom: 12 }}>
              TzCRVS hit a problem
            </Text>
            <Text style={{ color: '#fff', fontSize: 14, marginBottom: 16 }}>
              {String(this.state.error?.message || this.state.error)}
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>
              {this.state.error?.stack ? String(this.state.error.stack) : ''}
            </Text>
            {this.state.errorInfo?.componentStack ? (
              <Text style={{ color: '#64748b', fontSize: 10, fontFamily: 'monospace', marginTop: 12 }}>
                {String(this.state.errorInfo.componentStack)}
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={this.handleReset}
              style={{
                marginTop: 24,
                backgroundColor: '#1eb53a',
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )
    }
    return this.props.children
  }
}
