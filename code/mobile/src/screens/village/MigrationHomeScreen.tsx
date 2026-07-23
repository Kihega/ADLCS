/**
 * MigrationHomeScreen.tsx — Village Officer: choose migration direction
 *
 * PATCH-MIGFLOW-2026: first screen after tapping "Migrate" on the Village
 * Officer home screen. Migration has two shapes that need two different
 * screens/flows, so we ask up front instead of cramming both into one form:
 *
 *  Outgoing Citizen -> TrackMigrationScreen (existing "Migrate Citizen"
 *    flow): officer looks up a resident of THEIR OWN village and sends a
 *    migration request to the destination village. On success the system
 *    generates a migration token valid for ONE WEEK, which the officer
 *    gives to the citizen.
 *
 *  Incoming Citizen -> ConfirmIncomingMigrationScreen: officer asks the
 *    arriving citizen for their NIN (for demographic lookup) and the
 *    migration token issued by the source village, and confirms the move —
 *    finalising it immediately. If the one-week window has passed, the
 *    token is rejected and the citizen must be sent back to the source
 *    village officer to request a fresh one.
 */
import React from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Repeat, User, Bell, ChevronRight } from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from '../../context/ThemeContext'

type VStack = {
  VillageHome: undefined
  MigrationHome: undefined
  TrackMigration: undefined
  ConfirmIncomingMigration: undefined
  MigrationRequests: undefined
}
type Props = { navigation: NativeStackNavigationProp<VStack, 'MigrationHome'> }

const G = '#1eb53a'

function OptionCard({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  onPress: () => void
}) {
  const { theme: T } = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: T.card,
        borderWidth: 1,
        borderColor: T.border,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          backgroundColor: `${G}22`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>{title}</Text>
        <Text style={{ fontSize: 11, color: T.textSub, marginTop: 3 }}>{sub}</Text>
      </View>
      <ChevronRight size={18} color={T.textDim} />
    </TouchableOpacity>
  )
}

export default function MigrationHomeScreen({ navigation }: Props) {
  const { theme: T } = useTheme()

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
        <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>Migration</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Text style={{ fontSize: 12, color: T.textSub }}>
          Is this citizen leaving your village, or arriving into it?
        </Text>

        <OptionCard
          icon={<Repeat size={20} color={G} />}
          title="Outgoing Citizen"
          sub="A resident of your village is moving to another village/street. Sends a migration request and issues a one-week token."
          onPress={() => navigation.navigate('TrackMigration')}
        />

        <OptionCard
          icon={<User size={20} color={G} />}
          title="Incoming Citizen"
          sub="A citizen has arrived from another village. Confirm using their NIN and migration token (valid one week)."
          onPress={() => navigation.navigate('ConfirmIncomingMigration')}
        />

        <View style={{ height: 1, backgroundColor: T.border, marginVertical: 4 }} />

        <OptionCard
          icon={<Bell size={20} color={G} />}
          title="Pending Requests Inbox"
          sub="Browse incoming migration requests addressed to your village and approve/reject them the traditional way."
          onPress={() => navigation.navigate('MigrationRequests')}
        />
      </ScrollView>
    </SafeAreaView>
  )
}
