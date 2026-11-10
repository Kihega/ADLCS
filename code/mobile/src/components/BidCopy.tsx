/**
 * BidCopy.tsx - a Birth ID (BID) shown in green with a copy icon.
 * Tap anywhere on it to copy the BID to the clipboard (icon turns into a tick
 * for a moment). Renders nothing when there is no BID.
 */
import React, { useEffect, useRef, useState } from 'react'
import { Text, TouchableOpacity } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Check, Copy } from 'lucide-react-native'
import { TZ } from '../context/ThemeContext'

export default function BidCopy({ bid, size = 10 }: { bid?: string | null; size?: number }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  if (!bid) return null

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(bid)
    } catch {
      return
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <TouchableOpacity
      onPress={onCopy}
      activeOpacity={0.6}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={`Copy Birth ID ${bid}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
    >
      <Text style={{ fontSize: size, fontWeight: '800', color: TZ.green, letterSpacing: 0.3 }}>
        {bid}
      </Text>
      {copied ? (
        <Check size={size + 3} color={TZ.green} />
      ) : (
        <Copy size={size + 3} color={TZ.green} />
      )}
    </TouchableOpacity>
  )
}
