/**
 * ConfirmIncomingMigrationScreen.tsx — Village Officer: confirm an INCOMING
 * citizen migration using their NIN + migration token
 *
 * PATCH-MIGFLOW-2026: the primary way a destination village officer
 * finalises a migration — no need to browse a pending list. The citizen who
 * has physically arrived presents:
 *   1. Their NIN (National ID) — used for demographic lookup/verification.
 *   2. The migration token the SOURCE village officer gave them when they
 *      issued the migration — valid for exactly ONE WEEK from issuance.
 *
 * POST /village/migration/confirm { nationalId, migrationToken }
 *   - success -> citizen's currentVillageId now points at this village.
 *   - expired -> token's one-week window has passed; citizen must go back
 *     to the source village officer and have the migration re-issued.
 *   - otherwise -> wrong village, no match, or already actioned.
 */
import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Repeat, CheckCircle2, User, Search } from 'lucide-react-native' // PATCH-BID-LOOKUP-2026
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from '../../context/ThemeContext'
import { apiPost } from '../../services/syncService'

type VStack = { VillageHome: undefined; ConfirmIncomingMigration: undefined }
type Props = { navigation: NativeStackNavigationProp<VStack, 'ConfirmIncomingMigration'> }

const G = '#1eb53a'

export default function ConfirmIncomingMigrationScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  // PATCH-BID-LOOKUP-2026: confirm by Birth ID (BID), not NIN — a citizen
  // only ever has a NIN because they already had a BID.
  const [birthId, setBirthId] = useState('')
  const [migrationToken, setMigrationToken] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = birthId.trim().length > 0 && migrationToken.trim().length > 0 && !submitting

  const handleConfirm = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const json = await apiPost('/village/migration/confirm', {
        birthId: birthId.trim(),
        migrationToken: migrationToken.trim(),
      })
      if (json.success) {
        Alert.alert('Migration Confirmed', json.message || 'The citizen is now registered in your village.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ])
      } else {
        Alert.alert('Could Not Confirm', json.message || 'Please check the NIN and token and try again.')
      }
    } catch (err: any) {
      Alert.alert('Could Not Confirm', err?.message || 'Please check the NIN and token and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: T.border,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <Repeat size={18} color={G} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Incoming Migration</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
          <Text style={{ fontSize: 12, color: T.textSub }}>
            Ask the citizen for their Birth ID (BID) and the migration token given to them by their
            previous village officer, then confirm below. This is only valid within one week of the
            token being issued.
          </Text>

          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>
              Citizen Birth ID (BID)
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: T.card2,
                borderWidth: 1,
                borderColor: T.border,
                borderRadius: 10,
                paddingHorizontal: 12,
              }}
            >
              <User size={15} color={T.textDim} />
              <TextInput
                style={{ flex: 1, paddingVertical: 12, color: T.text, fontSize: 14 }}
                value={birthId}
                onChangeText={(v) => setBirthId(v.toUpperCase())}
                placeholder="e.g. BID-7F3K9QXTZ2"
                placeholderTextColor={T.textDim}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>
              Migration Token
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: T.card2,
                borderWidth: 1,
                borderColor: T.border,
                borderRadius: 10,
                paddingHorizontal: 12,
              }}
            >
              <Search size={15} color={T.textDim} />
              <TextInput
                style={{ flex: 1, paddingVertical: 12, color: T.text, fontSize: 14, letterSpacing: 1 }}
                value={migrationToken}
                onChangeText={(v) => setMigrationToken(v.toUpperCase())}
                placeholder="e.g. TZM-7K9P2Q"
                placeholderTextColor={T.textDim}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <TouchableOpacity
            disabled={!canSubmit}
            onPress={handleConfirm}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: canSubmit ? G : T.border,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <CheckCircle2 size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Confirm Migration</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
