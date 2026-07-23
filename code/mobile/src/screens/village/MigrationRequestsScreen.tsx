/**
 * MigrationRequestsScreen.tsx — Village Officer: incoming migration approvals
 *
 * Lists migration requests addressed to THIS officer (their village is the
 * destination) that are still `pending`. IMPORTANT business rule shown to
 * the officer: only approve after the citizen has physically reported to
 * you for verification — the app cannot enforce that step, it can only ask.
 *
 * Approve  -> PATCH /village/migration/:id/respond { action: 'approve' }
 *             finalises the migration; the citizen's record now belongs to
 *             this village.
 * Reject   -> PATCH /village/migration/:id/respond { action: 'reject' }
 */
import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Bell, CheckCircle2, XCircle, MapPin } from 'lucide-react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { apiGet, apiPatch } from '../../services/syncService'

type VStack = { VillageHome: undefined; MigrationRequests: undefined }
type Props = { navigation: NativeStackNavigationProp<VStack, 'MigrationRequests'> }

const G = '#1eb53a'

// PATCH-MIGFLOW-2026: expiryDate/migrationToken surfaced from the backend
// so this legacy list view stays consistent with the new NIN+token flow.
interface IncomingMigration {
  id: string
  reason: string
  requestDate: string
  expiryDate?: string
  migrationToken?: string
  citizenName: string
  nationalId: string | null
  gender: string | null
  fromVillageName: string
  fromWardName: string
  fromDistrictName: string
}

export default function MigrationRequestsScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const [rows, setRows] = useState<IncomingMigration[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const json = await apiGet('/village/migration/incoming')
      setRows(json.success ? json.data || [] : [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  const respond = (row: IncomingMigration, action: 'approve' | 'reject') => {
    if (action === 'approve') {
      Alert.alert(
        'Confirm In-Person Report',
        `Has ${row.citizenName} reported to you in person for verification? Approving finalises their migration into your village.`,
        [
          { text: 'Not Yet', style: 'cancel' },
          { text: 'Yes, Approve', onPress: () => submitResponse(row.id, 'approve') },
        ]
      )
      return
    }
    Alert.alert('Reject Request?', `Reject the migration request for ${row.citizenName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => submitResponse(row.id, 'reject') },
    ])
  }

  const submitResponse = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id)
    try {
      const json = await apiPatch(`/village/migration/${id}/respond`, { action })
      if (json.success) {
        setRows((prev) => prev.filter((r) => r.id !== id))
      } else {
        Alert.alert('Action Failed', json.message || 'Please try again.')
      }
    } catch (err: any) {
      Alert.alert('Action Failed', err?.message || 'Please try again.')
    } finally {
      setBusyId(null)
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
        <Bell size={18} color={G} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Migration Requests</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={{ fontSize: 11, color: T.textDim }}>
          Tip: if the citizen already has their NIN and migration token in hand, use "Incoming Citizen"
          from the Migration menu to confirm instantly instead of waiting for it to appear below.
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={G} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                load(true)
              }}
              tintColor={G}
            />
          }
        >
          {rows.length === 0 && (
            <Text style={{ textAlign: 'center', color: T.textDim, fontSize: 12, paddingVertical: 40 }}>
              No pending migration requests for your village.
            </Text>
          )}

          {rows.map((row) => (
            <View
              key={row.id}
              style={{
                backgroundColor: T.card,
                borderWidth: 1,
                borderColor: T.border,
                borderRadius: 14,
                padding: 14,
                gap: 10,
              }}
            >
              <View>
                <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>{row.citizenName}</Text>
                <Text style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                  {row.nationalId || 'No NIN yet'} · {row.gender ?? '—'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MapPin size={12} color={T.textSub} />
                <Text style={{ fontSize: 11, color: T.textSub, flex: 1 }}>
                  From {row.fromVillageName}, {row.fromWardName}, {row.fromDistrictName}
                </Text>
              </View>

              {row.migrationToken ? (
                <Text style={{ fontSize: 10, color: T.textDim }}>
                  Token: {row.migrationToken}
                  {row.expiryDate ? ` · Valid until ${new Date(row.expiryDate).toLocaleDateString('en-TZ')}` : ''}
                </Text>
              ) : null}

              {row.reason ? (
                <Text style={{ fontSize: 11, color: T.textDim, fontStyle: 'italic' }}>
                  Reason: {row.reason}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  disabled={busyId === row.id}
                  onPress={() => respond(row, 'reject')}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 11,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: 'rgba(239,68,68,0.4)',
                    backgroundColor: 'rgba(239,68,68,0.10)',
                  }}
                >
                  <XCircle size={14} color="#f87171" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#f87171' }}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={busyId === row.id}
                  onPress={() => respond(row, 'approve')}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 11,
                    borderRadius: 10,
                    backgroundColor: G,
                  }}
                >
                  {busyId === row.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <CheckCircle2 size={14} color="#fff" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Approve</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
