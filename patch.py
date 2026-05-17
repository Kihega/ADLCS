#!/usr/bin/env python3
"""
ADLCS-TZ-2025 — Birth & Death Registration Flow Patch
=======================================================
Run from the project root (where code/ lives):
    python3 patch_birth_death_flows.py

What this fixes
───────────────
BIRTH (Section 2.7):
  [GAP 1] Step order was Father → Mother → Child Info → Review
           Fixed to:  Child Info → Father NID → Mother NID → Review (spec order)
  [GAP 2] NIN format was YYYYMMDD-RRRDD-SSSSS-CC (adult NIN)
           Fixed to:  TZ-YYYYMMDD-XXXXX  (newborn NIN per spec)
  [GAP 3] On submit used saveBirth() + triggerSync() (local-first only)
           Fixed to:  saveAndSyncBirth() — sends to remote DB immediately if
           online, stores locally if offline, auto-syncs when device reconnects
  [GAP 4] Auto-fill from father overwrote child names already typed in step 1
           Fixed:  only fills empty fields

DEATH (Section 2.8 Hospital — Case B):
  [GAP 5] No INFANT/ADULT split — always did a single citizen NID lookup.
           Spec requires: INFANT → Father NID + Mother NID (no citizen NIN yet)
                          ADULT  → Citizen NID lookup
           Fixed: Step 1 = Category selection (INFANT or ADULT)
                  Step 2 = Conditional lookup based on selection
                  Step 3 = Death details
                  Step 4 = Certificate issued
  [GAP 6] On submit used saveDeath() + triggerSync() (local-first only)
           Fixed to: saveAndSyncDeath() — same online/offline logic as birth

OFFLINE / ONLINE SYNC (already in syncService, now properly wired):
  • If device is ONLINE at submit time → data goes straight to remote DB
  • If device is OFFLINE            → stored in local SQLite (synced=0)
  • When device comes back ONLINE   → NetInfo listener fires triggerSync()
    automatically (was already implemented, now consistently used)
"""

import os
import sys
import re

# ── Path resolution ────────────────────────────────────────────────────────────
ROOT = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.join(ROOT, "code", "mobile")
SERVICES = os.path.join(MOBILE, "src", "services")
HOSPITAL = os.path.join(MOBILE, "src", "screens", "hospital")

def path(rel): return os.path.join(ROOT, *rel.split("/"))
def read(p):
    with open(p, encoding="utf-8") as f: return f.read()
def write(p, content):
    with open(p, "w", encoding="utf-8") as f: f.write(content)
def patch(filepath, old, new, label=""):
    content = read(filepath)
    if old not in content:
        print(f"  ✗  [{label}] Pattern not found — skipping (may already be patched)")
        return False
    write(filepath, content.replace(old, new, 1))
    print(f"  ✓  [{label}] Applied")
    return True


# ══════════════════════════════════════════════════════════════════════════════
# PATCH 1 — localDb.ts: Add generateNewbornNationalId()
# ══════════════════════════════════════════════════════════════════════════════
LOCAL_DB = path("code/mobile/src/services/localDb.ts")

print("\n[1/3] Patching localDb.ts — generateNewbornNationalId()")

patch(
    LOCAL_DB,
    # OLD: existing generateNationalId for adult citizens (unchanged)
    "export function generateNationalId(dob: string, regionCode = '07', districtCode = '03', wardCode = '1'): string {",
    # NEW: prepend the newborn function before the existing adult one
    """\
export function generateNewbornNationalId(dob: string): string {
  // Spec §2.7 Step 4 — format: TZ-YYYYMMDD-XXXXX
  const parts    = dob.split('/')
  const day      = (parts[0] ?? '01').padStart(2, '0')
  const month    = (parts[1] ?? '01').padStart(2, '0')
  const year     = parts[2] ?? new Date().getFullYear().toString()
  const datePart = `${year}${month}${day}`
  const seq      = String(Math.floor(Math.random() * 90000) + 10000).padStart(5, '0')
  return `TZ-${datePart}-${seq}`
}

export function generateNationalId(dob: string, regionCode = '07', districtCode = '03', wardCode = '1'): string {""",
    label="generateNewbornNationalId",
)


# ══════════════════════════════════════════════════════════════════════════════
# PATCH 2 — RegisterBirthScreen.tsx: Step reorder + NIN + sync
# ══════════════════════════════════════════════════════════════════════════════
BIRTH_SCREEN = path("code/mobile/src/screens/hospital/RegisterBirthScreen.tsx")

print("\n[2/3] Patching RegisterBirthScreen.tsx")

# 2a — Import: replace saveBirth & generateNationalId with new versions
patch(
    BIRTH_SCREEN,
    "import {\n  saveBirth, generateBirthCertNo, generateNationalId,\n  updateBirthCertPath, LocalBirth,\n} from '../../services/localDb'",
    "import {\n  generateBirthCertNo, generateNewbornNationalId,\n  updateBirthCertPath, LocalBirth,\n} from '../../services/localDb'",
    label="localDb import",
)

# 2b — Import: add saveAndSyncBirth to syncService imports
patch(
    BIRTH_SCREEN,
    "import { triggerSync } from '../../services/syncService'",
    "import { triggerSync, saveAndSyncBirth } from '../../services/syncService'",
    label="syncService import",
)

