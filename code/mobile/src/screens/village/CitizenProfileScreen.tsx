/**
 * CitizenProfileScreen.tsx — Village Officer · Citizen Profile Lookup
 *
 * Flow: officer enters a citizen's NIN → search → backend looks the citizen
 * up SCOPED TO THE OFFICER'S OWN VILLAGE (GET /village/citizen-lookup) → on
 * a hit, an expandable profile card shows full details: name, gender, DOB,
 * marital status, vital (alive/deceased) status, the date the NIN was
 * registered, and whether the NIN certificate/ID card has been issued.
 *
 * Citizens are scoped to a village via `currentVillageId`, which every
 * citizen inherits from the Village Officer who registered them — so this
 * screen can never show a citizen registered in a different village.
 */
import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  Search,
  User,
  Calendar,
  Heart,
  HeartCrack,
  IdCard,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { useResponsive } from '../../utils/responsive'
import { apiGet } from '../../services/syncService'

type VStack = { VillageHome: undefined; CitizenProfile: undefined }
type Props = { navigation: NativeStackNavigationProp<VStack, 'CitizenProfile'> }

interface CitizenProfile {
  id: string
  nationalId: string
  firstName: string
  middleName: string | null
  surname: string
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
  villageName: string | null
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-TZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
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
  const [profile, setProfile] = useState<CitizenProfile | null>(null)
  const [expanded, setExpanded] = useState(true)

  const handleSearch = async () => {
    const value = nin.trim()
    if (!value) {
      setError('Enter a citizen NIN to search.')
      return
    }
    setSearching(true)
    setError('')
    setProfile(null)
    try {
      const json = await apiGet(`/village/citizen-lookup?nationalId=${encodeURIComponent(value)}`)
      if (json.success && json.data) {
        setProfile(json.data)
        setExpanded(true)
      } else {
        setError(json.message ?? 'Citizen not found in your village.')
      }
    } catch (e: any) {
      setError(e?.message ?? 'No citizen with this NIN was found registered in your village.')
    } finally {
      setSearching(false)
    }
  }

  const isAlive = profile?.vitalStatus?.toLowerCase() === 'alive'

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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
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
            Citizen National ID (NIN) *
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: T.card2,
                borderWidth: 1,
                borderColor: error ? '#f87171' : T.border,
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
              placeholder="YYYYMMDD-07031-XXXXX-CC"
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
          {!!error && (
            <Text style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>{error}</Text>
          )}

          {profile && (
            <View
              style={{
                marginTop: 18,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: `${G}40`,
                backgroundColor: T.card,
                overflow: 'hidden',
              }}
            >
              {/* Card header — always visible, tap to expand/collapse */}
              <TouchableOpacity
                onPress={() => setExpanded((v) => !v)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  backgroundColor: `${G}10`,
                }}
              >
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: `${G}25`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={22} color={G} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>
                    {[profile.firstName, profile.middleName, profile.surname]
                      .filter(Boolean)
                      .join(' ')}
                  </Text>
                  <Text style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>
                    {profile.nationalId}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                    backgroundColor: isAlive ? `${TZ.green}20` : '#dc262620',
                  }}
                >
                  {isAlive ? (
                    <Heart size={11} color={TZ.green} />
                  ) : (
                    <HeartCrack size={11} color="#dc2626" />
                  )}
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: isAlive ? TZ.green : '#dc2626',
                    }}
                  >
                    {titleCase(profile.vitalStatus)}
                  </Text>
                </View>
                {expanded ? (
                  <ChevronUp size={16} color={T.textDim} />
                ) : (
                  <ChevronDown size={16} color={T.textDim} />
                )}
              </TouchableOpacity>

              {/* Expandable detail rows */}
              {expanded && (
                <View style={{ padding: 14, gap: 10 }}>
                  {[
                    { icon: Calendar, label: 'Date of Birth', value: `${fmtDate(profile.dateOfBirth)} (Age ${profile.age})` },
                    { icon: User, label: 'Gender', value: titleCase(profile.gender) },
                    { icon: Heart, label: 'Marital Status', value: titleCase(profile.maritalStatus) },
                    { icon: MapPin, label: 'Street / House No.', value: `${profile.streetName ?? '—'} / ${profile.houseRegNumber ?? '—'}` },
                    { icon: Calendar, label: 'NIN Registered On', value: fmtDate(profile.registeredAt) },
                  ].map((row) => (
                    <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <row.icon size={14} color={T.textDim} />
                      <Text style={{ fontSize: 11, color: T.textSub, flex: 1 }}>{row.label}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: T.text }}>{row.value}</Text>
                    </View>
                  ))}

                  <View
                    style={{
                      marginTop: 4,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      padding: 10,
                      borderRadius: 10,
                      backgroundColor: profile.ninCertificateIssued ? `${TZ.green}15` : '#f9731615',
                    }}
                  >
                    {profile.ninCertificateIssued ? (
                      <ShieldCheck size={16} color={TZ.green} />
                    ) : (
                      <ShieldAlert size={16} color="#f97316" />
                    )}
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: profile.ninCertificateIssued ? TZ.green : '#f97316',
                        flex: 1,
                      }}
                    >
                      {profile.ninCertificateIssued
                        ? `NIN certificate / ID card issued${profile.idCardIssued ? ` on ${fmtDate(profile.idCardIssued)}` : ''}`
                        : 'NIN certificate / ID card not yet issued'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <IdCard size={12} color={T.textDim} />
                    <Text style={{ fontSize: 10, color: T.textDim }}>
                      Scoped to {profile.villageName ?? 'your'} village — visible to this officer only
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
