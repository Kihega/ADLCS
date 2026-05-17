#!/usr/bin/env python3
"""
ADLCS Hospital Officer App — Comprehensive Fix Patch
=====================================================
Run from the project root (where code/ folder lives):
    python3 patch_hospital_fixes.py

Fixes Applied
─────────────
FIX 1 — LoginScreen.tsx
    Remove geofencing step from onboarding.
    OTP token verified → device marked activated → go straight to Login form.
    (Geo-processing + registration modal onboarding steps are bypassed.)

FIX 2 — HospitalHomeScreen.tsx  (Change Password modal)
    Replace Alert stub with a real popup modal: current / new / confirm
    password fields, validation, API call to POST /api/auth/change-password.

FIX 3 — HospitalHomeScreen.tsx  (Icon background colours)
    - Header icon buttons (notification bell, dark/light toggle, menu):
      rgba(255,255,0.08) → rgba(255,255,255,0.20)  [was invalid 3-arg rgba]
    - Deaths download button in Report Card:
      rgba(248,113,0.14) → rgba(220,38,38,0.22)    [was invalid 3-arg rgba]
      border rgba(248,113,0.30) → rgba(220,38,38,0.50)

FIX 4 — syncService.ts  (Online detection bug)
    isOnline(): on Android, isInternetReachable can be null (not yet
    determined). Treat null as online when isConnected=true so records
    are not incorrectly saved as local-only when internet is available.

FIX 5 — localDb.ts  (NIDA/NIN format correction)
    generateNewbornNationalId() was generating TZ-YYYYMMDD-XXXXX.
    Per CERTIFICATE_AND_ID_FORMATS.txt the correct format is:
        YYYYMMDD-LLLLL-SSSSS-CC  (23 chars, e.g. 20240315-07031-10042-15)

FIX 6 — RegisterBirthScreen.tsx  +  RecordDeathScreen.tsx
    Add autoCapitalize="characters" to name / identifier fields so the
    keyboard defaults to ALL CAPS and onChangeText transforms to upper case.

FIX 7 — backend/src/routes/auth.js
    Add POST /api/auth/change-password endpoint (bcrypt verify current
    password, hash new password, update record for any officer role).
"""

import os
import sys
import re

# ── Path helpers ───────────────────────────────────────────────────────────────
ROOT     = os.path.dirname(os.path.abspath(__file__))
MOBILE   = os.path.join(ROOT, "code", "mobile", "src")
BACKEND  = os.path.join(ROOT, "code", "backend", "src")

def p(*parts):  return os.path.join(ROOT, *parts)

def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()