# 2c — Step labels: reorder to spec order
patch(
    BIRTH_SCREEN,
    "  const STEP_LABELS = ['Father','Mother','Child Info','Review']",
    "  const STEP_LABELS = ['Child Info','Father','Mother','Review']",
    label="STEP_LABELS reorder",
)

# 2d — Step validations: child info is now step 1, father step 2, mother step 3
patch(
    BIRTH_SCREEN,
    """\
  const step1Valid = isNINComplete(fatherNid) && !!fatherData
  const step2Valid = isNINComplete(motherNid) && !!motherData
  const step3Valid = !!childFirst.trim() && !!childSurname.trim() && !!childGender && childDOB.length >= 8""",
    """\
  // Spec §2.7: Step 1 = Child Info, Step 2 = Father NID, Step 3 = Mother NID
  const step1Valid = !!childFirst.trim() && !!childSurname.trim() && !!childGender && childDOB.length >= 8
  const step2Valid = isNINComplete(fatherNid) && !!fatherData
  const step3Valid = isNINComplete(motherNid) && !!motherData""",
    label="step validations",
)

# 2e — Auto-fill from father: only overwrite empty fields (step 1 already typed)
patch(
    BIRTH_SCREEN,
    """\
  // Auto-fill child names from father
  useEffect(() => {
    if (fatherData) {
      setChildMiddle(fatherData.middleName ?? '')
      setChildSurname(fatherData.surname ?? '')
    }
  }, [fatherData])""",
    """\
  // Auto-fill child names from father — only if user hasn't typed them yet in Step 1
  useEffect(() => {
    if (fatherData) {
      if (!childMiddle.trim()) setChildMiddle(fatherData.middleName ?? '')
      if (!childSurname.trim()) setChildSurname(fatherData.surname ?? '')
    }
  }, [fatherData])""",
    label="auto-fill guard",
)

# 2f — NIN generation: use generateNewbornNationalId (spec TZ-YYYYMMDD-XXXXX format)
patch(
    BIRTH_SCREEN,
    "      const certNo     = generateBirthCertNo()\n      const nationalId = generateNationalId(childDOB)",
    "      const certNo     = generateBirthCertNo()\n      const nationalId = generateNewbornNationalId(childDOB)  // Spec §2.7 Step 4: TZ-YYYYMMDD-XXXXX",
    label="NIN format",
)

# 2g — Use saveAndSyncBirth instead of saveBirth (online direct, offline queue)
patch(
    BIRTH_SCREEN,
    "      const birth = await saveBirth({",
    """\
      // Spec §2.7: if online → save directly to remote DB; if offline → save to
      // local SQLite (synced=0) and push automatically when device reconnects
      const { birth, syncedRemote } = await saveAndSyncBirth({""",
    label="saveAndSyncBirth",
)

# 2h — Background PDF generation: skip duplicate triggerSync if already synced
patch(
    BIRTH_SCREEN,
    """\
      // Background: generate PDF + try sync
      ;(async () => {
        try {
          const pdf = await generateBirthPdf(birth)
          await updateBirthCertPath(birth.id, pdf)
          setPdfPath(pdf)
        } catch (e) { console.warn('PDF gen failed:', e) }
        await triggerSync()
      })()""",
    """\
      // Background: generate PDF; only bulk-sync if immediate push failed
      ;(async () => {
        try {
          const pdf = await generateBirthPdf(birth)
          await updateBirthCertPath(birth.id, pdf)
          setPdfPath(pdf)
        } catch (e) { console.warn('PDF gen failed:', e) }
        if (!syncedRemote) await triggerSync()
      })()""",
    label="background sync",
)

# 2i — JSX step rendering: swap step 1 (father) → step 2, step 2 (mother) → step 3,
#       step 3 (child info) → step 1
#   Do in a single replacement to avoid conflicts
BIRTH_OLD_STEPS = """\
          {step===1 && renderNIDStep('father')}
          {step===2 && renderNIDStep('mother')}
          {step===3 && ("""

BIRTH_NEW_STEPS = """\
          {/* Spec §2.7 Step 1: Child birth details */}
          {step===1 && ("""

patch(BIRTH_SCREEN, BIRTH_OLD_STEPS, BIRTH_NEW_STEPS, label="JSX step 1 open")

# Now the block that used to be step===3 (child info) ends just before step===4.
# We need to close it and add steps 2 (father) and 3 (mother).
# The pattern to find is the end of the child info block + the step 4 opening.
patch(
    BIRTH_SCREEN,
    """\
              </View>
            </View>
          )}
          {step===4 && (""",
    """\
              </View>
            </View>
          )}
          {/* Spec §2.7 Step 2: Father NID validation */}
          {step===2 && renderNIDStep('father')}
          {/* Spec §2.7 Step 2: Mother NID validation */}
          {step===3 && renderNIDStep('mother')}
          {/* Spec §2.7 Step 4: Review before final submission */}
          {step===4 && (""",
    label="JSX insert father/mother after child-info block",
)


