#!/usr/bin/env python3
"""
patch_13.py — ADLCS Patch 13
=====================================================================
Fixes applied
─────────────
1. RegisterBirthScreen.tsx — Father/Mother NID gender validation
   The backend NID lookup path (`/officer/citizen-lookup`, used in
   production) skipped the gender check entirely — it only existed in
   the offline MOCK_CITIZENS fallback. This let a FEMALE citizen's NID
   be accepted as "Father" (and vice versa). Now the backend success
   path validates: Father NID must be MALE, Mother NID must be FEMALE,
   with a clear error message if mismatched.

2. NINRegistrationScreen.tsx — ID card preview + Print/Download
   • New `IdCardPreview` component renders the issued National ID
     visually on-screen (CR-80 proportions) right after NIN issuance.
   • "Print Card" button → Print.printAsync() opens the native print
     dialog so the officer can pick a connected card printer.
   • "Download Card" button now generates an A4-page PDF with the card
     CENTERED on the page (was previously top-left on a huge page,
     because @page CSS sizing alone isn't honoured by expo-print).
   • Card HTML is split into a shared `cardMarkup()` + two builders:
     buildCardHtml() (CR-80 page, for printing) and
     buildDownloadPageHtml() (A4 page, card centred, for download).

RUN FROM PROJECT ROOT (alongside /code/ folder), AFTER patch_10/11/12:
    python3 patch_13.py
=====================================================================
"""
import os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
errors = []

def patch(filepath, old, new, label):
    full = os.path.join(ROOT, filepath)
    if not os.path.exists(full):
        errors.append(f"❌  FILE NOT FOUND: {filepath}  [{label}]")
        return
    content = open(full, encoding="utf-8").read()
    if old not in content:
        errors.append(f"❌  PATTERN NOT FOUND in {filepath}  [{label}]\n     Expected: {repr(old[:120])}")
        return
    open(full, "w", encoding="utf-8").write(content.replace(old, new, 1))
    print(f"  ✅  {label}")

def replace_function(filepath, start_marker, new_text, label):
    """Replace a top-level function/block from start_marker through the
    next line that is exactly '}' (closing brace at column 0)."""
    full = os.path.join(ROOT, filepath)
    if not os.path.exists(full):
        errors.append(f"❌  FILE NOT FOUND: {filepath}  [{label}]")
        return
    content = open(full, encoding="utf-8").read()
    if start_marker not in content:
        errors.append(f"❌  MARKER NOT FOUND in {filepath}  [{label}]\n     Expected: {repr(start_marker[:120])}")
        return
    start = content.index(start_marker)
    end_marker = "\n}\n"
    idx = content.index(end_marker, start)
    end = idx + len(end_marker)
    content = content[:start] + new_text + content[end:]
    open(full, "w", encoding="utf-8").write(content)
    print(f"  ✅  {label}")


# ══════════════════════════════════════════════════════════════════════════════
#  1 — RegisterBirthScreen.tsx: enforce gender on Father/Mother NID lookup
#       (the backend success path was missing this check entirely)
# ══════════════════════════════════════════════════════════════════════════════

patch(
    "code/mobile/src/screens/hospital/RegisterBirthScreen.tsx",
    """        const json = await res.json()
        if (json.success && json.data) {
          setData({ ...json.data, firstName: json.data.firstName, middleName: json.data.middleName ?? '', surname: json.data.surname, gender: json.data.gender?.toUpperCase(), dateOfBirth: json.data.dateOfBirth, age: 0, region:'Tanzania', district:'—', occupation:'—', vitalStatus: json.data.vitalStatus?.toUpperCase() ?? 'ALIVE' })
          setLoading(false)
          return
        }""",
    """        const json = await res.json()
        if (json.success && json.data) {
          const foundGender = json.data.gender?.toUpperCase()
          if (isFather && foundGender !== 'MALE') {
            setError('This National ID belongs to a FEMALE citizen and cannot be used for the Father.')
            setLoading(false)
            return
          }
          if (!isFather && foundGender !== 'FEMALE') {
            setError('This National ID belongs to a MALE citizen and cannot be used for the Mother.')
            setLoading(false)
            return
          }
          setData({ ...json.data, firstName: json.data.firstName, middleName: json.data.middleName ?? '', surname: json.data.surname, gender: foundGender, dateOfBirth: json.data.dateOfBirth, age: 0, region:'Tanzania', district:'—', occupation:'—', vitalStatus: json.data.vitalStatus?.toUpperCase() ?? 'ALIVE' })
          setLoading(false)
          return
        }""",
    "RegisterBirthScreen: enforce Father=MALE / Mother=FEMALE on backend NID lookup"
)