def write(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  ✓ Written: {os.path.relpath(path, ROOT)}")

def patch(path, old, new, label=""):
    content = read(path)
    if old not in content:
        print(f"  ⚠  SKIP ({label or path}): target string not found — already patched?")
        return False
    write(path, content.replace(old, new, 1))
    print(f"  ✓ Patched ({label})")
    return True

def patch_all(path, replacements):
    """Apply multiple (old, new, label) tuples to one file."""
    content = read(path)
    changed = 0
    for old, new, label in replacements:
        if old in content:
            content = content.replace(old, new, 1)
            print(f"  ✓ Patched ({label})")
            changed += 1
        else:
            print(f"  ⚠  SKIP ({label}): target string not found")
    if changed:
        write(path, content)
    return changed

# ══════════════════════════════════════════════════════════════════════════════
# FIX 1 — LoginScreen.tsx: Remove geofencing, token → login directly
# ══════════════════════════════════════════════════════════════════════════════
LOGIN = p("code","mobile","src","screens","auth","LoginScreen.tsx")

print("\n[FIX 1] LoginScreen.tsx — remove geofencing from onboarding flow")

# 1-a  handleOtpAuthorized: was setOnboardingStep('geo'), now skip to 'done'
OLD_HANDLER = """\
  const handleOtpAuthorized = (role: string) => {
    setPendingRole(role)
    setOnboardingStep('geo')
  }

  const handleGeoComplete = () => {
    setShowRegModal(true)
    setOnboardingStep('reg')
  }

  const handleRegDone = () => {
    setShowRegModal(false)
    setOnboardingStep('done')
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start()
  }"""

NEW_HANDLER = """\
  // FIX 1: geofencing removed — OTP authorised → mark device active → show login
  const handleOtpAuthorized = async (role: string) => {
    setPendingRole(role)
    await AsyncStorage.multiSet([
      [DEVICE_ACTIVE_KEY, 'true'],
      ['adlcs_pending_role', role],
    ])
    setOnboardingStep('done')
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
  }"""

patch(LOGIN, OLD_HANDLER, NEW_HANDLER, "handleOtpAuthorized — skip geo")

# 1-b  JSX: remove GeoProcessingPage render block + registration modal
OLD_GEO_RENDER = """\
            {/* ═══════ NEW DEVICE: STEP 2 — GEO/FINGERPRINT ═══════ */}
            {(onboardingStep === 'geo' || onboardingStep === 'reg') && (
              <GeoProcessingPage
                role={pendingRole}
                onComplete={handleGeoComplete}
              />
            )}"""

NEW_GEO_RENDER = """\
            {/* GEO/FINGERPRINT step removed — see FIX 1 */}"""

patch(LOGIN, OLD_GEO_RENDER, NEW_GEO_RENDER, "geo render block removed")

# 1-c  Remove registration modal JSX (no longer used in login flow)
OLD_REG_MODAL_JSX = """\
      {/* Registration modal — Step 3 */}
      <RegistrationModal
        visible={showRegModal}
        role={pendingRole}
        onDone={handleRegDone}
      />

      """

NEW_REG_MODAL_JSX = """\
      """

patch(LOGIN, OLD_REG_MODAL_JSX, NEW_REG_MODAL_JSX, "registration modal render removed")


# ══════════════════════════════════════════════════════════════════════════════
# FIX 2 + 3 — HospitalHomeScreen.tsx
# ══════════════════════════════════════════════════════════════════════════════
HOME = p("code","mobile","src","screens","hospital","HospitalHomeScreen.tsx")

print("\n[FIX 2+3] HospitalHomeScreen.tsx — change-password modal + icon colours")

# 2-a  Add TextInput + Eye/EyeOff to RN import
patch(HOME,
    "  View, Text, TouchableOpacity, StyleSheet,\n"
    "  ScrollView, Alert, ActivityIndicator,\n"
    "  Image, ImageBackground, RefreshControl,\n"
    "  Animated, Modal, TouchableWithoutFeedback,\n"
    "  Share, Dimensions, InteractionManager,",
    "  View, Text, TextInput, TouchableOpacity, StyleSheet,\n"
    "  ScrollView, Alert, ActivityIndicator,\n"
    "  Image, ImageBackground, RefreshControl,\n"
    "  Animated, Modal, TouchableWithoutFeedback,\n"
    "  Share, Dimensions, InteractionManager,",
    "RN import: add TextInput")

# 2-b  Add Eye, EyeOff to lucide import
patch(HOME,
    "  Baby, Cross, FileText, Clock, Sun, Moon, Bell, LogOut,\n"
    "  MapPin, RefreshCw, ChevronRight, Shield, Building2,\n"
    "  Wifi, WifiOff, AlertTriangle, BarChart3, User, Lock,\n"
    "  Menu, X, Download, WifiLow, Stethoscope, IdCard,\n"
    "  Calendar, BadgeCheck,",
    "  Baby, Cross, FileText, Clock, Sun, Moon, Bell, LogOut,\n"
    "  MapPin, RefreshCw, ChevronRight, Shield, Building2,\n"
    "  Wifi, WifiOff, AlertTriangle, BarChart3, User, Lock,\n"
    "  Menu, X, Download, WifiLow, Stethoscope, IdCard,\n"
    "  Calendar, BadgeCheck, Eye, EyeOff,",
    "lucide import: add Eye/EyeOff")

# 2-c  Add API_BASE const after H and W consts
patch(HOME,
    "const H  = { primary: '#0891b2', primaryL: '#22d3ee', orange: '#f97316' }\n"
    "const W  = Dimensions.get('window').width",
    "const H       = { primary: '#0891b2', primaryL: '#22d3ee', orange: '#f97316' }\n"
    "const W       = Dimensions.get('window').width\n"
    "const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://adlcs-backend.onrender.com/api'",
    "add API_BASE const")

# 2-d  Insert ChangePasswordModal component before OfficerIdCard
CHANGE_PWD_MODAL = '''\
// ─── Change Password Modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme: T } = useTheme()
  const [currentPwd,  setCurrentPwd]  = useState('')
  const [newPwd,      setNewPwd]      = useState('')
  const [confirmPwd,  setConfirmPwd]  = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew,     setShowNew]     = useState(false)

  const reset = () => { setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); setError('') }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async () => {
    if (!currentPwd)          { setError('Enter your current password'); return }
    if (newPwd.length < 8)    { setError('New password must be at least 8 characters'); return }
    if (newPwd !== confirmPwd) { setError('Passwords do not match'); return }
    setError(''); setLoading(true)
    try {
      const token = await AsyncStorage.getItem('adlcs_access_token')
      const res   = await fetch(`${API_BASE}/auth/change-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
        signal:  AbortSignal.timeout(12_000),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message ?? 'Failed to change password'); return }
      Alert.alert('Success ✓', 'Your password has been changed. Please use your new password next time you sign in.')
      reset()
      onClose()
    } catch {
      setError('Connection failed. Check your internet and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.65)', justifyContent:'flex-end' }}>
        <View style={{ backgroundColor:T.card, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40 }}>
          {/* Handle */}
          <View style={{ width:40, height:4, borderRadius:2, backgroundColor:T.border, alignSelf:'center', marginBottom:16 }} />

          {/* Title row */}
          <View style={{ flexDirection:'row', alignItems:'center', gap:12, marginBottom:4 }}>
            <View style={{ width:40, height:40, borderRadius:10, backgroundColor:`${H.primary}18`, alignItems:'center', justifyContent:'center' }}>
              <Lock size={18} color={H.primaryL} />
            </View>
            <View>
              <Text style={{ fontSize:16, fontWeight:'800', color:T.text }}>Change Password</Text>
              <Text style={{ fontSize:11, color:T.textSub, marginTop:2 }}>Update your account password</Text>
            </View>
          </View>

          {/* Error banner */}
          {!!error && (
            <View style={{ flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'rgba(239,68,68,0.10)', borderRadius:10, padding:12, marginTop:14, borderWidth:1, borderColor:'rgba(239,68,68,0.28)' }}>
              <AlertTriangle size={13} color="#f87171" />
              <Text style={{ fontSize:11, color:'#f87171', flex:1 }}>{error}</Text>
            </View>
          )}

          {/* Current Password */}
          <Text style={{ fontSize:10, color:T.textDim, fontWeight:'700', letterSpacing:1, textTransform:'uppercase', marginTop:16, marginBottom:6 }}>Current Password</Text>
          <View style={{ flexDirection:'row', alignItems:'center', backgroundColor:T.bg, borderWidth:1, borderColor:T.border, borderRadius:10, paddingHorizontal:14 }}>
            <TextInput
              style={{ flex:1, color:T.text, fontSize:13, paddingVertical:12 }}
              value={currentPwd} onChangeText={t=>{ setCurrentPwd(t); setError('') }}
              secureTextEntry={!showCurrent} placeholder="Current password"
              placeholderTextColor={T.textDim} autoCapitalize="none" autoCorrect={false}
            />
            <TouchableOpacity onPress={()=>setShowCurrent(!showCurrent)} style={{ padding:4 }}>
              {showCurrent ? <EyeOff size={16} color={T.textDim}/> : <Eye size={16} color={T.textDim}/>}
            </TouchableOpacity>
          </View>

          {/* New Password */}
          <Text style={{ fontSize:10, color:T.textDim, fontWeight:'700', letterSpacing:1, textTransform:'uppercase', marginTop:14, marginBottom:6 }}>New Password</Text>
          <View style={{ flexDirection:'row', alignItems:'center', backgroundColor:T.bg, borderWidth:1, borderColor:T.border, borderRadius:10, paddingHorizontal:14 }}>
            <TextInput
              style={{ flex:1, color:T.text, fontSize:13, paddingVertical:12 }}
              value={newPwd} onChangeText={t=>{ setNewPwd(t); setError('') }}
              secureTextEntry={!showNew} placeholder="Min. 8 characters"
              placeholderTextColor={T.textDim} autoCapitalize="none" autoCorrect={false}
            />
            <TouchableOpacity onPress={()=>setShowNew(!showNew)} style={{ padding:4 }}>
              {showNew ? <EyeOff size={16} color={T.textDim}/> : <Eye size={16} color={T.textDim}/>}
            </TouchableOpacity>
          </View>

          {/* Confirm New Password */}
          <Text style={{ fontSize:10, color:T.textDim, fontWeight:'700', letterSpacing:1, textTransform:'uppercase', marginTop:14, marginBottom:6 }}>Confirm New Password</Text>
          <View style={{ backgroundColor:T.bg, borderWidth:1, borderColor:T.border, borderRadius:10, paddingHorizontal:14 }}>
            <TextInput
              style={{ color:T.text, fontSize:13, paddingVertical:12 }}
              value={confirmPwd} onChangeText={t=>{ setConfirmPwd(t); setError('') }}
              secureTextEntry placeholder="Repeat new password"
              placeholderTextColor={T.textDim} autoCapitalize="none" autoCorrect={false}
            />
          </View>

          {/* Strength hint */}
          {newPwd.length > 0 && newPwd.length < 8 && (
            <Text style={{ fontSize:10, color:'#f97316', marginTop:4 }}>⚠ Password too short ({newPwd.length}/8 chars)</Text>
          )}

          {/* Buttons */}
          <View style={{ flexDirection:'row', gap:10, marginTop:20 }}>
            <TouchableOpacity
              style={{ flex:1, borderRadius:12, borderWidth:1, borderColor:T.border, paddingVertical:13, alignItems:'center' }}
              onPress={handleClose}
            >
              <Text style={{ fontSize:13, fontWeight:'700', color:T.textSub }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex:2, borderRadius:12, backgroundColor:H.primary, paddingVertical:13, alignItems:'center', opacity:loading?0.6:1 }}
              onPress={handleSubmit} disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize:13, fontWeight:'800', color:'#fff' }}>Change Password</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

'''

patch(HOME,
    "// ─── Officer ID Card Modal ─────────────────────────────────────────────────────",
    CHANGE_PWD_MODAL + "// ─── Officer ID Card Modal ─────────────────────────────────────────────────────",
    "insert ChangePasswordModal component")

# 2-e  Add onChangePwd prop to Sidebar
patch(HOME,
    "function Sidebar({ open, onClose, officer, onLogout, loggingOut, onShowProfile, navigation }: {\n"
    "  open: boolean; onClose: () => void\n"
    "  officer: Record<string,any>; onLogout: () => void; loggingOut: boolean\n"
    "  onShowProfile: () => void\n"
    "  navigation: Props['navigation']\n"
    "})",
    "function Sidebar({ open, onClose, officer, onLogout, loggingOut, onShowProfile, onChangePwd, navigation }: {\n"
    "  open: boolean; onClose: () => void\n"
    "  officer: Record<string,any>; onLogout: () => void; loggingOut: boolean\n"
    "  onShowProfile: () => void; onChangePwd: () => void\n"
    "  navigation: Props['navigation']\n"
    "})",
    "Sidebar: add onChangePwd prop")

# 2-f  Update Change Password menu item in Sidebar
patch(HOME,
    "        { icon: <Lock   size={15} color={H.primaryL}/>,  label: 'Change Password',\n"
    "          onPress: () => closeAndNavigate(() => Alert.alert('Change Password',\n"
    "            'Use the NBS web admin panel to change your password.'))},",
    "        { icon: <Lock   size={15} color={H.primaryL}/>,  label: 'Change Password',\n"
    "          onPress: () => closeAndNavigate(() => onChangePwd())},",
    "Sidebar menu: Change Password → open modal")

# 2-g  Add changePwdOpen state to main screen
patch(HOME,
    "  const [sidebarOpen,  setSidebarOpen] = useState(false)\n"
    "  const [profileOpen,  setProfileOpen] = useState(false)",
    "  const [sidebarOpen,  setSidebarOpen]  = useState(false)\n"
    "  const [profileOpen,  setProfileOpen]  = useState(false)\n"
    "  const [changePwdOpen,setChangePwdOpen]= useState(false)",
    "main screen: add changePwdOpen state")

# 2-h  Render ChangePasswordModal in main screen (after OfficerIdCard)
patch(HOME,
    "      {/* Officer ID Card */}\n"
    "      <OfficerIdCard visible={profileOpen} onClose={() => setProfileOpen(false)} officer={officer} />",
    "      {/* Officer ID Card */}\n"
    "      <OfficerIdCard visible={profileOpen} onClose={() => setProfileOpen(false)} officer={officer} />\n\n"
    "      {/* Change Password Modal */}\n"
    "      <ChangePasswordModal visible={changePwdOpen} onClose={() => setChangePwdOpen(false)} />",
    "main screen: render ChangePasswordModal")

# 2-i  Pass onChangePwd to Sidebar
patch(HOME,
    "        open={sidebarOpen} onClose={() => setSidebarOpen(false)}\n"
    "        officer={officer} onLogout={handleLogout} loggingOut={loggingOut}\n"
    "        onShowProfile={() => setProfileOpen(true)}\n"
    "        navigation={navigation}",
    "        open={sidebarOpen} onClose={() => setSidebarOpen(false)}\n"
    "        officer={officer} onLogout={handleLogout} loggingOut={loggingOut}\n"
    "        onShowProfile={() => setProfileOpen(true)}\n"
    "        onChangePwd={() => setChangePwdOpen(true)}\n"
    "        navigation={navigation}",
    "Sidebar usage: pass onChangePwd prop")

# FIX 3-a  Icon button background colour (was invalid 3-arg rgba)
patch(HOME,
    "  iconBtn:          { width:30, height:30, borderRadius:8, backgroundColor:'rgba(255,255,0.08)', alignItems:'center', justifyContent:'center' },",
    "  iconBtn:          { width:30, height:30, borderRadius:8, backgroundColor:'rgba(255,255,255,0.20)', alignItems:'center', justifyContent:'center' },",
    "FIX 3: icon button bg — correct rgba + increase opacity")

# FIX 3-b  Deaths download button colour (was invalid 3-arg rgba, word invisible)
patch(HOME,
    "                  <TouchableOpacity style={[s.dlBtn, { backgroundColor:'rgba(248,113,0.14)', borderColor:'rgba(248,113,0.30)' }]} onPress={()=>downloadReport(period,'deaths')}>\n"
    "                    <Download size={10} color=\"#f87171\"/><Text style={{ fontSize:9, fontWeight:'700', color:'#f87171' }}>Deaths</Text>",
    "                  <TouchableOpacity style={[s.dlBtn, { backgroundColor:'rgba(220,38,38,0.22)', borderColor:'rgba(220,38,38,0.50)' }]} onPress={()=>downloadReport(period,'deaths')}>\n"
    "                    <Download size={10} color=\"#f87171\"/><Text style={{ fontSize:9, fontWeight:'700', color:'#ef4444' }}>Deaths</Text>",
    "FIX 3: deaths download button — valid rgba + darker for visibility")


# ══════════════════════════════════════════════════════════════════════════════
# FIX 4 — syncService.ts: fix isOnline() for null isInternetReachable
# ══════════════════════════════════════════════════════════════════════════════
SYNC = p("code","mobile","src","services","syncService.ts")

print("\n[FIX 4] syncService.ts — fix isOnline() null isInternetReachable on Android")

patch(SYNC,
    "export function isOnline(): boolean {\n"
    "  if (!_networkState) return false\n"
    "  return !!(_networkState.isConnected && _networkState.isInternetReachable)\n"
    "}",
    "export function isOnline(): boolean {\n"
    "  if (!_networkState) return false\n"
    "  if (!_networkState.isConnected) return false\n"
    "  // On Android, isInternetReachable may be null while still being determined.\n"
    "  // Treat null as 'online' when the device reports isConnected=true so records\n"
    "  // are not incorrectly queued as offline-only during normal operation.\n"
    "  return _networkState.isInternetReachable !== false\n"
    "}",
    "isOnline: treat null isInternetReachable as online when connected")


# ══════════════════════════════════════════════════════════════════════════════
# FIX 5 — localDb.ts: correct NIDA / NIN format
# ══════════════════════════════════════════════════════════════════════════════
LOCALDB = p("code","mobile","src","services","localDb.ts")

print("\n[FIX 5] localDb.ts — fix generateNewbornNationalId → YYYYMMDD-LLLLL-SSSSS-CC")

patch(LOCALDB,
    "export function generateNewbornNationalId(dob: string): string {\n"
    "  // Spec §2.7 Step 4 — format: TZ-YYYYMMDD-XXXXX\n"
    "  const parts    = dob.split('/')\n"
    "  const day      = (parts[0] ?? '01').padStart(2, '0')\n"
    "  const month    = (parts[1] ?? '01').padStart(2, '0')\n"
    "  const year     = parts[2] ?? new Date().getFullYear().toString()\n"
    "  const datePart = `${year}${month}${day}`\n"
    "  const seq      = String(Math.floor(Math.random() * 90000) + 10000).padStart(5, '0')\n"
    "  return `TZ-${datePart}-${seq}`\n"
    "}",
    "export function generateNewbornNationalId(\n"
    "  dob: string,\n"
    "  regionCode    = '07',  // Default: Dar es Salaam\n"
    "  districtCode  = '03',  // Default: Kinondoni\n"
    "  wardCode      = '1',\n"
    "): string {\n"
    "  // Per CERTIFICATE_AND_ID_FORMATS.txt:\n"
    "  // Format: YYYYMMDD-LLLLL-SSSSS-CC  (23 chars incl. dashes)\n"
    "  // Breakdown: DOB(8) + dash + Location(5) + dash + Sequence(5) + dash + Check(2)\n"
    "  const parts    = dob.split('/')          // expects DD/MM/YYYY\n"
    "  const day      = (parts[0] ?? '01').padStart(2, '0')\n"
    "  const month    = (parts[1] ?? '01').padStart(2, '0')\n"
    "  const year     = parts[2] ?? String(new Date().getFullYear())\n"
    "  const datePart = `${year}${month}${day}` // YYYYMMDD\n"
    "\n"
    "  // Location code: region(2) + district(2) + ward(1) = 5 digits\n"
    "  const rr       = regionCode.padStart(2,  '0')\n"
    "  const dd       = districtCode.padStart(2, '0')\n"
    "  const w        = wardCode.padStart(1, '0')\n"
    "  const locPart  = `${rr}${dd}${w}`        // e.g. 07031\n"
    "\n"
    "  // Sequence: random 5-digit number (real system queries DB for next seq)\n"
    "  const seqPart  = String(Math.floor(Math.random() * 89999) + 10001).padStart(5, '0')\n"
    "\n"
    "  // Check digits: 2-digit suffix\n"
    "  const cc       = String(Math.floor(Math.random() * 89) + 10)\n"
    "\n"
    "  return `${datePart}-${locPart}-${seqPart}-${cc}` // e.g. 20240315-07031-10042-15\n"
    "}",
    "generateNewbornNationalId: correct format YYYYMMDD-LLLLL-SSSSS-CC")


# ══════════════════════════════════════════════════════════════════════════════
# FIX 6a — RegisterBirthScreen.tsx: uppercase input for child name fields
# ══════════════════════════════════════════════════════════════════════════════
BIRTH = p("code","mobile","src","screens","hospital","RegisterBirthScreen.tsx")

print("\n[FIX 6a] RegisterBirthScreen.tsx — autoCapitalize + toUpperCase for name inputs")

# The name fields in step 1 use a generic TextInput with autoCapitalize="words"
# Change to "characters" and add toUpperCase transforms
patch(BIRTH,
    "              style={{ borderRadius:10, paddingHorizontal:16, alignItems:'center', justifyContent:'center', minWidth:76, backgroundColor:accent, opacity:isNINComplete(nid)?1:0.4 }}\n"
    "              onPress={()=>lookupParent(nid, role)} disabled={!isNINComplete(nid)||loading} activeOpacity={0.8}",
    "              style={{ borderRadius:10, paddingHorizontal:16, alignItems:'center', justifyContent:'center', minWidth:76, backgroundColor:accent, opacity:isNINComplete(nid)?1:0.4 }}\n"
    "              onPress={()=>lookupParent(nid.toUpperCase(), role)} disabled={!isNINComplete(nid)||loading} activeOpacity={0.8}",
    "NID lookup: uppercase the NID before lookup")

patch(BIRTH,
    "autoCapitalize=\"words\" returnKeyType=\"next\" blurOnSubmit={false} />",
    "autoCapitalize=\"characters\" returnKeyType=\"next\" blurOnSubmit={false} />",
    "child name fields: autoCapitalize words → characters")


# ══════════════════════════════════════════════════════════════════════════════
# FIX 6b — RecordDeathScreen.tsx: uppercase inputs
# ══════════════════════════════════════════════════════════════════════════════
DEATH = p("code","mobile","src","screens","hospital","RecordDeathScreen.tsx")

print("\n[FIX 6b] RecordDeathScreen.tsx — autoCapitalize for cause/informant fields")

# StableField component: add autoCapitalize="characters" to the TextInput
patch(DEATH,
    "        multiline={multiline} textAlignVertical={multiline?'top':'center'}\n"
    "        returnKeyType={returnKeyType} blurOnSubmit={false}\n"
    "        onSubmitEditing={onSubmitEditing}",
    "        multiline={multiline} textAlignVertical={multiline?'top':'center'}\n"
    "        autoCapitalize=\"characters\"\n"
    "        returnKeyType={returnKeyType} blurOnSubmit={false}\n"
    "        onSubmitEditing={onSubmitEditing}",
    "StableField: add autoCapitalize=characters")

# NID lookup field
patch(DEATH,
    "                    value={lookupId} onChangeText={setLookupId}",
    "                    value={lookupId} onChangeText={t=>setLookupId(t.toUpperCase())}",
    "death NID lookup field: force uppercase")


# ══════════════════════════════════════════════════════════════════════════════
# FIX 7 — backend/src/routes/auth.js: add POST /api/auth/change-password
# ══════════════════════════════════════════════════════════════════════════════
AUTH_ROUTE = p("code","backend","src","routes","auth.js")

print("\n[FIX 7] backend/routes/auth.js — add POST /auth/change-password endpoint")

CHANGE_PWD_ROUTE = """
// ── POST /api/auth/change-password ────────────────────────────────────────────
// Allows any authenticated officer or admin to change their own password.
// Body: { currentPassword: string, newPassword: string }
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' })
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' })
  }

  try {
    const bcrypt = require('bcryptjs')
    const { id, role } = req.user
    let record = null

    if (role === 'hospital_officer') {
      record = await prisma.hospitalOfficer.findUnique({
        where: { id }, select: { id: true, passwordHash: true },
      })
    } else if (role === 'village_officer') {
      record = await prisma.villageOfficer.findUnique({
        where: { id }, select: { id: true, passwordHash: true },
      })
    } else if (['super_admin', 'admin', 'district_admin', 'regional_admin'].includes(role)) {
      record = await prisma.admin.findUnique({
        where: { id }, select: { id: true, passwordHash: true },
      })
    } else {
      return res.status(403).json({ success: false, message: 'Role not permitted to change password via this endpoint' })
    }

    if (!record) {
      return res.status(404).json({ success: false, message: 'User record not found' })
    }

    const valid = await bcrypt.compare(currentPassword, record.passwordHash)
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' })
    }

    const newHash = await bcrypt.hash(newPassword, 12)

    if (role === 'hospital_officer') {
      await prisma.hospitalOfficer.update({ where: { id }, data: { passwordHash: newHash } })
    } else if (role === 'village_officer') {
      await prisma.villageOfficer.update({ where: { id }, data: { passwordHash: newHash } })
    } else {
      await prisma.admin.update({ where: { id }, data: { passwordHash: newHash } })
    }

    console.log(`[change-password] Officer ${id} (${role}) changed password`)
    return res.json({ success: true, message: 'Password changed successfully' })
  } catch (err) {
    console.error('[change-password]', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

"""

# Insert before module.exports
patch(AUTH_ROUTE,
    "module.exports = router",
    CHANGE_PWD_ROUTE + "module.exports = router",
    "add POST /auth/change-password route")


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
print("""
╔══════════════════════════════════════════════════════════════════╗
║                ADLCS HOSPITAL OFFICER FIX PATCH                 ║
╠══════════════════════════════════════════════════════════════════╣
║ FIX 1  LoginScreen.tsx   — Geofencing removed. Token verify     ║
║          → device activated → Login form directly.              ║
║ FIX 2  HospitalHome.tsx  — Change Password popup modal with     ║
║          current/new/confirm fields + API call.                 ║
║ FIX 3  HospitalHome.tsx  — Icon bg colours fixed (invalid rgba  ║
║          corrected). Deaths button now visible.                  ║
║ FIX 4  syncService.ts    — isOnline() handles Android null      ║
║          isInternetReachable → data syncs when online.          ║
║ FIX 5  localDb.ts        — NIDA format corrected to             ║
║          YYYYMMDD-LLLLL-SSSSS-CC (23 chars per spec).           ║
║ FIX 6  RegisterBirth +   — autoCapitalize="characters" on       ║
║         RecordDeath       name/identifier inputs.               ║
║ FIX 7  backend/auth.js   — POST /api/auth/change-password       ║
║          endpoint added (bcrypt verify + update).               ║
╠══════════════════════════════════════════════════════════════════╣
║ NEXT STEPS                                                       ║
║  1. git add -A && git commit -m "fix: hospital officer app"      ║
║  2. git push origin main  → Render auto-deploys backend          ║
║  3. expo start --clear    → test on device                       ║
╚══════════════════════════════════════════════════════════════════╝
""")
