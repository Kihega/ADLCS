import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  Calendar,
  X,
  CheckCircle2,
  Copy,
  Search,
  User,
  CheckCircle2 as CC,
  Heart,
  Shield,
  Download,
} from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { apiPost, isOnline } from '../../services/syncService'
import { resolveBase } from '../../services/apiResolver'
import { generateMarriagePdf, sharePdf } from '../../services/certificateService'
import type { LocalMarriage } from '../../services/localDb'

// ── Reusable calendar picker (no external packages) ──────────────────────────
function CalPicker({
  visible,
  title,
  maxDate,
  minDate,
  onSelect,
  onClose,
}: {
  visible: boolean
  title: string
  maxDate?: Date
  minDate?: Date
  onSelect: (v: string) => void
  onClose: () => void
}) {
  const { theme: T } = useTheme()
  const curY = new Date().getFullYear()
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const minY = minDate ? minDate.getFullYear() : curY - 120
  const maxY = maxDate ? maxDate.getFullYear() : curY
  const [yr, setYr] = useState(maxY)
  const [mo, setMo] = useState((maxDate ?? new Date()).getMonth() + 1)
  const [dy, setDy] = useState((maxDate ?? new Date()).getDate())
  const daysIn = new Date(yr, mo, 0).getDate()
  const years = Array.from({ length: maxY - minY + 1 }, (_, i) => maxY - i)
  if (!visible) return null
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' }}>
        <View
          style={{
            backgroundColor: T.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: 36,
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              backgroundColor: T.border,
              borderRadius: 2,
              alignSelf: 'center',
              marginBottom: 16,
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Calendar size={15} color="#22d3ee" />
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '800', color: T.text }}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={17} color={T.textSub} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, height: 190 }}>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 10, color: T.textDim, textAlign: 'center', marginBottom: 4 }}
              >
                Day
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {Array.from({ length: daysIn }, (_, i) => i + 1).map((d) => (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setDy(d)}
                    style={{
                      paddingVertical: 9,
                      alignItems: 'center',
                      borderRadius: 8,
                      marginVertical: 2,
                      backgroundColor: d === dy ? '#0891b230' : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: d === dy ? '#22d3ee' : T.textSub,
                        fontWeight: d === dy ? '800' : '400',
                      }}
                    >
                      {String(d).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ flex: 2 }}>
              <Text
                style={{ fontSize: 10, color: T.textDim, textAlign: 'center', marginBottom: 4 }}
              >
                Month
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {MONTHS.map((name, i) => (
                  <TouchableOpacity
                    key={name}
                    onPress={() => setMo(i + 1)}
                    style={{
                      paddingVertical: 9,
                      alignItems: 'center',
                      borderRadius: 8,
                      marginVertical: 2,
                      backgroundColor: i + 1 === mo ? '#0891b230' : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: i + 1 === mo ? '#22d3ee' : T.textSub,
                        fontWeight: i + 1 === mo ? '800' : '400',
                      }}
                    >
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ flex: 1.5 }}>
              <Text
                style={{ fontSize: 10, color: T.textDim, textAlign: 'center', marginBottom: 4 }}
              >
                Year
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {years.map((y) => (
                  <TouchableOpacity
                    key={y}
                    onPress={() => setYr(y)}
                    style={{
                      paddingVertical: 9,
                      alignItems: 'center',
                      borderRadius: 8,
                      marginVertical: 2,
                      backgroundColor: y === yr ? '#0891b230' : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: y === yr ? '#22d3ee' : T.textSub,
                        fontWeight: y === yr ? '800' : '400',
                      }}
                    >
                      {y}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: T.border,
                borderRadius: 12,
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: T.textSub, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                onSelect(`${String(dy).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${yr}`)
              }
              style={{
                flex: 2,
                backgroundColor: '#0891b2',
                borderRadius: 12,
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ── Stable field (module-level — keyboard stays open) ─────────────────────────
const SField = React.memo(function SField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  bg,
  bc,
  tc,
  dc,
  required = false,
}: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: dc, marginBottom: 6 }}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        style={[
          {
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 14,
            backgroundColor: bg,
            borderColor: bc,
            color: tc,
          },
          multiline && { height: 80, paddingTop: 12, textAlignVertical: 'top' },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? ''}
        placeholderTextColor={dc}
        multiline={multiline}
        returnKeyType={multiline ? 'default' : 'next'}
        blurOnSubmit={false}
      />
    </View>
  )
})

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, vis }: { msg: string; vis: boolean }) {
  const op = useRef(new Animated.Value(0)).current
  // LINTFIX-5: disable comment moved to sit directly above the dependency
  // array line, where eslint-plugin-react-hooks actually attaches the warning
  // (it was previously above `useEffect(`, one line too early to suppress it).
  useEffect(() => {
    if (vis)
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1600),
        Animated.timing(op, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vis])
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: 100,
        alignSelf: 'center',
        backgroundColor: TZ.green,
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        opacity: op,
        elevation: 9,
      }}
    >
      <CheckCircle2 size={14} color="#fff" />
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{msg}</Text>
    </Animated.View>
  )
}

