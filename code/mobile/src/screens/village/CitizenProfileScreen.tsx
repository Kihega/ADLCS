/**
 * CitizenProfileScreen.tsx — Village Officer · Citizen Profile Lookup
 *
 * Flow: officer enters a Birth ID (BID) or NIN → search → backend looks the citizen up in
 * the officer's area (GET /village/citizen-lookup) → ONE pop-up card shows everything:
 * identity, full location hierarchy (region › district › ward › village/street), status.
 * The card is for DISPLAY ONLY (no alerts, no certificate button): it scrolls when long
 * and is closed with OK.
 * A failed search shows the usual "Search failed" card with the reason.
 */
import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { useErrorDialog } from '../../components/AppDialog'
import BidCopy from '../../components/BidCopy'
import { KeyboardAwareScrollView, KeyboardSafeView } from '../../components/KeyboardAware'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  Search,
  User,
  Heart,
  HeartCrack,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { useResponsive } from '../../utils/responsive'
import { apiGet } from '../../services/syncService'
import { isValidId, ID_HELP } from '../../services/identityLookup'

type VStack = { VillageHome: undefined; CitizenProfile: undefined }
type Props = { navigation: NativeStackNavigationProp<VStack, 'CitizenProfile'> }

interface CitizenProfile {
  id: string | null
  birthId?: string | null
  nationalId: string | null
  firstName: string
  middleName: string | null
  surname: string
  fullName?: string
  gender: string
  dateOfBirth: string
  age: number
  vitalStatus: string
  maritalStatus: string
  photoUrl: string | null
  idCardIssued: string | null
  idCardExpires: string | null
  streetName: string | null
  houseRegNumber: string | null
  educationLevel: string
  registeredAt: string
  ninCertificateIssued: boolean
  hasBirthRecord?: boolean
  source?: string
  region?: string | null
  district?: string | null
  ward?: string | null
  village?: string | null
  villageName: string | null
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

function titleCase(s?: string | null): string {
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}

export default function CitizenProfileScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const { contentMaxWidth } = useResponsive()
  const G = TZ.blue

  const [nin, setNin] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  useErrorDialog(error, () => setError(''), 'Search failed')
  const [profile, setProfile] = useState<CitizenProfile | null>(null)
  const [cardOpen, setCardOpen] = useState(false)

  const dismissCard = () => {
    setCardOpen(false)
    setProfile(null)
  }

  const handleSearch = async () => {
    const value = nin.trim()
    if (!value) {
      setError('Enter a citizen Birth ID (BID) or NIN to search.')
      return
    }
    if (!isValidId(value)) {
      setProfile(null)
      setError(ID_HELP)
      return
    }
    setSearching(true)
    setError('')
    setProfile(null)
    setCardOpen(false)
    try {
      const json = await apiGet(`/village/citizen-lookup?q=${encodeURIComponent(value.toUpperCase())}`)
      if (json.success && json.data) {
        setProfile(json.data)
        setCardOpen(true)
      } else {
        setError(json.message ?? 'Citizen not found.')
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not search right now. Check your connection and try again.')
    } finally {
      setSearching(false)
    }
  }

  const isAlive = profile?.vitalStatus?.toLowerCase() === 'alive'
  const fullName = profile
    ? profile.fullName || [profile.firstName, profile.middleName, profile.surname].filter(Boolean).join(' ')
    : ''

  const Section = ({ title }: { title: string }) => (
    <Text style={[cs.section, { color: G }]}>{title}</Text>
  )
  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={cs.row}>
      <Text style={[cs.rowLabel, { color: T.textSub }]}>{label}</Text>
      <Text style={[cs.rowValue, { color: T.text }]}>{value}</Text>
    </View>
  )

  const streetHouse = [profile?.streetName, profile?.houseRegNumber].filter(Boolean).join(' / ')

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 12,
          gap: 10,
          backgroundColor: G,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff' }}>Citizen Profile</Text>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>
            Search citizens registered in your village
          </Text>
        </View>
      </View>