# ══════════════════════════════════════════════════════════════════════════════
#  2 — NINRegistrationScreen.tsx: ID card preview + Print/Download
# ══════════════════════════════════════════════════════════════════════════════

# 2a — Add Printer icon to lucide imports
patch(
    "code/mobile/src/screens/village/NINRegistrationScreen.tsx",
    """import {
  ArrowLeft, Search, Check, Shield,
  Camera as CameraIcon, Fingerprint, IdCard,
  CheckCircle2, Copy, Download, AlertCircle, ChevronRight, User,
} from 'lucide-react-native'""",
    """import {
  ArrowLeft, Search, Check, Shield,
  Camera as CameraIcon, Fingerprint, IdCard,
  CheckCircle2, Copy, Download, AlertCircle, ChevronRight, User, Printer,
} from 'lucide-react-native'""",
    "NINRegistrationScreen: import Printer icon"
)


# 2b — Replace buildIdCardHtml with cardMarkup() + buildCardHtml() (CR-80, for
#      printing) + buildDownloadPageHtml() (A4, card centred, for download)
#      + new IdCardPreview component
NEW_CARD_BUILDERS = r"""type CardData = {
  fullName:string; nationalId:string; gender:string; dob:string
  village:string; issuedDate:string; expiryDate:string; photoBase64?:string
}

// ── Shared card markup + styles (used by both print and download builders) ──
function cardMarkup(d: CardData): { css:string; html:string } {
  const photo = d.photoBase64
    ? `<img src="${d.photoBase64}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;"/>`
    : `<div style="width:100%;height:100%;background:#d1fae5;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#0f766e;border-radius:4px;">${d.fullName.split(' ').slice(0,2).map((n:string)=>n[0]).join('')}</div>`
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
  <div class="bars">${Array.from({length:24},(_,i)=>`<div class="bar" style="width:${i%3===0?'2px':'1px'};height:${i%5===0?'3mm':'2mm'};"></div>`).join('')}</div>
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
  const initials = data.fullName.split(' ').filter(Boolean).slice(0,2).map((n:string)=>n[0]).join('')
  return (
    <View style={{ alignSelf:'center', width:320, height:202, borderRadius:10, overflow:'hidden',
      backgroundColor:'#fff', shadowColor:'#000', shadowOpacity:0.25, shadowRadius:10,
      shadowOffset:{ width:0, height:4 }, elevation:8 }}>
      <View style={{ flexDirection:'row', height:6 }}>
        <View style={{ flex:3, backgroundColor:'#1eb53a' }} />
        <View style={{ width:7, backgroundColor:'#fcd116' }} />
        <View style={{ width:5, backgroundColor:'#000' }} />
        <View style={{ width:7, backgroundColor:'#fcd116' }} />
        <View style={{ flex:3, backgroundColor:'#00a3dd' }} />
      </View>
      <LinearGradient colors={['#003087','#0f766e']} style={{ height:38, alignItems:'center', justifyContent:'center' }}>
        <Text style={{ color:'#fff', fontSize:10, fontWeight:'900', letterSpacing:1 }}>UNITED REPUBLIC OF TANZANIA</Text>
        <Text style={{ color:'rgba(255,255,255,0.8)', fontSize:7, marginTop:1 }}>NATIONAL IDENTIFICATION CARD</Text>
      </LinearGradient>
      <View style={{ flex:1, flexDirection:'row', padding:10, gap:10 }}>
        <View style={{ alignItems:'center', gap:5 }}>
          <View style={{ width:62, height:76, borderRadius:6, borderWidth:2, borderColor:'#0f766e',
            overflow:'hidden', backgroundColor:'#d1fae5', alignItems:'center', justifyContent:'center' }}>
            {data.photoBase64
              ? <Image source={{ uri:data.photoBase64 }} style={{ width:62, height:76 }} resizeMode="cover" />
              : <Text style={{ fontSize:20, fontWeight:'900', color:'#0f766e' }}>{initials}</Text>}
          </View>
          <View style={{ backgroundColor:'#003087', borderRadius:4, paddingHorizontal:6, paddingVertical:3 }}>
            <Text style={{ color:'#fcd116', fontSize:7, fontWeight:'900' }}>{data.nationalId}</Text>
          </View>
        </View>
        <View style={{ flex:1, gap:3, paddingTop:1 }}>
          <Text style={{ fontSize:13, fontWeight:'900', color:'#003087' }} numberOfLines={1}>{data.fullName}</Text>
          <View style={{ backgroundColor:'#0f766e', borderRadius:3, paddingHorizontal:6, paddingVertical:1.5, alignSelf:'flex-start', marginBottom:1 }}>
            <Text style={{ color:'#fff', fontSize:7, fontWeight:'700', letterSpacing:0.5 }}>TANZANIA CITIZEN</Text>
          </View>
          {[
            ['Gender',        data.gender.toUpperCase()],
            ['Date of Birth', fmtDOB(data.dob)],
            ['Village',       data.village],
            ['Issued',        data.issuedDate],
            ['Expires',       data.expiryDate],
          ].map(([k,v])=>(
            <View key={k} style={{ flexDirection:'row', justifyContent:'space-between',
              borderBottomWidth:0.5, borderBottomColor:'#e2e8f0', paddingBottom:1 }}>
              <Text style={{ fontSize:8, color:'#64748b' }}>{k}</Text>
              <Text style={{ fontSize:8, fontWeight:'700', color:'#0f172a' }} numberOfLines={1}>{v}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ height:18, backgroundColor:'#1e293b', flexDirection:'row',
        alignItems:'center', justifyContent:'space-between', paddingHorizontal:10 }}>
        <View style={{ flexDirection:'row', alignItems:'flex-end', gap:1 }}>
          {Array.from({length:24}).map((_,i)=>(
            <View key={i} style={{ width:i%3===0?2:1, height:i%5===0?12:8, backgroundColor:'rgba(255,255,255,0.5)' }} />
          ))}
        </View>
        <Text style={{ fontSize:6, color:'rgba(255,255,255,0.5)' }}>NBS · NIDA</Text>
      </View>
    </View>
  )
}
"""