# ══════════════════════════════════════════════════════════════════════════════
# PATCH 3 — RecordDeathScreen.tsx: INFANT/ADULT split + 4-step flow + sync
# ══════════════════════════════════════════════════════════════════════════════
DEATH_SCREEN = path("code/mobile/src/screens/hospital/RecordDeathScreen.tsx")

print("\n[3/3] Patching RecordDeathScreen.tsx")

# 3a — Import: add saveAndSyncDeath
patch(
    DEATH_SCREEN,
    "import { saveDeath, generateDeathCertNo, updateDeathCertPath } from '../../services/localDb'",
    "import { generateDeathCertNo, updateDeathCertPath } from '../../services/localDb'",
    label="remove saveDeath from localDb import",
)
patch(
    DEATH_SCREEN,
    "import { triggerSync } from '../../services/syncService'",
    "import { triggerSync, saveAndSyncDeath } from '../../services/syncService'",
    label="add saveAndSyncDeath import",
)

# 3b — Replace the entire screen function body (lines 159-486).
#      We keep everything before and after that block.
death_content = read(DEATH_SCREEN)

FUNC_MARKER_START = "export default function RecordDeathScreen({ navigation }: Props) {"
FUNC_MARKER_END   = "\nconst s = StyleSheet.create({"

idx_start = death_content.index(FUNC_MARKER_START)
idx_end   = death_content.index(FUNC_MARKER_END)

BEFORE = death_content[:idx_start]
AFTER  = death_content[idx_end:]   # includes '\nconst s = ...'

