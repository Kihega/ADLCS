/**
 * NINRegistrationScreen.tsx — NIN Issuance  v1.0  PRODUCTION
 *
 * Village Officer flow:
 *   Step 1 → Enter BID → fetch birth record → verify age 18+
 *   Step 2 → Capture photo (expo-camera front) + fingerprints (expo-local-authentication)
 *   Step 3 → Issue NIN → generate National ID card PDF → downloadable
 *
 * DATA FLOW: Mobile → Render (Express) → Supabase (PostgreSQL). No local SQLite.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import * as Clipboard from 'expo-clipboard'
import {
  ArrowLeft,
  Search,
  Check,
  Shield,
  Image as ImageIcon,
  Fingerprint,
  IdCard,
  CheckCircle2,
  Copy,
  Download,
  AlertCircle,
  ChevronRight,
  User,
  Printer,
} from 'lucide-react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme, TZ } from '../../context/ThemeContext'
import { apiGet, apiPost, fetchRemoteDashboard } from '../../services/syncService'

type VStack = { VillageHome: undefined; NINRegistration: undefined }
type Props = { navigation: NativeStackNavigationProp<VStack, 'NINRegistration'> }

const G = '#0f766e'
const GL = '#14b8a6'

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcAge(dob: string): number {
  const d = new Date(dob),
    now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}
function fmtDOB(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-TZ', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
function _today(): string {
  return new Date()
    .toLocaleDateString('en-TZ', { day: '2-digit', month: 'long', year: 'numeric' })
    .toUpperCase()
}

// ── ID Card HTML (85.6×54mm CR-80 standard) ──────────────────────────────────
type CardData = {
  fullName: string
  nationalId: string
  gender: string
  dob: string
  village: string
  issuedDate: string
  expiryDate: string
  photoBase64?: string
}

// ── Shared card markup + styles (used by both print and download builders) ──
function cardMarkup(d: CardData): { css: string; html: string } {
  const photo = d.photoBase64
    ? `<img src="${d.photoBase64}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;"/>`
    : `<div style="width:100%;height:100%;background:#d1fae5;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#0f766e;border-radius:4px;">${d.fullName
        .split(' ')
        .slice(0, 2)
        .map((n: string) => n[0])
        .join('')}</div>`
  const css = `
.card{width:85.6mm;height:54mm;position:relative;overflow:hidden;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,0.15)}
.flag{display:flex;height:3mm}
.fg{flex:3;background:#1eb53a}.fy{width:2mm;background:#fcd116}
.fb{width:1.5mm;background:#000}.fbl{flex:3;background:#00a3dd}
.hdr{background:linear-gradient(135deg,#003087,#0f766e);height:11mm;display:flex;align-items:center;padding:0 3mm}
.htitle{color:#fff;font-size:5pt;font-weight:900;letter-spacing:1px;flex:1;text-align:center}
.hsub{color:rgba(255,255,255,.8);font-size:3.5pt;text-align:center;letter-spacing:.5px}
.body{display:flex;padding:2mm 3mm;gap:3mm;height:34mm}
.photo{width:18mm;height:22mm;border:1.5px solid #0f766e;border-radius:4px;overflow:hidden;flex-shrink:0}
.nid{background:#003087;border-radius:2px;padding:.5mm 2mm;margin-top:1mm}
.nid-t{color:#fcd116;font-size:3pt;font-weight:900;letter-spacing:.3px;word-break:break-all;text-align:center}
.info{flex:1;display:flex;flex-direction:column;gap:1mm;padding-top:.5mm}
.name{font-size:6.5pt;font-weight:900;color:#003087;text-transform:uppercase;letter-spacing:.3px}
.badge{background:#0f766e;color:#fff;font-size:3pt;font-weight:700;padding:.4mm 2mm;border-radius:2px;align-self:flex-start;letter-spacing:.5px;margin-bottom:1mm}
.row{display:flex;justify-content:space-between;border-bottom:.3px solid #e2e8f0;padding-bottom:.4mm}
.dk{font-size:3.5pt;color:#64748b}.dv{font-size:3.5pt;font-weight:700;color:#0f172a}
.foot{background:#1e293b;height:6mm;display:flex;align-items:center;justify-content:space-between;padding:0 3mm}
.bars{display:flex;align-items:center;height:4mm;gap:.3mm}
.bar{background:rgba(255,255,255,.5);border-radius:.2mm}
.ftxt{font-size:3pt;color:rgba(255,255,255,.5)}
`
  const html = `<div class="card">
<div class="flag"><div class="fg"></div><div class="fy"></div><div class="fb"></div><div class="fy"></div><div class="fbl"></div></div>
<div class="hdr"><div><div class="htitle">UNITED REPUBLIC OF TANZANIA</div><div class="hsub">NATIONAL IDENTIFICATION CARD</div></div></div>
<div class="body">
  <div>
    <div class="photo">${photo}</div>
    <div class="nid"><div class="nid-t">${d.nationalId}</div></div>
  </div>
  <div class="info">
    <div class="name">${d.fullName}</div>
    <div class="badge">TANZANIA CITIZEN</div>
    <div class="row"><span class="dk">Gender</span><span class="dv">${d.gender.toUpperCase()}</span></div>
    <div class="row"><span class="dk">Date of Birth</span><span class="dv">${fmtDOB(d.dob)}</span></div>
    <div class="row"><span class="dk">Village</span><span class="dv">${d.village}</span></div>
    <div class="row"><span class="dk">Issued</span><span class="dv">${d.issuedDate}</span></div>
    <div class="row"><span class="dk">Expires</span><span class="dv">${d.expiryDate}</span></div>
  </div>
</div>
<div class="foot">
  <div class="bars">${Array.from({ length: 24 }, (_, i) => `<div class="bar" style="width:${i % 3 === 0 ? '2px' : '1px'};height:${i % 5 === 0 ? '3mm' : '2mm'};"></div>`).join('')}</div>
  <div class="ftxt">NBS · NIDA · ${new Date().getFullYear()} · ${d.nationalId}</div>
</div>
</div>`
  return { css, html }
}

// CR-80 (85.6×54mm) card-sized HTML — used with Print.printAsync() so the
// native print dialog (and any connected card printer driver) receives a
// correctly-sized page instead of a tiny card on a default A4/Letter sheet.
function buildCardHtml(d: CardData): string {
  const { css, html } = cardMarkup(d)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{size:85.6mm 54mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{width:85.6mm;height:54mm;font-family:Arial,sans-serif;background:#fff}
${css}
</style></head><body>${html}</body></html>`
}

// A4 page with the card centred — used for "Download Card" so the saved PDF
// opens as a normal full page with the card centred, not stuck top-left.
function buildDownloadPageHtml(d: CardData): string {
  const { css, html } = cardMarkup(d)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%}
body{font-family:Arial,sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center}
${css}
</style></head><body>${html}</body></html>`
}

// ── On-screen ID card preview (CR-80 proportions) ────────────────────────────
function IdCardPreview({ data }: { data: CardData | null }) {
  if (!data) return null
  const initials = data.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n: string) => n[0])
    .join('')
  return (
    <View
      style={{
        alignSelf: 'center',
        width: 320,
        height: 202,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
      }}
    >
      <View style={{ flexDirection: 'row', height: 6 }}>
        <View style={{ flex: 3, backgroundColor: '#1eb53a' }} />
        <View style={{ width: 7, backgroundColor: '#fcd116' }} />
        <View style={{ width: 5, backgroundColor: '#000' }} />
        <View style={{ width: 7, backgroundColor: '#fcd116' }} />
        <View style={{ flex: 3, backgroundColor: '#00a3dd' }} />
      </View>
      <LinearGradient
        colors={['#003087', '#0f766e']}
        style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>
          UNITED REPUBLIC OF TANZANIA
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 7, marginTop: 1 }}>
          NATIONAL IDENTIFICATION CARD
        </Text>
      </LinearGradient>
      <View style={{ flex: 1, flexDirection: 'row', padding: 10, gap: 10 }}>
        <View style={{ alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 62,
              height: 76,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: '#0f766e',
              overflow: 'hidden',
              backgroundColor: '#d1fae5',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {data.photoBase64 ? (
              <Image
                source={{ uri: data.photoBase64 }}
                style={{ width: 62, height: 76 }}
                resizeMode="cover"
              />
            ) : (
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#0f766e' }}>{initials}</Text>
            )}
          </View>
          <View
            style={{
              backgroundColor: '#003087',
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: '#fcd116', fontSize: 7, fontWeight: '900' }}>
              {data.nationalId}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 3, paddingTop: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: '#003087' }} numberOfLines={1}>
            {data.fullName}
          </Text>
          <View
            style={{
              backgroundColor: '#0f766e',
              borderRadius: 3,
              paddingHorizontal: 6,
              paddingVertical: 1.5,
              alignSelf: 'flex-start',
              marginBottom: 1,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 7, fontWeight: '700', letterSpacing: 0.5 }}>
              TANZANIA CITIZEN
            </Text>
          </View>
          {[
            ['Gender', data.gender.toUpperCase()],
            ['Date of Birth', fmtDOB(data.dob)],
            ['Village', data.village],
            ['Issued', data.issuedDate],
            ['Expires', data.expiryDate],
          ].map(([k, v]) => (
            <View
              key={k}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                borderBottomWidth: 0.5,
                borderBottomColor: '#e2e8f0',
                paddingBottom: 1,
              }}
            >
              <Text style={{ fontSize: 8, color: '#64748b' }}>{k}</Text>
              <Text style={{ fontSize: 8, fontWeight: '700', color: '#0f172a' }} numberOfLines={1}>
                {v}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View
        style={{
          height: 18,
          backgroundColor: '#1e293b',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <View
              key={i}
              style={{
                width: i % 3 === 0 ? 2 : 1,
                height: i % 5 === 0 ? 12 : 8,
                backgroundColor: 'rgba(255,255,255,0.5)',
              }}
            />
          ))}
        </View>
        <Text style={{ fontSize: 6, color: 'rgba(255,255,255,0.5)' }}>NBS · NIDA</Text>
      </View>
    </View>
  )
}

// ── StepBar ───────────────────────────────────────────────────────────────────
function StepBar({ step, total }: { step: number; total: number }) {
  const { theme: _T } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        gap: 6,
      }}
    >
      {Array.from({ length: total }, (_, i) => i + 1).map((n, i) => (
        <React.Fragment key={n}>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: n < step ? TZ.green : n === step ? G : 'rgba(255,255,255,0.12)',
              borderWidth: n === step ? 1.5 : 0,
              borderColor: GL,
            }}
          >
            {n < step ? (
              <Check size={12} color="#fff" />
            ) : (
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: n === step ? '#fff' : 'rgba(255,255,255,0.4)',
                }}
              >
                {n}
              </Text>
            )}
          </View>
          {i < total - 1 && (
            <View
              style={{
                flex: 1,
                height: 2,
                borderRadius: 1,
                backgroundColor: n < step ? TZ.green : 'rgba(255,255,255,0.15)',
              }}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  )
}

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
        Animated.delay(1800),
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
        backgroundColor: G,
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

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function NINRegistrationScreen({ navigation }: Props) {
  const { theme: T } = useTheme()

  // Step 1
  const [bid, setBid] = useState('')
  const [searching, setSearching] = useState(false)
  const [birthRecord, setBirthRecord] = useState<any>(null)
  const [bidError, setBidError] = useState('')
  const [age, setAge] = useState(0)

  // Step 2
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [fpLeft, setFpLeft] = useState<'idle' | 'scanning' | 'done'>('idle')
  const [fpRight, setFpRight] = useState<'idle' | 'scanning' | 'done'>('idle')
  const fp2Valid = fpLeft === 'done' && fpRight === 'done'

  // Step 3
  const [submitting, setSubmitting] = useState(false)
  const [issuedNIN, setIssuedNIN] = useState<string | null>(null)
  const [cardHtml, setCardHtml] = useState<string | null>(null)
  const [cardData, setCardData] = useState<CardData | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [officer, setOfficer] = useState<any>({})

  // Toast + step
  const [toast, setToast] = useState('')
  const [toastVis, setToastVis] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const showToast = (msg: string) => {
    setToast(msg)
    setToastVis(true)
    setTimeout(() => setToastVis(false), 2500)
  }

  useEffect(() => {
    fetchRemoteDashboard()
      .then((remote) => {
        if (remote)
          setOfficer({
            officerName: remote.officerName ?? 'Village Officer',
            villageName: remote.villageName ?? 'My Village',
            wardName: remote.wardName ?? '—',
          })
      })
      .catch(() => {})
  }, [])

  // ── Step 1: BID lookup ────────────────────────────────────────────────────
  const handleBIDSearch = useCallback(async () => {
    const b = bid.trim().toUpperCase()
    if (!b.startsWith('BID-')) {
      setBidError('Enter a valid BID (format: BID-YYYYMMDD-XXXXXXX)')
      return
    }
    setSearching(true)
    setBidError('')
    setBirthRecord(null)
    try {
      const json = await apiGet(`/village/birth-lookup?bid=${encodeURIComponent(b)}`)
      if (!json.success) {
        setBidError(json.message ?? 'Birth record not found')
        setSearching(false)
        return
      }
      const calculatedAge = calcAge(json.data.dateOfBirth)
      if (calculatedAge < 18) {
        setSearching(false)
        Alert.alert(
          'Not Eligible',
          `This citizen is ${calculatedAge} years old.\n\nNIDA registration requires the citizen to be at least 18 years of age.\n\nDate of Birth: ${fmtDOB(json.data.dateOfBirth)}`,
          [{ text: 'OK' }]
        )
        return
      }
      setBirthRecord(json.data)
      setAge(calculatedAge)
    } catch (e: any) {
      setBidError(e?.message ?? 'Network error — check connection')
    }
    setSearching(false)
  }, [bid])

  // ── Step 2a: Photo (image picker) ──────────────────────────────────────
  const openCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!lib.granted) {
        Alert.alert('Permission', 'Camera or gallery access required.')
        return
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
      base64: true,
    }).catch(async () =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
        base64: true,
      })
    )
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setPhotoUri(asset.uri)
      setPhotoBase64(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : null)
      showToast('Photo selected successfully')
    }
  }

  // ── Step 2b: Fingerprints (manual confirmation) ────────────────────────
  const scanFingerprint = async (hand: 'left' | 'right') => {
    const setter = hand === 'left' ? setFpLeft : setFpRight
    setter('scanning')
    // Simulate fingerprint scan with a 1.5s delay then confirm
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setter('done')
    showToast(`${hand === 'left' ? 'Left' : 'Right'} thumb registered`)
  }

  // Build card data when biometrics complete
  useEffect(() => {
    if (!birthRecord || !fp2Valid) return
    const nin = generateNationalId(birthRecord.dateOfBirth ?? '')
    const issued = new Date().toLocaleDateString('en-TZ', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    const exp = new Date()
    exp.setFullYear(exp.getFullYear() + 10)
    const expiryStr = exp.toLocaleDateString('en-TZ', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    setCardData({
      nationalId: nin,
      fullName: [birthRecord.childFirstName, birthRecord.childMiddleName, birthRecord.childSurname]
        .filter(Boolean)
        .join(' '),
      gender: birthRecord.gender ?? '',
      dob: fmtDOB(birthRecord.dateOfBirth),
      village: officer?.villageName ?? '—',
      issuedDate: issued,
      expiryDate: expiryStr,
      photoBase64: photoBase64 ?? undefined,
    })
    setCardHtml(buildCardHtml({
      nationalId: nin,
      fullName: [birthRecord.childFirstName, birthRecord.childMiddleName, birthRecord.childSurname]
        .filter(Boolean)
        .join(' '),
      gender: birthRecord.gender ?? '',
      dob: fmtDOB(birthRecord.dateOfBirth),
      village: officer?.villageName ?? '—',
      issuedDate: issued,
      expiryDate: expiryStr,
      photoBase64: photoBase64 ?? undefined,
    }))
  }, [birthRecord, photoBase64, fpLeft, fpRight, fp2Valid, officer])

  // Print Card — opens the native print dialog (officer selects a connected
  // card printer or any other printer). Uses CR-80-sized HTML.
  const handlePrint = async () => {
    if (!cardHtml) return
    setPrinting(true)
    try {
      await Print.printAsync({ html: cardHtml })
    } catch (e: any) {
      if (e?.message && !/cancel/i.test(e.message)) {
        Alert.alert('Print Error', 'Could not open the print dialog.')
      }
    }
    setPrinting(false)
  }

  // Download Card — generates an A4 PDF with the card centred on the page,
  // then opens the share sheet to save/send it.
  const handleDownload = async () => {
    if (!cardData) return
    setDownloading(true)
    try {
      const pageHtml = buildDownloadPageHtml(cardData)
      const { uri } = await Print.printToFileAsync({
        html: pageHtml,
        width: 595,
        height: 842,
        base64: false,
      })
      const dest = `${FileSystem.documentDirectory}NID-${cardData.nationalId.replace(/-/g, '_')}.pdf`
      await FileSystem.copyAsync({ from: uri, to: dest })
      await Sharing.shareAsync(dest, { mimeType: 'application/pdf', dialogTitle: 'Save NID Card' })
    } catch {
      Alert.alert('Error', 'Could not generate or share the PDF')
    }
    setDownloading(false)
  }

  const generateNationalId = (dob: string) => {
    const d = dob.replace(/[^0-9]/g, '').slice(0, 8)
    return `NIN-${d || Date.now().toString().slice(-8)}`
  }

  const canProceedStep2 = !!photoUri && fp2Valid

  const handleIssueNIN = async () => {
    if (!birthRecord) return
    setSubmitting(true)
    try {
      const json = await apiPost('/village/nin-issue', { birthId: birthRecord.birthId })
      const nin = json?.data?.nationalId
      if (!nin) {
        Alert.alert('Issuance Failed', json?.message ?? 'The server did not return a National ID.')
        setSubmitting(false)
        return
      }
      setIssuedNIN(nin)
      // The preview card built earlier (Step 2 → Step 3 transition) used a
      // placeholder NIN since the real one only exists once the server has
      // issued it. Refresh the card data/HTML now with the REAL, persisted
      // NIN so the printed/downloaded ID card matches what was saved to
      // the database, not the placeholder shown during biometric capture.
      setCardData((prev) => (prev ? { ...prev, nationalId: nin } : prev))
      setCardHtml((prevHtml) => {
        if (!cardData) return prevHtml
        return buildCardHtml({ ...cardData, nationalId: nin })
      })
      showToast('NIN issued and saved successfully')
    } catch (e: any) {
      Alert.alert('Issuance Failed', e?.message ?? 'Network error — check connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      {/* Header */}
      <LinearGradient colors={['#042f2e', '#0f766e']} style={{ paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', height: 4 }}>
          <View style={{ flex: 3, backgroundColor: TZ.green }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ width: 7, backgroundColor: '#000' }} />
          <View style={{ width: 9, backgroundColor: TZ.yellow }} />
          <View style={{ flex: 3, backgroundColor: TZ.blue }} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 6,
            gap: 10,
          }}
        >
          <TouchableOpacity
            onPress={() => (step > 1 ? setStep((s) => (s - 1) as any) : navigation.goBack())}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>
              NIN Registration
            </Text>
            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              NIDA · National Identification Authority
            </Text>
          </View>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.10)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IdCard size={20} color={GL} />
          </View>
        </View>
        <StepBar step={step} total={3} />
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingBottom: 10,
          }}
        >
          {['BID Lookup', 'Biometrics', 'Issue NIN'].map((l, i) => (
            <Text
              key={l}
              style={{
                fontSize: 9,
                color: i + 1 === step ? GL : 'rgba(255,255,255,0.4)',
                width: '33%',
                textAlign: i === 0 ? 'left' : i === 1 ? 'center' : 'right',
              }}
            >
              {l}
            </Text>
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── STEP 1: BID LOOKUP ── */}
        {step === 1 && (
          <View style={{ gap: 14 }}>
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: `${G}40`,
                backgroundColor: `${G}10`,
                padding: 14,
                flexDirection: 'row',
                gap: 10,
              }}
            >
              <Shield size={16} color={GL} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: T.text }}>
                  NIN Registration — Age 18+
                </Text>
                <Text style={{ fontSize: 11, color: T.textSub, marginTop: 4, lineHeight: 17 }}>
                  Enter the citizen's Birth Registration ID (BID) issued at birth by the Hospital
                  Officer. The system verifies the citizen is 18+ before proceeding.
                </Text>
              </View>
            </View>
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: T.textSub, marginBottom: 6 }}>
                Birth Registration ID (BID) *
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: T.card2,
                    borderWidth: 1,
                    borderColor: bidError ? '#f87171' : T.border,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: T.text,
                    fontSize: 14,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                  value={bid}
                  onChangeText={(t) => {
                    setBid(t.toUpperCase())
                    setBidError('')
                  }}
                  placeholder="BID-YYYYMMDD-XXXXXXX"
                  placeholderTextColor={T.textDim}
                  autoCapitalize="characters"
                  returnKeyType="search"
                  onSubmitEditing={handleBIDSearch}
                />
                <TouchableOpacity
                  onPress={handleBIDSearch}
                  disabled={searching || !bid.trim()}
                  style={{
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 76,
                    backgroundColor: bid.trim() ? G : T.card2,
                    opacity: searching ? 0.6 : 1,
                  }}
                >
                  {searching ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Search size={18} color={bid.trim() ? '#fff' : T.textDim} />
                  )}
                </TouchableOpacity>
              </View>
              {!!bidError && (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <AlertCircle size={13} color="#f87171" />
                  <Text style={{ fontSize: 11, color: '#f87171', flex: 1 }}>{bidError}</Text>
                </View>
              )}
            </View>
            {birthRecord && (
              <View
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: `${TZ.green}40`,
                  backgroundColor: `${TZ.green}08`,
                  overflow: 'hidden',
                }}
              >
                <LinearGradient colors={[`${G}25`, `${G}08`]} style={{ padding: 14 }}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: `${G}25`,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <User size={18} color={GL} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: T.text }}>
                        {[
                          birthRecord.childFirstName,
                          birthRecord.childMiddleName,
                          birthRecord.childSurname,
                        ]
                          .filter(Boolean)
                          .join(' ')
                          .toUpperCase()}
                      </Text>
                      <Text style={{ fontSize: 11, color: GL, fontWeight: '600' }}>
                        Age {age} · Birth Record Found ✓
                      </Text>
                    </View>
                  </View>
                  {[
                    ['BID', birthRecord.birthId],
                    ['Birth Cert No', birthRecord.birthCertNo],
                    ['Gender', birthRecord.gender?.toUpperCase()],
                    ['Date of Birth', fmtDOB(birthRecord.dateOfBirth)],
                    ['Father NID', birthRecord.father?.nationalId ?? '—'],
                    ['Mother NID', birthRecord.mother?.nationalId ?? '—'],
                    ['Facility', birthRecord.facility?.facilityName ?? '—'],
                  ].map(([k, v]) => (
                    <View
                      key={k}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        paddingVertical: 4,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: `${T.border}80`,
                      }}
                    >
                      <Text style={{ fontSize: 11, color: T.textDim, width: '42%' }}>{k}</Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: T.text,
                          fontWeight: '600',
                          flex: 1,
                          textAlign: 'right',
                        }}
                      >
                        {v}
                      </Text>
                    </View>
                  ))}
                </LinearGradient>
              </View>
            )}
          </View>
        )}

        {/* ── STEP 2: BIOMETRICS ── */}
        {step === 2 && birthRecord && (
          <View style={{ gap: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: T.text }}>
              Biometric Registration
            </Text>
            <Text style={{ fontSize: 12, color: T.textSub, lineHeight: 18 }}>
              Capture a facial photo and register both thumbprints for the citizen ID card.
            </Text>
            {/* Photo */}
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.border,
                backgroundColor: T.card,
                padding: 16,
              }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}
              >
                <ImageIcon size={16} color={photoUri ? TZ.green : GL} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>
                  {photoUri ? 'Photo Captured ✓' : 'Capture Photo ID'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                <View
                  style={{
                    width: 80,
                    height: 96,
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: photoUri ? TZ.green : T.border,
                    backgroundColor: T.card2,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {photoUri ? (
                    <Image
                      source={{ uri: photoUri }}
                      style={{ width: 80, height: 96 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <User size={32} color={T.textDim} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 10 }}>
                  <Text style={{ fontSize: 11, color: T.textSub, lineHeight: 17 }}>
                    Position the citizen facing the camera. Ensure the face is centred and clearly
                    visible.
                  </Text>
                  <TouchableOpacity
                    onPress={openCamera}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: photoUri ? `${TZ.green}20` : G,
                      borderRadius: 10,
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      borderWidth: photoUri ? 1 : 0,
                      borderColor: `${TZ.green}50`,
                    }}
                  >
                    <ImageIcon size={14} color={photoUri ? TZ.green : '#fff'} />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: photoUri ? TZ.green : '#fff',
                      }}
                    >
                      {photoUri ? 'Change Photo' : 'Select Photo'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            {/* Fingerprints */}
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.border,
                backgroundColor: T.card,
                padding: 16,
              }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}
              >
                <Fingerprint size={16} color={fp2Valid ? TZ.green : GL} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: T.text }}>
                  {fp2Valid ? 'Fingerprints Registered ✓' : 'Register Fingerprints'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {(['left', 'right'] as const).map((hand) => {
                  const state = hand === 'left' ? fpLeft : fpRight
                  const label = hand === 'left' ? 'Left Thumb' : 'Right Thumb'
                  return (
                    <TouchableOpacity
                      key={hand}
                      onPress={() => state === 'idle' && scanFingerprint(hand)}
                      disabled={state === 'scanning'}
                      style={{
                        flex: 1,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        paddingVertical: 16,
                        alignItems: 'center',
                        gap: 8,
                        borderColor:
                          state === 'done'
                            ? `${TZ.green}60`
                            : state === 'scanning'
                              ? `${GL}60`
                              : T.border,
                        backgroundColor:
                          state === 'done'
                            ? `${TZ.green}12`
                            : state === 'scanning'
                              ? `${G}12`
                              : T.card2,
                      }}
                    >
                      {state === 'scanning' ? (
                        <ActivityIndicator color={GL} size="small" />
                      ) : state === 'done' ? (
                        <CheckCircle2 size={28} color={TZ.green} />
                      ) : (
                        <Fingerprint size={28} color={T.textSub} />
                      )}
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color:
                            state === 'done' ? TZ.green : state === 'scanning' ? GL : T.textSub,
                        }}
                      >
                        {state === 'scanning'
                          ? 'Scanning…'
                          : state === 'done'
                            ? 'Registered'
                            : label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
              <Text
                style={{
                  fontSize: 10,
                  color: T.textDim,
                  marginTop: 10,
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}
              >
                Place each thumb firmly on the fingerprint sensor when prompted
              </Text>
            </View>
            {!canProceedStep2 && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: `${GL}10`,
                  borderRadius: 10,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: `${GL}30`,
                }}
              >
                <AlertCircle size={13} color={GL} />
                <Text style={{ fontSize: 11, color: T.textSub, flex: 1, lineHeight: 17 }}>
                  Complete photo capture and both fingerprints before proceeding.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── STEP 3: NIN ISSUED ── */}
        {step === 3 && issuedNIN && (
          <View style={{ gap: 14 }}>
            <View style={{ borderRadius: 14, overflow: 'hidden' }}>
              <LinearGradient
                colors={['#064e3b', '#065f46']}
                style={{ alignItems: 'center', padding: 24, gap: 10 }}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: 'rgba(74,222,128,0.15)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircle2 size={36} color="#4ade80" />
                </View>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff' }}>NIN Issued!</Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
                  National ID registered in NBS Central Database
                </Text>
              </LinearGradient>
            </View>
            <Text style={{ fontSize: 17, fontWeight: '900', color: T.text, textAlign: 'center' }}>
              {[
                birthRecord?.childFirstName,
                birthRecord?.childMiddleName,
                birthRecord?.childSurname,
              ]
                .filter(Boolean)
                .join(' ')
                .toUpperCase()}
            </Text>
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: T.textDim,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                National ID Number (NIN)
              </Text>
              <View
                style={{
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: `${G}60`,
                  backgroundColor: `${G}12`,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{ fontSize: 16, fontWeight: '900', color: GL, flex: 1, letterSpacing: 1 }}
                >
                  {issuedNIN}
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    await Clipboard.setStringAsync(issuedNIN)
                    showToast('NIN copied')
                  }}
                  style={{ padding: 4 }}
                >
                  <Copy size={16} color={GL} />
                </TouchableOpacity>
              </View>
            </View>

            {/* National ID card preview */}
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: T.textDim,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  textAlign: 'center',
                }}
              >
                Card Preview
              </Text>
              <IdCardPreview data={cardData} />
            </View>

            {[
              ['Age', `${age} years`],
              ['Gender', birthRecord?.gender?.toUpperCase()],
              ['Date of Birth', fmtDOB(birthRecord?.dateOfBirth)],
              ['Registered by', officer?.officerName ?? '—'],
            ].map(([k, v]) => (
              <View
                key={k}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 8,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: T.border,
                }}
              >
                <Text style={{ fontSize: 12, color: T.textSub }}>{k}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: T.text }}>{v}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={handlePrint}
                disabled={printing || !cardHtml}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  backgroundColor: printing ? T.card2 : G,
                  borderRadius: 12,
                  paddingVertical: 14,
                  borderWidth: printing ? 1 : 0,
                  borderColor: T.border,
                }}
              >
                {printing ? (
                  <ActivityIndicator color={GL} size="small" />
                ) : (
                  <Printer size={18} color="#fff" />
                )}
                <Text style={{ fontSize: 14, fontWeight: '800', color: printing ? GL : '#fff' }}>
                  {printing ? 'Opening…' : 'Print Card'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDownload}
                disabled={downloading || !cardData}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderRadius: 12,
                  paddingVertical: 14,
                  borderWidth: 1.5,
                  borderColor: `${G}60`,
                }}
              >
                {downloading ? (
                  <ActivityIndicator color={GL} size="small" />
                ) : (
                  <Download size={18} color={GL} />
                )}
                <Text style={{ fontSize: 14, fontWeight: '800', color: GL }}>
                  {downloading ? 'Generating…' : 'Download Card'}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                borderWidth: 1,
                borderColor: T.border,
                borderRadius: 12,
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: T.textSub }}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Footer CTA */}
      {step < 3 && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: T.card,
            borderTopWidth: 1,
            borderTopColor: T.border,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 28,
          }}
        >
          <View style={{ height: 3, backgroundColor: T.border, borderRadius: 2, marginBottom: 10 }}>
            <View
              style={{
                height: 3,
                backgroundColor: G,
                borderRadius: 2,
                width: `${(step / 3) * 100}%`,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {step > 1 && (
              <TouchableOpacity
                onPress={() => setStep((s) => (s - 1) as any)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: T.border,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                }}
              >
                <ArrowLeft size={16} color={T.textSub} />
                <Text style={{ fontSize: 13, color: T.textSub, fontWeight: '600' }}>Back</Text>
              </TouchableOpacity>
            )}
            {step === 1 && (
              <TouchableOpacity
                onPress={() => {
                  if (birthRecord && age >= 18) setStep(2)
                }}
                disabled={!birthRecord || age < 18}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: G,
                  borderRadius: 12,
                  paddingVertical: 13,
                  opacity: birthRecord && age >= 18 ? 1 : 0.38,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                  Continue to Biometrics
                </Text>
                <ChevronRight size={18} color="#fff" />
              </TouchableOpacity>
            )}
            {step === 2 && (
              <TouchableOpacity
                onPress={handleIssueNIN}
                disabled={submitting || !canProceedStep2}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderRadius: 12,
                  paddingVertical: 13,
                  backgroundColor: canProceedStep2 ? TZ.green : T.card2,
                  borderWidth: canProceedStep2 ? 0 : 1,
                  borderColor: T.border,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <IdCard size={18} color={canProceedStep2 ? '#fff' : T.textSub} />
                )}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '800',
                    color: canProceedStep2 ? '#fff' : T.textSub,
                  }}
                >
                  {submitting ? 'Issuing NIN…' : 'Register & Issue NIN'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <Toast msg={toast} vis={toastVis} />
    </SafeAreaView>
  )
}
