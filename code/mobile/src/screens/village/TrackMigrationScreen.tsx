/**
 * TrackMigrationScreen.tsx — Village Officer: request a citizen migration
 *
 * Step 1 — enter NIN, Birth ID (BID), or full name to look the citizen up.
 *          Lookup is STRICTLY scoped server-side to the officer's own
 *          village (GET /village/citizen-lookup?q=...).
 * Step 2 — pick the DESTINATION region/district/ward/village-or-street via
 *          the strict dropdown GeoCascadePicker (no manual entry — only
 *          locations already in the DB are selectable), plus an optional
 *          reason. We never ask for the citizen's origin here: that is
 *          already on file (set at birth/citizen registration).
 * Submit — POST /village/migration creates a pending request addressed to
 *          the destination village's officer, who must approve it before
 *          the citizen's record actually moves.
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
import { ArrowLeft, Search, User, Repeat, CheckCircle2, AlertTriangle } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { apiGet, apiPost } from '../../services/syncService'
import GeoCascadePicker, {
  GeoSelection,
  emptyGeoSelection,
  isGeoSelectionComplete,
} from '../../components/GeoCascadePicker'

type VStack = { VillageHome: undefined; TrackMigration: undefined }
type Props = { navigation: NativeStackNavigationProp<VStack, 'TrackMigration'> }

const G = '#1eb53a'

interface CitizenHit {
  id: string
  fullName: string
  nationalId: string | null
  gender: string
  dateOfBirth: string
  currentVillageId: number | null
}

export default function TrackMigrationScreen({ navigation }: Props) {
  const { theme: T } = useTheme()

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [citizen, setCitizen] = useState<CitizenHit | null>(null)
  const [notFoundMsg, setNotFoundMsg] = useState('')

  const [destination, setDestination] = useState<GeoSelection>(emptyGeoSelection())
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSearch = async () => {
    const term = query.trim()
    if (!term) return
    setSearching(true)
    setNotFoundMsg('')
    setCitizen(null)
    try {
      const json = await apiGet(`/village/citizen-lookup?q=${encodeURIComponent(term)}`)
      if (json.success && json.data) {
        setCitizen({
          id: json.data.id,
          fullName: json.data.fullName,
          nationalId: json.data.nationalId,
          gender: json.data.gender,
          dateOfBirth: json.data.dateOfBirth,
          currentVillageId: json.data.currentVillageId,
        })
      } else {
        setNotFoundMsg(json.message || 'No citizen found in your village matching that NIN, Birth ID, or name.')
      }
    } catch (err: any) {
      setNotFoundMsg(err?.message || 'Lookup failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  const reset = () => {
    setCitizen(null)
    setQuery('')
    setNotFoundMsg('')
    setDestination(emptyGeoSelection())
    setReason('')
  }

  const handleSubmit = () => {
    if (!citizen || !isGeoSelectionComplete(destination)) return
    if (destination.villageId === citizen.currentVillageId) {
      Alert.alert('Same Location', 'This citizen already lives at the selected destination.')
      return
    }
    Alert.alert(
      'Send Migration Request?',
      `${citizen.fullName} will be requested to migrate to ${destination.villageName}, ${destination.wardName}. ` +
        'The citizen must report in person to the destination officer before this is approved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request',
          onPress: async () => {
            setSubmitting(true)
            try {
              const json = await apiPost('/village/migration', {
                citizenId: citizen.id,
                toVillageId: destination.villageId,
                reason: reason.trim(),
              })
              if (json.success) {
                Alert.alert('Request Sent', json.message || 'Migration request sent successfully.', [
                  { text: 'OK', onPress: () => navigation.goBack() },
                ])
              } else {
                Alert.alert('Could Not Send Request', json.message || 'Please try again.')
              }
            } catch (err: any) {
              Alert.alert('Could Not Send Request', err?.message || 'Please try again.')
            } finally {
              setSubmitting(false)
            }
          },
        },
      ]
    )
  }

  const canSubmit = !!citizen && isGeoSelectionComplete(destination) && !submitting

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
        <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Migrate Citizen</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
          {/* ── Step 1: find the citizen ─────────────────────────────────── */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>
              Step 1 — Find the Citizen
            </Text>
            <Text style={{ fontSize: 11, color: T.textSub }}>
              Enter NIN, Birth ID (BID), or full name. Results are limited to citizens registered
              in your village.
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
                style={{ flex: 1, paddingVertical: 12, color: T.text, fontSize: 14 }}
                value={query}
                onChangeText={(v) => {
                  setQuery(v)
                  setCitizen(null)
                  setNotFoundMsg('')
                }}
                placeholder="NIN, Birth ID, or full name"
                placeholderTextColor={T.textDim}
                autoCapitalize="none"
                onSubmitEditing={handleSearch}
                editable={!citizen}
              />
              {!citizen && (
                <TouchableOpacity
                  onPress={handleSearch}
                  disabled={!query.trim() || searching}
                  style={{
                    backgroundColor: query.trim() ? G : T.border,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 8,
                  }}
                >
                  {searching ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Search</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {notFoundMsg ? (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  alignItems: 'flex-start',
                  backgroundColor: 'rgba(239,68,68,0.10)',
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <AlertTriangle size={14} color="#f87171" />
                <Text style={{ flex: 1, fontSize: 12, color: '#f87171' }}>{notFoundMsg}</Text>
              </View>
            ) : null}

            {citizen ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: `${G}14`,
                  borderWidth: 1,
                  borderColor: `${G}40`,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: `${G}30`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={17} color={G} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>{citizen.fullName}</Text>
                  <Text style={{ fontSize: 10, color: T.textDim }}>
                    {citizen.nationalId || 'No NIN yet'} · {citizen.gender}
                  </Text>
                </View>
                <TouchableOpacity onPress={reset}>
                  <Text style={{ fontSize: 11, color: T.textSub, fontWeight: '700' }}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* ── Step 2: destination + reason ─────────────────────────────── */}
          {citizen ? (
            <View style={{ gap: 14 }}>
              <View style={{ height: 1, backgroundColor: T.border }} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>
                Step 2 — Destination
              </Text>
              <Text style={{ fontSize: 11, color: T.textSub, marginTop: -6 }}>
                Where is {citizen.fullName.split(' ')[0]} moving TO? Only villages/streets already
                in the system can be selected here.
              </Text>

              <GeoCascadePicker
                value={destination}
                onChange={setDestination}
                villageLabel="Destination Village / Street"
                allowManualVillage={false}
              />

              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>
                  Reason (optional)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: T.card2,
                    borderWidth: 1,
                    borderColor: T.border,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: T.text,
                    fontSize: 13,
                    minHeight: 80,
                    textAlignVertical: 'top',
                  }}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="e.g. Marriage, employment, family relocation…"
                  placeholderTextColor={T.textDim}
                  multiline
                />
              </View>

              <TouchableOpacity
                disabled={!canSubmit}
                onPress={handleSubmit}
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
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Send Request</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