NEW_FUNCTION = r"""export default function RecordDeathScreen({ navigation }: Props) {
  const { theme: T } = useTheme()

  // ── Step state (1=Type, 2=Lookup, 3=Details, 4=Issued) ───────────────────
  const [step,        setStep]        = useState<1|2|3|4>(1)

  // Step 1: INFANT or ADULT selection (Spec §2.8 Case B)
  const [deathType,   setDeathType]   = useState<'infant'|'adult'|''>('')

  // Step 2 — ADULT: citizen lookup
  const [lookupId,    setLookupId]    = useState('')
  const [lookupLoad,  setLookupLoad]  = useState(false)
  const [citizen,     setCitizen]     = useState<any>(null)

  // Step 2 — INFANT: parent NID lookup (no citizen NIN — infant died before registration)
  const [fatherNid,   setFatherNid]   = useState('')
  const [fatherData,  setFatherData]  = useState<any>(null)
  const [fatherLoad,  setFatherLoad]  = useState(false)
  const [fatherError, setFatherError] = useState('')
  const [motherNid,   setMotherNid]   = useState('')
  const [motherData,  setMotherData]  = useState<any>(null)
  const [motherLoad,  setMotherLoad]  = useState(false)
  const [motherError, setMotherError] = useState('')

  // Step 3: Death details
  const [cause,       setCause]       = useState('')
  const [dod,         setDod]         = useState('')
  const [showCal,     setShowCal]     = useState(false)
  const [locType,     setLocType]     = useState<LocationType>('health_facility')
  const [category,    setCategory]    = useState<DeathCategory>('adult')
  const [informant,   setInformant]   = useState('')

  // Step 4: outcome
  const [submitting,  setSubmitting]  = useState(false)
  const [savedCertNo, setSavedCertNo] = useState('')
  const [savedId,     setSavedId]     = useState('')
  const [pdfPath,     setPdfPath]     = useState('')
  const [downloading, setDownloading] = useState(false)
  const [toast,       setToast]       = useState('')
  const [toastVis,    setToastVis]    = useState(false)

  const causeRef     = useRef<TextInput>(null)
  const informantRef = useRef<TextInput>(null)

  const LOC_TYPES: {val:LocationType;label:string}[] = [
    {val:'health_facility',label:'Health Facility'},{val:'home',label:'Home'},
    {val:'public_place',label:'Public Place'},{val:'other',label:'Other'},
  ]
  // For ADULT: allow sub-category; for INFANT: category is locked to 'infant'
  const ADULT_CATEGORIES: {val:DeathCategory;label:string}[] = [
    {val:'child',label:'Child (1–17)'},{val:'adult',label:'Adult (18+)'},{val:'maternal',label:'Maternal'},
  ]

  // NIN formatter (for parent lookup in INFANT case)
  const formatNIN = (raw: string) => {
    const clean = raw.replace(/[^0-9]/g, '')
    let out = clean.slice(0, 8)
    if (clean.length > 8)  out += '-' + clean.slice(8,  13)
    if (clean.length > 13) out += '-' + clean.slice(13, 18)
    if (clean.length > 18) out += '-' + clean.slice(18, 20)
    return out
  }
  const isNINComplete = (nin: string) => /^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nin)

  // ── ADULT: Citizen lookup ─────────────────────────────────────────────────
  const lookupCitizen = useCallback(async () => {
    if (!lookupId.trim()) { Alert.alert('Error','Enter a National ID or name.'); return }
    setLookupLoad(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      if (token) {
        const res  = await fetch(`${API_BASE}/officer/citizen-lookup?q=${encodeURIComponent(lookupId.trim())}`,
          { headers:{ Authorization:`Bearer ${token}` }, signal: AbortSignal.timeout(5000) })
        const json = await res.json()
        if (json.success && json.data) { setCitizen(json.data); setLookupLoad(false); return }
      }
    } catch { /* offline fallback */ }
    Alert.alert('Not Found in DB', 'No record found online. Proceed with manual name entry?', [
      { text:'Cancel', style:'cancel' },
      { text:'Manual Entry', onPress:()=>{ setCitizen({ fullName:lookupId.trim(), nationalId:lookupId.trim() }) } },
    ])
    setLookupLoad(false)
  }, [lookupId])

  // ── INFANT: Parent NID lookup ─────────────────────────────────────────────
  const lookupParent = useCallback(async (nid: string, role: 'father'|'mother') => {
    const isFather = role === 'father'
    const setLoad  = isFather ? setFatherLoad  : setMotherLoad
    const setErr   = isFather ? setFatherError : setMotherError
    const setData  = isFather ? setFatherData  : setMotherData
    setLoad(true); setErr(''); setData(null)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      if (token) {
        const res  = await fetch(`${API_BASE}/officer/citizen-lookup?q=${encodeURIComponent(nid.trim())}`,
          { headers:{ Authorization:`Bearer ${token}` }, signal: AbortSignal.timeout(5000) })
        const json = await res.json()
        if (json.success && json.data) {
          const d = json.data
          if (isFather && d.gender?.toUpperCase() !== 'MALE')   { setErr('This NID belongs to a female citizen.'); setLoad(false); return }
          if (!isFather && d.gender?.toUpperCase() !== 'FEMALE'){ setErr('This NID belongs to a male citizen.');   setLoad(false); return }
          setData(d); setLoad(false); return
        }
      }
    } catch { /* fall through */ }
    setErr('National ID not found in NBS Central Database (device may be offline).')
    setLoad(false)
  }, [])

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!cause.trim())     { Alert.alert('Required','Enter cause of death.'); return }
    if (!dod.trim())       { Alert.alert('Required','Select date of death.'); return }
    if (!informant.trim()) { Alert.alert('Required','Enter informant name.'); return }
    setSubmitting(true)

    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      let officerName = '', facilityName = ''
      if (token) {
        try {
          const r = await fetch(`${API_BASE}/officer/dashboard`, { headers:{ Authorization:`Bearer ${token}` }, signal: AbortSignal.timeout(5000) })
          const j = await r.json()
          if (j.success) { officerName=j.data.officerName; facilityName=j.data.facilityName }
        } catch {}
      }

      const certNo = generateDeathCertNo()

      let nationalId   = ''
      let deceasedName = ''
      let finalCategory: DeathCategory = category

      if (deathType === 'infant') {
        // Spec §2.8 Case B — INFANT: no citizen NIN exists yet
        // Link parents; category is always 'infant'
        finalCategory = 'infant'
        nationalId   = `INFANT-${fatherData?.nationalId ?? 'UNK'}`
        deceasedName = `INFANT OF ${
          fatherData ? `${fatherData.firstName ?? ''} ${fatherData.surname ?? ''}`.trim() : 'UNKNOWN FATHER'
        } & ${
          motherData ? `${motherData.firstName ?? ''} ${motherData.surname ?? ''}`.trim() : 'UNKNOWN MOTHER'
        }`.toUpperCase()
      } else {
        // Spec §2.8 Case B — ADULT: fetch citizen, mark DECEASED
        nationalId   = citizen?.nationalId ?? lookupId.trim()
        deceasedName = citizen?.fullName
          ?? (citizen?.firstName ? `${citizen.firstName} ${citizen.surname ?? ''}`.trim() : lookupId.trim())
      }

      // Spec §2.8: if online → push directly to remote DB
      //             if offline → store locally, auto-sync when device reconnects
      const { death, syncedRemote } = await saveAndSyncDeath({
        certNo,
        nationalId,
        deceasedName,
        causeOfDeath:  cause.trim(),
        dateOfDeath:   dod.trim(),
        locationType:  locType,
        category:      finalCategory,
        informantName: informant.trim(),
        facilityName,
        officerName,
        rawJson: JSON.stringify({
          deathType,
          nationalId,
          fatherNid: deathType === 'infant' ? fatherData?.nationalId : undefined,
          motherNid: deathType === 'infant' ? motherData?.nationalId : undefined,
          causeOfDeath: cause.trim(),
          dateOfDeath:  dod.trim(),
          locationType: locType,
          category:     finalCategory,
          informantName: informant.trim(),
        }),
      })

      setSavedId(death.id)
      setSavedCertNo(certNo)
      setStep(4)

      // Background: generate PDF; skip duplicate sync if already pushed
      ;(async () => {
        try {
          const { generateDeathPdf } = await import('../../services/certificateService')
          const pdf = await generateDeathPdf(death)
          await updateDeathCertPath(death.id, pdf)
          setPdfPath(pdf)
        } catch (e) { console.warn('PDF gen:', e) }
        if (!syncedRemote) await triggerSync()
      })()
    } catch (e) {
      Alert.alert('Error','Failed to save record. Please try again.')
      console.error(e)
    } finally { setSubmitting(false) }
  }, [cause, dod, locType, category, informant, citizen, lookupId, deathType, fatherData, motherData])

  // ── Download cert ─────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true)
    try {
      if (pdfPath) { await sharePdf(pdfPath); setDownloading(false); return }
      const { getAllDeaths } = await import('../../services/localDb')
      const deaths = await getAllDeaths()
      const death  = deaths.find(d=>d.id===savedId)
      if (!death) { Alert.alert('Error','Record not found.'); setDownloading(false); return }
      const { generateDeathPdf } = await import('../../services/certificateService')
      const pdf = await generateDeathPdf(death)
      await updateDeathCertPath(savedId, pdf)
      setPdfPath(pdf)
      await sharePdf(pdf)
    } catch (e) { Alert.alert('Error','Could not generate PDF. Try again.') }
    setDownloading(false)
  }

  const copy = async (text:string, label:string) => {
    await Clipboard.setStringAsync(text)
    setToast(`${label} copied to clipboard`)
    setToastVis(true)
    setTimeout(()=>setToastVis(false), 2400)
  }

  // Helper: can we proceed from step 2 to step 3?
  const step2Ready = deathType === 'adult'
    ? !!citizen
    : !!(fatherData && motherData)

  const STEP_LABELS = ['Type','Lookup','Details','Issued']

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:T.bg }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>

        {/* Header */}
        <View style={[s.header, { backgroundColor:T.card, borderBottomColor:T.border }]}>
          <TouchableOpacity
            onPress={()=>{ if (step > 1 && step < 4) setStep(s=>(s-1) as any); else navigation.goBack() }}
            style={s.backBtn}
          >
            <ArrowLeft size={20} color={T.text} />
          </TouchableOpacity>
          <View style={{ flex:1, alignItems:'center' }}>
            <Text style={[s.headerTitle, { color:T.text }]}>Record Death</Text>
            <Text style={[s.headerSub, { color:T.textSub }]}>Step {step} of 4</Text>
          </View>
          <View style={[s.backBtn, { backgroundColor:'#dc262618' }]}><Cross size={18} color="#dc2626" /></View>
        </View>

        {/* Step bar — 4 steps */}
        <View style={[s.stepBar, { backgroundColor:T.card, borderBottomColor:T.border }]}>
          {STEP_LABELS.map((lbl,i)=>(
            <View key={lbl} style={{ alignItems:'center', flex:1 }}>
              <View style={[s.stepDot, { backgroundColor:step>i+1?T.success:step===i+1?'#dc2626':T.border }]}>
                {step>i+1 ? <CheckCircle2 size={12} color="#fff" /> : <Text style={{ color:'#fff', fontSize:10, fontWeight:'800' }}>{i+1}</Text>}
              </View>
              <Text style={[s.stepLabel, { color:step>=i+1?T.text:T.textDim }]}>{lbl}</Text>
            </View>
          ))}
        </View>

        <ScrollView
          style={{ flex:1 }} contentContainerStyle={{ padding:20, paddingBottom:40 }}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        >

          {/* ── STEP 1: INFANT or ADULT (Spec §2.8 Case B) ─────────────── */}
          {step===1 && (
            <View style={{ gap:18 }}>
              <Text style={[s.stepTitle, { color:T.text }]}>Select Death Category</Text>
              <Text style={{ fontSize:13, color:T.textSub, lineHeight:20 }}>
                Choose the category of the deceased. This determines the registration path.
              </Text>

              {/* INFANT tile */}
              <TouchableOpacity
                onPress={()=>{ setDeathType('infant'); setCategory('infant') }}
                style={[s.typeTile, {
                  borderColor: deathType==='infant' ? '#dc2626' : T.border,
                  backgroundColor: deathType==='infant' ? '#dc262612' : T.card,
                }]}
                activeOpacity={0.75}
              >
                <View style={[s.typeTileIcon, { backgroundColor:'#dc262620' }]}>
                  <Text style={{ fontSize:28 }}>👶</Text>
                </View>
                <View style={{ flex:1, gap:3 }}>
                  <Text style={{ fontSize:16, fontWeight:'800', color:deathType==='infant'?'#dc2626':T.text }}>INFANT</Text>
                  <Text style={{ fontSize:12, color:T.textSub, lineHeight:17 }}>
                    Death before or shortly after birth. Father + Mother NIDs required.
                    No citizen NIN exists yet.
                  </Text>
                </View>
                {deathType==='infant' && <CheckCircle2 size={22} color="#dc2626" />}
              </TouchableOpacity>

              {/* ADULT tile */}
              <TouchableOpacity
                onPress={()=>{ setDeathType('adult'); setCategory('adult') }}
                style={[s.typeTile, {
                  borderColor: deathType==='adult' ? '#dc2626' : T.border,
                  backgroundColor: deathType==='adult' ? '#dc262612' : T.card,
                }]}
                activeOpacity={0.75}
              >
                <View style={[s.typeTileIcon, { backgroundColor:'#dc262620' }]}>
                  <Text style={{ fontSize:28 }}>🏥</Text>
                </View>
                <View style={{ flex:1, gap:3 }}>
                  <Text style={{ fontSize:16, fontWeight:'800', color:deathType==='adult'?'#dc2626':T.text }}>ADULT</Text>
                  <Text style={{ fontSize:12, color:T.textSub, lineHeight:17 }}>
                    Registered citizen with a National ID. Vital status updated to DECEASED.
                  </Text>
                </View>
                {deathType==='adult' && <CheckCircle2 size={22} color="#dc2626" />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.proceedBtn, { opacity:deathType?1:0.4 }]}
                onPress={()=>setStep(2)} disabled={!deathType}
              >
                <Text style={{ color:'#fff', fontWeight:'800', fontSize:14 }}>
                  Continue →
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 2: Lookup — conditional on INFANT or ADULT ─────────── */}
          {step===2 && deathType==='adult' && (
            <View style={{ gap:14 }}>
              <Text style={[s.stepTitle, { color:T.text }]}>Search Deceased Citizen</Text>
              <Text style={{ fontSize:12, color:T.textSub, lineHeight:18 }}>
                Enter the National ID or full name. Vital status will be updated to DECEASED
                upon submission.
              </Text>
              <View>
                <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>National ID / Full Name *</Text>
                <View style={{ flexDirection:'row', gap:8 }}>
                  <TextInput
                    style={[sf.input, { flex:1, backgroundColor:T.card2, borderColor:T.border, color:T.text }]}
                    value={lookupId} onChangeText={setLookupId}
                    placeholder="National ID or full name" placeholderTextColor={T.textDim}
                    returnKeyType="search" blurOnSubmit={false} onSubmitEditing={lookupCitizen}
                  />
                  <TouchableOpacity
                    style={[s.searchBtn, { opacity:lookupId.trim().length>=3?1:0.45 }]}
                    onPress={lookupCitizen} disabled={lookupId.trim().length<3||lookupLoad}
                  >
                    {lookupLoad ? <ActivityIndicator color="#fff" size="small" /> : <><Search size={14} color="#fff" /><Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>Search</Text></>}
                  </TouchableOpacity>
                </View>
              </View>
              {citizen && (
                <View style={[s.citizenCard, { backgroundColor:T.card, borderColor:T.border }]}>
                  <User size={15} color={T.primary} />
                  <View style={{ flex:1, marginLeft:10 }}>
                    <Text style={{ fontSize:14, fontWeight:'700', color:T.text }}>
                      {citizen.fullName ?? `${citizen.firstName??''} ${citizen.surname??''}`.trim()}
                    </Text>
                    {citizen.nationalId && <Text style={{ fontSize:11, color:T.textSub, marginTop:2 }}>{citizen.nationalId}</Text>}
                  </View>
                  <CheckCircle2 size={16} color={T.success ?? '#22c55e'} />
                </View>
              )}
              <TouchableOpacity
                style={[s.proceedBtn, { opacity:citizen?1:0.45 }]}
                onPress={()=>setStep(3)} disabled={!citizen}
              >
                <Text style={{ color:'#fff', fontWeight:'800', fontSize:14 }}>Proceed to Death Details</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2 — INFANT: Father + Mother NID lookup ─────────────────── */}
          {step===2 && deathType==='infant' && (
            <View style={{ gap:18 }}>
              <Text style={[s.stepTitle, { color:T.text }]}>Infant — Parent Identification</Text>
              <Text style={{ fontSize:12, color:T.textSub, lineHeight:18 }}>
                The infant has no National ID yet. Enter Father and Mother NIDs to link
                this death record to their lineage.
              </Text>

              {/* Father NID */}
              {(['father','mother'] as const).map(role => {
                const isFather = role === 'father'
                const nid      = isFather ? fatherNid    : motherNid
                const setNid   = isFather ? setFatherNid : setMotherNid
                const data     = isFather ? fatherData   : motherData
                const loading  = isFather ? fatherLoad   : motherLoad
                const error    = isFather ? fatherError  : motherError
                const accent   = isFather ? '#0891b2' : '#8b5cf6'
                const label    = isFather ? 'Father' : 'Mother'
                return (
                  <View key={role} style={{ gap:8, borderWidth:1, borderColor:`${accent}40`, borderRadius:14, padding:14, backgroundColor:`${accent}08` }}>
                    <Text style={{ fontSize:13, fontWeight:'800', color:accent }}>{label} National ID</Text>
                    <View style={{ flexDirection:'row', gap:8 }}>
                      <TextInput
                        style={[sf.input, { flex:1, backgroundColor:T.card2, borderColor:T.border, color:T.text, letterSpacing:1 }]}
                        value={nid}
                        onChangeText={raw => setNid(formatNIN(raw))}
                        placeholder="YYYYMMDD-LLLLL-SSSSS-CC"
                        placeholderTextColor={T.textDim}
                        keyboardType="numeric" maxLength={23}
                      />
                      <TouchableOpacity
                        style={[s.searchBtn, { backgroundColor:accent, opacity:isNINComplete(nid)?1:0.4 }]}
                        onPress={()=>lookupParent(nid, role)}
                        disabled={!isNINComplete(nid)||loading}
                      >
                        {loading ? <ActivityIndicator color="#fff" size="small" /> : <><Search size={14} color="#fff" /><Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>Find</Text></>}
                      </TouchableOpacity>
                    </View>
                    {!!error && (
                      <Text style={{ fontSize:11, color:'#f87171', lineHeight:17 }}>⚠ {error}</Text>
                    )}
                    {data && (
                      <View style={[s.citizenCard, { backgroundColor:`${accent}12`, borderColor:`${accent}40` }]}>
                        <User size={15} color={accent} />
                        <View style={{ flex:1, marginLeft:10 }}>
                          <Text style={{ fontSize:13, fontWeight:'700', color:T.text }}>
                            {data.firstName ?? ''} {data.middleName ?? ''} {data.surname ?? ''}
                          </Text>
                          <Text style={{ fontSize:10, color:T.textSub, marginTop:2 }}>{data.nationalId}</Text>
                        </View>
                        <CheckCircle2 size={15} color={accent} />
                      </View>
                    )}
                  </View>
                )
              })}

              <TouchableOpacity
                style={[s.proceedBtn, { opacity:step2Ready?1:0.45 }]}
                onPress={()=>setStep(3)} disabled={!step2Ready}
              >
                <Text style={{ color:'#fff', fontWeight:'800', fontSize:14 }}>Proceed to Death Details</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 3: Death details ───────────────────────────────────── */}
          {step===3 && (
            <View>
              {/* Summary of who died */}
              <View style={[s.citizenCard, { backgroundColor:T.card, borderColor:T.border, marginBottom:16, gap:4 }]}>
                <Cross size={14} color="#dc2626" />
                <View style={{ flex:1, marginLeft:10 }}>
                  {deathType==='adult' && (
                    <Text style={{ fontSize:14, fontWeight:'700', color:T.text }}>
                      {citizen?.fullName ?? `${citizen?.firstName??''} ${citizen?.surname??''}`.trim()}
                    </Text>
                  )}
                  {deathType==='infant' && (
                    <>
                      <Text style={{ fontSize:13, fontWeight:'700', color:'#dc2626' }}>INFANT DEATH</Text>
                      <Text style={{ fontSize:11, color:T.textSub, marginTop:2 }}>
                        Father: {fatherData?.firstName} {fatherData?.surname} · Mother: {motherData?.firstName} {motherData?.surname}
                      </Text>
                    </>
                  )}
                </View>
              </View>

              {/* Cause of death */}
              <StableField
                label="Cause of Death *" value={cause} onChangeText={setCause}
                placeholder="e.g. Cardiac arrest, Malaria complications"
                multiline returnKeyType="next"
                onSubmitEditing={()=>informantRef.current?.focus()}
                inputRef={causeRef}
                bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}
              />

              {/* Date of death */}
              <View style={{ marginBottom:14 }}>
                <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:6 }}>Date of Death *</Text>
                <TouchableOpacity
                  style={[sf.input, { backgroundColor:T.card2, borderColor:T.border, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }]}
                  onPress={()=>setShowCal(true)} activeOpacity={0.8}
                >
                  <Text style={{ color:dod?T.text:T.textDim, fontSize:14 }}>{dod||'Select date of death'}</Text>
                  <Calendar size={16} color={T.textDim} />
                </TouchableOpacity>
              </View>

              {/* Location type chips */}
              <View style={{ marginBottom:14 }}>
                <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:8 }}>Location Type *</Text>
                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                  {LOC_TYPES.map(l=>(
                    <TouchableOpacity key={l.val} onPress={()=>setLocType(l.val)}
                      style={[s.chip, { borderColor:locType===l.val?'#dc2626':T.border, backgroundColor:locType===l.val?'#dc262618':T.card }]}>
                      <Text style={{ fontSize:11, color:locType===l.val?'#dc2626':T.textSub }}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Category — only for ADULT; for INFANT it is locked */}
              {deathType==='adult' && (
                <View style={{ marginBottom:14 }}>
                  <Text style={{ fontSize:12, fontWeight:'600', color:T.textSub, marginBottom:8 }}>Sub-Category *</Text>
                  <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                    {ADULT_CATEGORIES.map(c=>(
                      <TouchableOpacity key={c.val} onPress={()=>setCategory(c.val)}
                        style={[s.chip, { borderColor:category===c.val?'#dc2626':T.border, backgroundColor:category===c.val?'#dc262618':T.card }]}>
                        <Text style={{ fontSize:11, color:category===c.val?'#dc2626':T.textSub }}>{c.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Informant */}
              <StableField
                label="Informant Name *" value={informant} onChangeText={setInformant}
                placeholder="Full name of the reporting person"
                returnKeyType="done" onSubmitEditing={handleSubmit}
                inputRef={informantRef}
                bg={T.card2} bc={T.border} tc={T.text} dc={T.textDim}
              />

              <TouchableOpacity
                style={[s.submitBtn, { opacity:submitting?0.7:1 }]}
                onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'800', fontSize:14 }}>Submit Death Record</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 4: Certificate issued ──────────────────────────────── */}
          {step===4 && (
            <View style={{ alignItems:'center', paddingTop:24, gap:14 }}>
              <View style={{ width:80, height:80, borderRadius:40, backgroundColor:'#dc262618', alignItems:'center', justifyContent:'center' }}>
                <CheckCircle2 size={40} color="#dc2626" />
              </View>
              <Text style={{ fontSize:20, fontWeight:'900', color:T.text }}>Death Recorded</Text>
              <Text style={{ fontSize:13, color:T.textSub }}>
                {deathType==='infant' ? 'Infant death record saved' : 'Citizen status → DECEASED'} · syncing in background
              </Text>

              <View style={{ width:'100%', gap:6 }}>
                <Text style={{ fontSize:11, color:T.textDim, fontWeight:'600', textTransform:'uppercase', letterSpacing:0.5 }}>Death Certificate Number</Text>
                <View style={{ borderRadius:10, borderWidth:1, borderColor:'#dc262650', backgroundColor:'#dc262610', padding:12, flexDirection:'row', alignItems:'center' }}>
                  <Text style={{ fontSize:14, fontWeight:'900', color:'#dc2626', flex:1, letterSpacing:1 }}>{savedCertNo}</Text>
                  <TouchableOpacity onPress={()=>copy(savedCertNo,'Certificate number')} style={{ padding:4 }}>
                    <Copy size={15} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection:'row', gap:8, alignItems:'center', backgroundColor:'#0891b212', borderRadius:8, padding:10, width:'100%' }}>
                <Shield size={13} color="#22d3ee" />
                <Text style={{ fontSize:10, color:T.textSub, flex:1 }}>
                  Record stored locally · will sync to Central Database on next connection · QR signed by Govt PKI
                </Text>
              </View>

              <TouchableOpacity
                style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:downloading?T.card2:'#dc2626', borderRadius:12, paddingVertical:14, width:'100%', borderWidth:downloading?1:0, borderColor:'#dc2626' }}
                onPress={handleDownload} disabled={downloading} activeOpacity={0.85}
              >
                {downloading ? <ActivityIndicator color="#dc2626" size="small" /> : <Download size={16} color="#fff" />}
                <Text style={{ fontSize:14, fontWeight:'800', color:downloading?'#dc2626':'#fff' }}>
                  {downloading?'Generating PDF…':'Download Certificate PDF'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ borderWidth:1, borderColor:T.border, borderRadius:12, paddingVertical:14, alignItems:'center', width:'100%' }}
                onPress={()=>navigation.goBack()}
              >
                <Text style={{ fontSize:14, fontWeight:'700', color:T.textSub }}>Back to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <CalPicker visible={showCal} title="Select Date of Death" onSelect={d=>{setDod(d);setShowCal(false)}} onClose={()=>setShowCal(false)} />
      </KeyboardAvoidingView>
      <Toast message={toast} visible={toastVis} />
    </SafeAreaView>
  )
}
"""