replace_function(
    "code/mobile/src/screens/village/NINRegistrationScreen.tsx",
    "function buildIdCardHtml(d: {",
    NEW_CARD_BUILDERS,
    "NINRegistrationScreen: replace buildIdCardHtml with cardMarkup/buildCardHtml/buildDownloadPageHtml + IdCardPreview"
)


# 2c — State: replace pdfPath with cardHtml/cardData, add printing state
patch(
    "code/mobile/src/screens/village/NINRegistrationScreen.tsx",
    """  // Step 3
  const [submitting,  setSubmitting]  = useState(false)
  const [issuedNIN,   setIssuedNIN]   = useState<string|null>(null)
  const [pdfPath,     setPdfPath]     = useState<string|null>(null)
  const [downloading, setDownloading] = useState(false)
  const [officer,     setOfficer]     = useState<any>({})""",
    """  // Step 3
  const [submitting,  setSubmitting]  = useState(false)
  const [issuedNIN,   setIssuedNIN]   = useState<string|null>(null)
  const [cardHtml,    setCardHtml]    = useState<string|null>(null)
  const [cardData,    setCardData]    = useState<CardData|null>(null)
  const [downloading, setDownloading] = useState(false)
  const [printing,    setPrinting]    = useState(false)
  const [officer,     setOfficer]     = useState<any>({})""",
    "NINRegistrationScreen: state — cardHtml/cardData/printing replace pdfPath"
)

