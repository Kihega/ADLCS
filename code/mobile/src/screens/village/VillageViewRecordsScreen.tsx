/**
 * VillageViewRecordsScreen.tsx — Village Officer · All Records
 *
 * Reuses the same list/search/filter pattern as the Hospital Officer's
 * ViewRecordsScreen, backed by GET /village/records (citizens, deaths,
 * marriages this officer registered). The query always reflects the
 * current day/month server-side — there's no local cache to go stale, so
 * the list is effectively "refreshed" every time the screen is opened or
 * pulled-to-refresh, and naturally rolls over at 00:00 because the
 * underlying date-range queries are computed fresh on every request.
 */
import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { ArrowLeft, Search, User, Cross, Heart, FileText } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { useResponsive } from '../../utils/responsive'
import { apiGet } from '../../services/syncService'

type VStack = { VillageHome: undefined; VillageViewRecords: undefined }
type Props = { navigation: NativeStackNavigationProp<VStack, 'VillageViewRecords'> }
type FilterType = 'all' | 'citizens' | 'deaths' | 'marriages'

interface RecordRow {
  id: string
  type: 'citizens' | 'deaths' | 'marriages'
  icon: string
  color: string
  label: string
  sub: string
  date: string
}

const FILTERS: { key: FilterType; label: string; Icon: any }[] = [
  { key: 'all', label: 'All', Icon: FileText },
  { key: 'citizens', label: 'Citizens', Icon: User },
  { key: 'deaths', label: 'Deaths', Icon: Cross },
  { key: 'marriages', label: 'Marriages', Icon: Heart },
]

export default function VillageViewRecordsScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const { contentMaxWidth } = useResponsive()
  const G = TZ.green

  const [filter, setFilter] = useState<FilterType>('all')
  const [query, setQuery] = useState('')
  const [records, setRecords] = useState<RecordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadRecords = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const json = await apiGet('/village/records')
      setRecords(json.success ? json.data : [])
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadRecords()
    }, [loadRecords])
  )

  const q = query.trim().toLowerCase()
  const visible = records.filter((r) => {
    if (filter !== 'all' && r.type !== filter) return false
    if (!q) return true
    return r.label.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q)
  })

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
        <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff' }}>My Village Records</Text>
      </View>

      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 14,
          width: '100%',
          maxWidth: contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: T.card2,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: T.border,
            paddingHorizontal: 12,
          }}
        >
          <Search size={16} color={T.textDim} />
          <TextInput
            style={{ flex: 1, paddingVertical: 10, color: T.text, fontSize: 13 }}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or NIN/cert no."
            placeholderTextColor={T.textDim}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor: active ? G : T.card2,
                }}
              >
                <f.Icon size={12} color={active ? '#fff' : T.textDim} />
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: active ? '#fff' : T.textSub,
                  }}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={G} size="large" />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 40,
            width: '100%',
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                loadRecords(true)
              }}
              tintColor={G}
            />
          }
          ListEmptyComponent={
            <Text
              style={{
                textAlign: 'center',
                color: T.textDim,
                fontSize: 12,
                marginTop: 40,
              }}
            >
              No records found.
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                marginBottom: 8,
                borderRadius: 10,
                backgroundColor: T.card,
                borderWidth: 1,
                borderColor: T.border,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: `${item.color}22`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 15 }}>{item.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }}>{item.label}</Text>
                <Text style={{ fontSize: 11, color: T.textSub, marginTop: 1 }}>{item.sub}</Text>
              </View>
              <Text style={{ fontSize: 10, color: T.textDim }}>{item.date}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}