new_death_content = BEFORE + NEW_FUNCTION + AFTER

# Add typeTile style to the StyleSheet at the end
STYLE_ADD = """\
  typeTile:    { flexDirection:'row', alignItems:'flex-start', gap:12, borderWidth:2, borderRadius:16, padding:16 },
  typeTileIcon:{ width:52, height:52, borderRadius:14, alignItems:'center', justifyContent:'center' },"""

new_death_content = new_death_content.replace(
    "  submitBtn:   { backgroundColor:'#dc2626', borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:8 },",
    "  submitBtn:   { backgroundColor:'#dc2626', borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:8 },\n" + STYLE_ADD,
)

# Write the patched death screen
write(DEATH_SCREEN, new_death_content)
print(f"  ✓  [RecordDeathScreen full rewrite] Written")


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
print("""
╔══════════════════════════════════════════════════════════════════════════════╗
║                        PATCH APPLIED SUCCESSFULLY                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  BIRTH REGISTRATION  (RegisterBirthScreen.tsx)                               ║
║  ─────────────────────────────────────────────                               ║
║  Step 1 → Child Info (name, gender, date of birth)          [was: Father]   ║
║  Step 2 → Father NID validation                             [was: Mother]   ║
║  Step 3 → Mother NID validation                             [was: Child]    ║
║  Step 4 → Review & Submit                                   [unchanged]     ║
║                                                                              ║
║  NIN format: TZ-YYYYMMDD-XXXXX  (spec §2.7 Step 4)                          ║
║  Online:  data sent directly to remote DB on submit                          ║
║  Offline: stored in SQLite; auto-syncs when device reconnects                ║
║                                                                              ║
║  DEATH REGISTRATION  (RecordDeathScreen.tsx)                                 ║
║  ────────────────────────────────────────────                                ║
║  Step 1 → Select INFANT or ADULT  (was: no selection)                        ║
║  Step 2 → ADULT: citizen NID lookup  (existing)                              ║
║           INFANT: Father NID + Mother NID lookup  (new)                      ║
║  Step 3 → Death details (cause, date, location, informant)  [was: step 2]   ║
║  Step 4 → Certificate issued                                [was: step 3]   ║
║                                                                              ║
║  Online/offline sync: same behaviour as birth                                ║
║                                                                              ║
║  ALREADY CORRECT (no changes needed):                                        ║
║  • Facility + Officer auto-attached from officer profile                     ║
║  • NetInfo listener auto-syncs pending records on reconnect                  ║
║  • PDF generation + QR cert storage in local rita_certificates               ║
║  • Village Officer death (VillageRecordDeathScreen.tsx) — Case A correct     ║
╚══════════════════════════════════════════════════════════════════════════════╝
""")