// ── Screen header ─────────────────────────────────────────────────────────────
function ScreenHeader({
  title,
  sub,
  icon,
  iconBg,
  onBack,
}: {
  title: string
  sub: string
  icon: React.ReactNode
  iconBg: string
  onBack: () => void
}) {
  const { theme: T } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        backgroundColor: T.card,
        borderBottomColor: T.border,
      }}
    >
      <TouchableOpacity
        onPress={onBack}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArrowLeft size={20} color={T.text} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: T.text }}>{title}</Text>
        <Text style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>{sub}</Text>
      </View>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
    </View>
  )
}

type VStack = { VillageHome: undefined; RegisterMarriage: undefined }
type Props = { navigation: NativeStackNavigationProp<VStack, 'RegisterMarriage'> }

async function lookupCitizen(nid: string, token: string | null): Promise<any | null> {
  if (!token || !isOnline()) return null
  try {
    const base = await resolveBase()
    const r = await fetch(`${base}/officer/citizen-lookup?q=${encodeURIComponent(nid)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: (() => {
        const __c = new AbortController()
        setTimeout(() => __c.abort(), 5000)
        return __c.signal
      })(),
    })
    const j = await r.json()
    return j.success ? j.data : null
  } catch {
    return null
  }
}

function genCertNo() {
  return `TZ-MAR-${Date.now().toString().slice(-8)} M`
}

export default function RegisterMarriageScreen({ navigation }: Props) {
  const { theme: T } = useTheme()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [husbandNid, setHusbandNid] = useState('')
  const [husbandData, setHusbandData] = useState<any>(null)
  const [husbandLoading, setHusbandLoading] = useState(false)
  const [wifeNid, setWifeNid] = useState('')
  const [wifeData, setWifeData] = useState<any>(null)
  const [wifeLoading, setWifeLoading] = useState(false)
  const [marriageDate, setMarriageDate] = useState('')
  const [showCal, setShowCal] = useState(false)
  const [marriageType, setMarriageType] = useState<'civil' | 'religious' | 'customary'>('civil')
  const [witness1, setWitness1] = useState('')
  const [witness2, setWitness2] = useState('')
  const [bridePrice, setBridePrice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [certNo, setCertNo] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [toast, setToast] = useState('')
  const [toastVis, setToastVis] = useState(false)

  const MTYPES = [
    { val: 'civil', label: 'Civil Marriage', color: '#0891b2' },
    { val: 'religious', label: 'Religious Marriage', color: '#7c3aed' },
    { val: 'customary', label: 'Customary Marriage', color: '#f97316' },
  ] as const

  const searchParty = async (nid: string, party: 'husband' | 'wife') => {
    const setLoading = party === 'husband' ? setHusbandLoading : setWifeLoading
    const setData = party === 'husband' ? setHusbandData : setWifeData
    setLoading(true)
    const token = await AsyncStorage.getItem('tzcrvs_access_token')
    const found = await lookupCitizen(nid.trim(), token)
    if (found) setData(found)
    else Alert.alert('Not Found', 'Citizen not found. Enter name manually or check NID.')
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!marriageDate) {
      Alert.alert('Required', 'Select the marriage date.')
      return
    }
    if (!witness1.trim()) {
      Alert.alert('Required', 'Enter at least one witness name.')
      return
    }
    setSubmitting(true)
    try {
      const cert = genCertNo()
      setCertNo(cert)
      const token = await AsyncStorage.getItem('tzcrvs_access_token')
      if (isOnline() && token) {
        try {
          await apiPost('/village/marriage', {
            husbandNid,
            husbandName: husbandData
              ? `${husbandData.firstName} ${husbandData.surname}`
              : husbandNid,
            wifeNid,
            wifeName: wifeData ? `${wifeData.firstName} ${wifeData.surname}` : wifeNid,
            marriageDate,
            marriageType,
            witness1: witness1.trim(),
            witness2: witness2.trim(),
            bridePrice: bridePrice.trim(),
            certNo: cert,
          })
        } catch {}
      }
      setStep(4)
    } catch {
      Alert.alert('Error', 'Submission failed.')
    }
    setSubmitting(false)
  }

  // ── Download/print the marriage certificate (mirrors the birth/death flow) ──
  const handleDownload = async () => {
    if (!certNo) return
    setDownloading(true)
    try {
      const marriage: LocalMarriage = {
        id: certNo,
        certNo,
        husbandName: husbandData
          ? `${husbandData.firstName} ${husbandData.surname}`
          : husbandNid,
        husbandNid,
        wifeName: wifeData ? `${wifeData.firstName} ${wifeData.surname}` : wifeNid,
        wifeNid,
        marriageDate,
        marriagePlace: 'Village Registration Office',
        marriageType,
        witness1Name: witness1.trim(),
        witness2Name: witness2.trim(),
        officerName: 'Village Registration Officer',
        registeredAt: new Date().toISOString(),
      }
      const path = await generateMarriagePdf(marriage)
      await sharePdf(path)
    } catch {
      Alert.alert('Download Failed', 'Could not generate the certificate. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const copy = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text)
    setToast(`${label} copied`)
    setToastVis(true)
    setTimeout(() => setToastVis(false), 2400)
  }

  const NidSearch = ({ label, nid, setNid, data, loading, party, color }: any) => (
    <View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>
        {label} National ID *
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <TextInput
          style={{
            flex: 1,
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 14,
            backgroundColor: T.card2,
            borderColor: T.border,
            color: T.text,
          }}
          value={nid}
          onChangeText={setNid}
          placeholder="YYYYMMDD-LLLLL-SSSSS-CC"
          placeholderTextColor={T.textDim}
          returnKeyType="search"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={{
            backgroundColor: color,
            borderRadius: 10,
            paddingHorizontal: 14,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: nid.trim().length >= 5 ? 1 : 0.4,
          }}
          onPress={() => searchParty(nid, party)}
          disabled={nid.trim().length < 5 || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Search size={16} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
      {data && (
        <View
          style={{
            borderWidth: 1,
            borderRadius: 10,
            borderColor: `${color}40`,
            backgroundColor: `${color}10`,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <User size={14} color={color} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: T.text }}>
              {data.firstName} {data.middleName ?? ''} {data.surname}
            </Text>
            <Text style={{ fontSize: 11, color: T.textSub }}>
              {data.nationalId} · {data.gender?.toUpperCase()}
            </Text>
          </View>
          <CC size={16} color={TZ.green} />
        </View>
      )}
    </View>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader
          title="Register Marriage"
          sub="Civil Registration Act (Cap 29)"
          icon={<Heart size={18} color="#e11d48" />}
          iconBg="#e11d4818"
          onBack={() =>
            step > 1 && step < 4 ? setStep((s) => (s - 1) as any) : navigation.goBack()
          }
        />

        {/* Step indicator */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: T.card,
            borderBottomWidth: 1,
            borderBottomColor: T.border,
          }}
        >
          {['Husband', 'Wife', 'Details', 'Certificate'].map((lbl, i) => (
            <View key={lbl} style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 3,
                  backgroundColor: step > i + 1 ? TZ.green : step === i + 1 ? '#e11d48' : T.border,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{i + 1}</Text>
              </View>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: '600',
                  color: step >= i + 1 ? T.text : T.textDim,
                }}
              >
                {lbl}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && (
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>
                Husband Identification
              </Text>
              <NidSearch
                label="Husband"
                nid={husbandNid}
                setNid={setHusbandNid}
                data={husbandData}
                loading={husbandLoading}
                party="husband"
                color="#0891b2"
              />
              {!husbandData && (
                <SField
                  label="Or enter name manually"
                  value={husbandNid}
                  onChange={setHusbandNid}
                  placeholder="Full name if NID unavailable"
                  bg={T.card2}
                  bc={T.border}
                  tc={T.text}
                  dc={T.textDim}
                />
              )}
              <TouchableOpacity
                style={{
                  backgroundColor: '#e11d48',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: husbandNid.trim() ? 1 : 0.4,
                }}
                onPress={() => setStep(2)}
                disabled={!husbandNid.trim()}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Continue →</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>
                Wife Identification
              </Text>
              <NidSearch
                label="Wife"
                nid={wifeNid}
                setNid={setWifeNid}
                data={wifeData}
                loading={wifeLoading}
                party="wife"
                color="#7c3aed"
              />
              {!wifeData && (
                <SField
                  label="Or enter name manually"
                  value={wifeNid}
                  onChange={setWifeNid}
                  placeholder="Full name if NID unavailable"
                  bg={T.card2}
                  bc={T.border}
                  tc={T.text}
                  dc={T.textDim}
                />
              )}
              <TouchableOpacity
                style={{
                  backgroundColor: '#e11d48',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: wifeNid.trim() ? 1 : 0.4,
                }}
                onPress={() => setStep(3)}
                disabled={!wifeNid.trim()}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Continue →</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 3 && (
            <View style={{ gap: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: T.text }}>
                Marriage Details
              </Text>
              <View>
                <Text
                  style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}
                >
                  Date of Marriage *
                </Text>
                <TouchableOpacity
                  style={{
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    backgroundColor: T.card2,
                    borderColor: T.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onPress={() => setShowCal(true)}
                >
                  <Text style={{ color: marriageDate ? T.text : T.textDim, fontSize: 14 }}>
                    {marriageDate || 'Select date'}
                  </Text>
                  <Calendar size={16} color={T.textDim} />
                </TouchableOpacity>
              </View>
              <View>
                <Text
                  style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 8 }}
                >
                  Type of Marriage *
                </Text>
                <View style={{ gap: 8 }}>
                  {MTYPES.map((mt) => (
                    <TouchableOpacity
                      key={mt.val}
                      onPress={() => setMarriageType(mt.val)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        borderWidth: 1.5,
                        borderRadius: 12,
                        padding: 14,
                        borderColor: marriageType === mt.val ? mt.color : T.border,
                        backgroundColor: marriageType === mt.val ? `${mt.color}15` : T.card2,
                      }}
                    >
                      <View
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          borderWidth: 2,
                          borderColor: mt.color,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {marriageType === mt.val && (
                          <View
                            style={{
                              width: 9,
                              height: 9,
                              borderRadius: 4.5,
                              backgroundColor: mt.color,
                            }}
                          />
                        )}
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '600',
                          color: marriageType === mt.val ? mt.color : T.text,
                        }}
                      >
                        {mt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <SField
                label="Witness 1 Full Name"
                value={witness1}
                onChange={setWitness1}
                placeholder="Name of first witness"
                required
                bg={T.card2}
                bc={T.border}
                tc={T.text}
                dc={T.textDim}
              />
              <SField
                label="Witness 2 Full Name"
                value={witness2}
                onChange={setWitness2}
                placeholder="Name of second witness (optional)"
                bg={T.card2}
                bc={T.border}
                tc={T.text}
                dc={T.textDim}
              />
              <SField
                label="Bride Price / Mahari"
                value={bridePrice}
                onChange={setBridePrice}
                placeholder="e.g. 5 cattle, TZS 500,000 (optional)"
                bg={T.card2}
                bc={T.border}
                tc={T.text}
                dc={T.textDim}
              />
              <TouchableOpacity
                style={{
                  backgroundColor: '#e11d48',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: submitting ? 0.7 : 1,
                }}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                    Register Marriage
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {step === 4 && (
            <View style={{ alignItems: 'center', gap: 14 }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  backgroundColor: '#e11d4818',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Heart size={40} color="#e11d48" />
              </View>
              <Text style={{ fontSize: 22, fontWeight: '900', color: T.text }}>
                Marriage Registered!
              </Text>
              <Text style={{ fontSize: 13, color: T.textSub, textAlign: 'center', lineHeight: 20 }}>
                {husbandData ? `${husbandData.firstName} ${husbandData.surname}` : husbandNid} &{' '}
                {wifeData ? `${wifeData.firstName} ${wifeData.surname}` : wifeNid}
              </Text>
              <View
                style={{
                  width: '100%',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#e11d4850',
                  backgroundColor: '#e11d4810',
                  padding: 14,
                }}
              >
                <Text style={{ fontSize: 11, color: T.textDim, marginBottom: 4 }}>
                  MARRIAGE CERTIFICATE NUMBER
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '900',
                      color: '#e11d48',
                      flex: 1,
                      letterSpacing: 1,
                    }}
                  >
                    {certNo}
                  </Text>
                  <TouchableOpacity
                    onPress={() => copy(certNo, 'Certificate number')}
                    style={{ padding: 4 }}
                  >
                    <Copy size={15} color="#e11d48" />
                  </TouchableOpacity>
                </View>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  width: '100%',
                  backgroundColor: '#0891b212',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Shield size={13} color="#0891b2" />
                <Text style={{ fontSize: 10, color: T.textSub, flex: 1 }}>
                  This is a copy only. To be valid for official Government use, the certificate
                  must be signed and stamped by the Registration Insolvency and Trusteeship
                  Agency (RITA).
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  backgroundColor: '#e11d4818',
                  borderWidth: 1,
                  borderColor: '#e11d4850',
                  borderRadius: 12,
                  paddingVertical: 13,
                  width: '100%',
                }}
                onPress={handleDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#e11d48" />
                ) : (
                  <Download size={16} color="#e11d48" />
                )}
                <Text style={{ color: '#e11d48', fontWeight: '800', fontSize: 14 }}>
                  {downloading ? 'Generating…' : 'Download Certificate'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#e11d48',
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: 'center',
                  width: '100%',
                }}
                onPress={() => navigation.goBack()}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                  Back to Dashboard
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
        <CalPicker
          visible={showCal}
          title="Date of Marriage"
          maxDate={new Date()}
          onSelect={(d) => {
            setMarriageDate(d)
            setShowCal(false)
          }}
          onClose={() => setShowCal(false)}
        />
      </KeyboardAvoidingView>
      <Toast msg={toast} vis={toastVis} />
    </SafeAreaView>
  )
}