      <KeyboardSafeView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 60,
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>
            Citizen Birth ID (BID) or NIN *
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: T.card2,
                borderWidth: 1,
                borderColor: error ? T.danger : T.border,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: T.text,
                fontSize: 14,
                letterSpacing: 0.5,
              }}
              value={nin}
              onChangeText={(t) => {
                setNin(t)
                setError('')
              }}
              placeholder="BID-XXXXXXXXXX or 20-digit NIN"
              placeholderTextColor={T.textDim}
              autoCapitalize="characters"
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity
              onPress={handleSearch}
              disabled={searching || !nin.trim()}
              style={{
                borderRadius: 10,
                paddingHorizontal: 16,
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 76,
                backgroundColor: nin.trim() ? G : T.card2,
                opacity: searching ? 0.6 : 1,
              }}
            >
              {searching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Search size={18} color={nin.trim() ? '#fff' : T.textDim} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
      </KeyboardSafeView>

      {/* ── Result: ONE scrollable card with an OK button ───────────────── */}
      <Modal
        visible={!!profile && cardOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismissCard}
      >
        <View style={cs.backdrop}>
          <View style={[cs.card, { backgroundColor: T.card, borderColor: T.border }]}>
            {profile && (
              <>
                <View style={cs.head}>
                  <View style={[cs.avatar, { backgroundColor: `${G}25` }]}>
                    <User size={26} color={G} />
                  </View>
                  <Text style={[cs.name, { color: T.text }]}>{fullName}</Text>
                  <View style={{ marginTop: 4 }}>
                    <BidCopy bid={profile.birthId} size={12} />
                  </View>
                  <View
                    style={[
                      cs.badge,
                      { backgroundColor: isAlive ? `${TZ.green}20` : '#dc262620' },
                    ]}
                  >
                    {isAlive ? (
                      <Heart size={12} color={TZ.green} />
                    ) : (
                      <HeartCrack size={12} color="#dc2626" />
                    )}
                    <Text style={{ fontSize: 11, fontWeight: '700', color: isAlive ? TZ.green : '#dc2626' }}>
                      {titleCase(profile.vitalStatus)}
                    </Text>
                  </View>
                </View>

                <ScrollView
                  style={{ flexShrink: 1, alignSelf: 'stretch' }}
                  contentContainerStyle={{ paddingBottom: 4 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  <Section title="IDENTITY" />
                  <Row label="Full name" value={fullName || '—'} />
                  <Row label="Gender" value={titleCase(profile.gender)} />
                  <Row
                    label="Date of birth"
                    value={`${fmtDate(profile.dateOfBirth)} (Age ${profile.age ?? '—'})`}
                  />
                  <Row label="Marital status" value={titleCase(profile.maritalStatus)} />
                  <Row label="Education" value={titleCase(profile.educationLevel)} />
                  <Row label="NIN" value={profile.nationalId || 'Not issued'} />

                  <Section title="LOCATION" />
                  <Row label="Region" value={profile.region || '—'} />
                  <Row label="District" value={profile.district || '—'} />
                  <Row label="Ward" value={profile.ward || '—'} />
                  <Row label="Village / Street" value={profile.village || profile.villageName || '—'} />
                  {!!streetHouse && <Row label="Street / House No." value={streetHouse} />}

                  <Section title="REGISTRATION" />
                  <Row label="Registered on" value={fmtDate(profile.registeredAt)} />
                  <Row
                    label="Record"
                    value={profile.source === 'birth' ? 'Hospital birth record' : 'Village registration'}
                  />

                </ScrollView>

                <TouchableOpacity style={[cs.ok, { backgroundColor: T.primary }]} onPress={dismissCard}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>OK</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const cs = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '88%',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  head: { alignItems: 'center', marginBottom: 6 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 8,
  },
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 14, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  rowLabel: { fontSize: 12, flexShrink: 0 },
  rowValue: { fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
  ok: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