# 2d — handleIssueNIN: build cardData/cardHtml instead of generating PDF upfront
patch(
    "code/mobile/src/screens/village/NINRegistrationScreen.tsx",
    """      if (json.success) {
        const nin = json.data?.nationalId
        setIssuedNIN(nin)
        const fullName = [birthRecord.childFirstName,birthRecord.childMiddleName,birthRecord.childSurname]
          .filter(Boolean).join(' ').toUpperCase()
        const issued = today()
        const expiry = new Date(); expiry.setFullYear(expiry.getFullYear()+10)
        const expiryStr = expiry.toLocaleDateString('en-TZ',{day:'2-digit',month:'long',year:'numeric'}).toUpperCase()
        const html = buildIdCardHtml({
          fullName, nationalId:nin, gender:birthRecord.gender,
          dob:birthRecord.dateOfBirth, village:officer?.villageName??'—',
          issuedDate:issued, expiryDate:expiryStr, photoBase64:photoBase64??undefined,
        })
        const { uri } = await Print.printToFileAsync({ html, base64:false })
        const dest = `${FileSystem.documentDirectory}NID-${nin.replace(/-/g,'_')}.pdf`
        await FileSystem.copyAsync({ from:uri, to:dest })
        setPdfPath(dest)
        setStep(3)
      } else {""",
    """      if (json.success) {
        const nin = json.data?.nationalId
        setIssuedNIN(nin)
        const fullName = [birthRecord.childFirstName,birthRecord.childMiddleName,birthRecord.childSurname]
          .filter(Boolean).join(' ').toUpperCase()
        const issued = today()
        const expiry = new Date(); expiry.setFullYear(expiry.getFullYear()+10)
        const expiryStr = expiry.toLocaleDateString('en-TZ',{day:'2-digit',month:'long',year:'numeric'}).toUpperCase()
        const data: CardData = {
          fullName, nationalId:nin, gender:birthRecord.gender,
          dob:birthRecord.dateOfBirth, village:officer?.villageName??'—',
          issuedDate:issued, expiryDate:expiryStr, photoBase64:photoBase64??undefined,
        }
        setCardData(data)
        setCardHtml(buildCardHtml(data))
        setStep(3)
      } else {""",
    "NINRegistrationScreen: handleIssueNIN builds cardData/cardHtml (no upfront PDF)"
)

# 2e — Replace handleDownload, add handlePrint
patch(
    "code/mobile/src/screens/village/NINRegistrationScreen.tsx",
    """  const handleDownload = async () => {
    if (!pdfPath) return
    setDownloading(true)
    try { await Sharing.shareAsync(pdfPath,{ mimeType:'application/pdf', dialogTitle:'Save NID Card' }) }
    catch { Alert.alert('Error','Could not share PDF') }
    setDownloading(false)
  }""",
    """  // Print Card — opens the native print dialog (officer selects a connected
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
      const { uri } = await Print.printToFileAsync({ html: pageHtml, width: 595, height: 842, base64: false })
      const dest = `${FileSystem.documentDirectory}NID-${cardData.nationalId.replace(/-/g,'_')}.pdf`
      await FileSystem.copyAsync({ from: uri, to: dest })
      await Sharing.shareAsync(dest, { mimeType:'application/pdf', dialogTitle:'Save NID Card' })
    } catch {
      Alert.alert('Error', 'Could not generate or share the PDF')
    }
    setDownloading(false)
  }""",
    "NINRegistrationScreen: handlePrint (CR-80 print dialog) + handleDownload (centred A4 PDF)"
)


# 2f — Step 3 JSX: insert IdCardPreview, replace single Download button with
#      a Print + Download button row
patch(
    "code/mobile/src/screens/village/NINRegistrationScreen.tsx",
    """              <View style={{ borderRadius:10, borderWidth:1.5, borderColor:`${G}60`,
                backgroundColor:`${G}12`, padding:14, flexDirection:'row', alignItems:'center' }}>
                <Text style={{ fontSize:16, fontWeight:'900', color:GL, flex:1, letterSpacing:1 }}>{issuedNIN}</Text>
                <TouchableOpacity onPress={async()=>{ await Clipboard.setStringAsync(issuedNIN); showToast('NIN copied') }} style={{ padding:4 }}>
                  <Copy size={16} color={GL} />
                </TouchableOpacity>
              </View>
            </View>
            {[""",
    """              <View style={{ borderRadius:10, borderWidth:1.5, borderColor:`${G}60`,
                backgroundColor:`${G}12`, padding:14, flexDirection:'row', alignItems:'center' }}>
                <Text style={{ fontSize:16, fontWeight:'900', color:GL, flex:1, letterSpacing:1 }}>{issuedNIN}</Text>
                <TouchableOpacity onPress={async()=>{ await Clipboard.setStringAsync(issuedNIN); showToast('NIN copied') }} style={{ padding:4 }}>
                  <Copy size={16} color={GL} />
                </TouchableOpacity>
              </View>
            </View>

            {/* National ID card preview */}
            <View style={{ gap:6 }}>
              <Text style={{ fontSize:11, color:T.textDim, fontWeight:'600', textTransform:'uppercase',
                letterSpacing:0.5, textAlign:'center' }}>
                Card Preview
              </Text>
              <IdCardPreview data={cardData} />
            </View>

            {[""",
    "NINRegistrationScreen: insert IdCardPreview before info rows"
)

patch(
    "code/mobile/src/screens/village/NINRegistrationScreen.tsx",
    """            <TouchableOpacity onPress={handleDownload} disabled={downloading || !pdfPath}
              style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10,
                backgroundColor:downloading ? T.card2 : G, borderRadius:12, paddingVertical:14,
                borderWidth:downloading?1:0, borderColor:T.border, marginTop:8 }}>
              {downloading
                ? <ActivityIndicator color={GL} size="small" />
                : <Download size={18} color="#fff" />}
              <Text style={{ fontSize:14, fontWeight:'800', color:downloading?GL:'#fff' }}>
                {downloading ? 'Generating…' : 'Download ID Card PDF'}
              </Text>
            </TouchableOpacity>""",
    """            <View style={{ flexDirection:'row', gap:10, marginTop:8 }}>
              <TouchableOpacity onPress={handlePrint} disabled={printing || !cardHtml}
                style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8,
                  backgroundColor:printing ? T.card2 : G, borderRadius:12, paddingVertical:14,
                  borderWidth:printing?1:0, borderColor:T.border }}>
                {printing
                  ? <ActivityIndicator color={GL} size="small" />
                  : <Printer size={18} color="#fff" />}
                <Text style={{ fontSize:14, fontWeight:'800', color:printing?GL:'#fff' }}>
                  {printing ? 'Opening…' : 'Print Card'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDownload} disabled={downloading || !cardData}
                style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8,
                  borderRadius:12, paddingVertical:14, borderWidth:1.5, borderColor:`${G}60` }}>
                {downloading
                  ? <ActivityIndicator color={GL} size="small" />
                  : <Download size={18} color={GL} />}
                <Text style={{ fontSize:14, fontWeight:'800', color:GL }}>
                  {downloading ? 'Generating…' : 'Download Card'}
                </Text>
              </TouchableOpacity>
            </View>""",
    "NINRegistrationScreen: replace Download button with Print + Download row"
)


# ══════════════════════════════════════════════════════════════════════════════
#  REPORT
# ══════════════════════════════════════════════════════════════════════════════

print()
if errors:
    print("=" * 65)
    print("  PATCH COMPLETED WITH ERRORS")
    print("=" * 65)
    for e in errors:
        print(e)
    print()
    sys.exit(1)
else:
    print("=" * 65)
    print("  ✅  patch_13.py — ALL PATCHES APPLIED SUCCESSFULLY")
    print("=" * 65)
    print()
    print("  HOSPITAL")
    print("  • RegisterBirthScreen — Father NID must be MALE, Mother NID must")
    print("    be FEMALE, validated on the live backend lookup path (the")
    print("    previous check only existed in the offline mock fallback).")
    print()
    print("  VILLAGE — NIN Registration")
    print("  • New IdCardPreview shows the issued National ID card on-screen")
    print("    (CR-80 proportions) immediately after NIN issuance.")
    print("  • 'Print Card' opens the native print dialog (Print.printAsync)")
    print("    — officer selects a connected card printer.")
    print("  • 'Download Card' generates an A4 PDF with the card CENTERED on")
    print("    the page (previously top-left on an oversized page).")
    print()
    print("  NEXT STEPS")
    print("  1. npx expo start --clear")
    print("  2. Test: search a NID known to be FEMALE in the Father step —")
    print("     should now be rejected with a clear error message.")
    print("  3. Issue a NIN end-to-end and verify the card preview, print")
    print("     dialog, and centred PDF download all work.")
    print()
