/**
 * certificateService.ts — Tanzania Government Certificate Generator
 *
 * Generates official-format PDF certificates using expo-print.
 * Templates match CERTIFICATE_AND_ID_FORMATS.txt spec:
 *   - Birth Certificate: cream/golden, numbered table, Cap 108 R.E. 2002
 *   - Death Certificate: white, coat of arms watermark, numbered table
 *
 * PDF workflow:
 *   1. Build HTML string from data
 *   2. expo-print.printToFileAsync → temp PDF URI
 *   3. expo-file-system.copyAsync  → permanent local URI
 *   4. expo-sharing.shareAsync     → share sheet (download/print/email)
 */

import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system/legacy'
import type { LocalBirth, LocalDeath } from './localDb'

// ─── Format helpers ────────────────────────────────────────────────────────────
function fmtDate(d: string): string {
  // Accepts DD/MM/YYYY or ISO
  if (!d) return '—'
  if (d.includes('/')) {
    const [day, mo, yr] = d.split('/')
    const MONTHS = [
      'JANUARY',
      'FEBRUARY',
      'MARCH',
      'APRIL',
      'MAY',
      'JUNE',
      'JULY',
      'AUGUST',
      'SEPTEMBER',
      'OCTOBER',
      'NOVEMBER',
      'DECEMBER',
    ]
    return `${day} ${MONTHS[parseInt(mo, 10) - 1] ?? mo} ${yr}`
  }
  try {
    const dt = new Date(d)
    return dt
      .toLocaleDateString('en-TZ', { day: '2-digit', month: 'long', year: 'numeric' })
      .toUpperCase()
  } catch {
    return d
  }
}

function _today(): string {
  return new Date()
    .toLocaleDateString('en-TZ', { day: '2-digit', month: 'long', year: 'numeric' })
    .toUpperCase()
}

// ─── Birth Certificate HTML ────────────────────────────────────────────────────
export function buildBirthCertHtml(b: LocalBirth): string {
  const entryNo = b.certNo.replace(' A', '').trim()
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #F5F0DC; font-family: 'Times New Roman', Times, serif; }
  .page {
    width: 210mm; min-height: 297mm; padding: 18mm 20mm;
    position: relative; overflow: hidden;
  }
  /* Outer ornate border */
  .border-outer {
    position: absolute; top: 8mm; left: 8mm; right: 8mm; bottom: 8mm;
    border: 5px double #8B7536; pointer-events: none;
  }
  .border-inner {
    position: absolute; top: 11.5mm; left: 11.5mm; right: 11.5mm; bottom: 11.5mm;
    border: 1.5px solid #C9A84C; pointer-events: none;
  }
  /* Watermark */
  .watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%,-50%) rotate(-35deg);
    font-size: 72pt; color: rgba(139,117,54,0.05);
    font-weight: 900; letter-spacing: 6px; white-space: nowrap;
    pointer-events: none; z-index: 0; text-align: center;
  }
  .content { position: relative; z-index: 1; }

  /* Header */
  .header { text-align: center; padding-bottom: 6mm; border-bottom: 1px solid #8B7536; }
  .coat-circle {
    width: 70px; height: 70px; border-radius: 50%;
    background: linear-gradient(135deg, #1A237E 0%, #283593 100%);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 36px; margin-bottom: 6px; border: 3px solid #C9A84C;
  }
  .country { font-size: 13pt; font-weight: 900; color: #1A237E; letter-spacing: 3px; margin-top: 4px; }
  .cert-type { font-size: 22pt; font-weight: 900; color: #1A237E; letter-spacing: 5px; margin: 6px 0; }
  .auth-text { font-size: 8.5pt; color: #4a4030; font-style: italic; line-height: 1.5; max-width: 120mm; margin: 0 auto; }

  /* Table */
  table { width: 100%; border-collapse: collapse; margin-top: 7mm; font-size: 10pt; }
  td { border: 1px solid #C9A84C; padding: 5px 8px; vertical-align: top; }
  .fn { width: 9mm; text-align: center; font-weight: 700; background: #e8d9a8; color: #5c4a1a; font-size: 9pt; }
  .fk { width: 42%; background: #f2e8c4; font-weight: 700; color: #3a2e0a; }
  .fv { color: #111; font-style: italic; font-size: 10.5pt; font-weight: 600; }

  /* Footer */
  .footer { margin-top: 8mm; }
  .not-proof { text-align: center; font-size: 9pt; color: #6b5a30; font-style: italic; margin-bottom: 6mm; }
  .footer-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4mm; }
  .cert-serial { font-size: 16pt; font-weight: 900; letter-spacing: 4px; color: #1A237E; }
  .sig-block { text-align: center; min-width: 60mm; }
  .sig-line { border-bottom: 1px solid #333; margin-bottom: 4px; min-width: 60mm; }
  .sig-title { font-size: 8.5pt; color: #333; }
  .qr-block { text-align: center; font-size: 8pt; color: #777; }
  .qr-box { border: 1px solid #ccc; padding: 4px; font-family: monospace; font-size: 6pt; word-break: break-all; max-width: 30mm; }
  .date-line { font-size: 9.5pt; margin-top: 4mm; }
</style>
</head>
<body>
<div class="page">
  <div class="border-outer"></div>
  <div class="border-inner"></div>
  <div class="watermark">JAMHURI YA TANZANIA</div>
  <div class="content">
    <div class="header">
      <div class="coat-circle">🏛</div>
      <div class="country">THE UNITED REPUBLIC OF TANZANIA</div>
      <div class="cert-type">CERTIFICATE OF BIRTH</div>
      <div class="auth-text">
        Certified under the Births and Deaths Registration Act (Cap 108 R.E. 2002)
        to be a true copy of an entry in the Registrar General's custody.
      </div>
    </div>

    <table>
      <tr><td class="fn">(1)</td><td class="fk">Entry No.</td><td class="fv">${entryNo}</td></tr>
      <tr><td class="fn">(2)</td><td class="fk">Where Born</td><td class="fv">${b.facilityName || '—'}, ${b.facilityDistrict || '—'}, ${b.facilityRegion || '—'}</td></tr>
      <tr><td class="fn">(3)</td><td class="fk">Child's Name</td><td class="fv">${[b.childFirstName, b.childMiddleName, b.childSurname].filter(Boolean).join(' ').toUpperCase()}</td></tr>
      <tr><td class="fn">(4)</td><td class="fk">Sex</td><td class="fv">${b.gender.toUpperCase()}</td></tr>
      <tr><td class="fn">(5)</td><td class="fk">Father's Name</td><td class="fv">${b.fatherName.toUpperCase() || '—'}</td></tr>
      <tr><td class="fn">(6)</td><td class="fk">Father's Country</td><td class="fv">TANZANIA</td></tr>
      <tr><td class="fn">(7)</td><td class="fk">Mother's Name</td><td class="fv">${b.motherName.toUpperCase() || '—'}</td></tr>
      <tr><td class="fn">(8)</td><td class="fk">Mother's Country</td><td class="fv">TANZANIA</td></tr>
      <tr><td class="fn">(9)</td><td class="fk">Date of Birth</td><td class="fv">${fmtDate(b.dateOfBirth)}</td></tr>
      <tr><td class="fn">(10)</td><td class="fk">Date of Registration</td><td class="fv">${fmtDate(b.registeredAt)}</td></tr>
      <tr><td class="fn">(11)</td><td class="fk">Registrar / Officer</td><td class="fv">${b.officerName.toUpperCase() || '—'} · ${b.facilityName || '—'}</td></tr>
      <tr><td class="fn">(12)</td><td class="fk">National ID Number (NIN)</td><td class="fv" style="font-size:11pt;font-weight:900;letter-spacing:2px;">${b.nationalId || 'PENDING — ASSIGNED AT AGE 18'}</td></tr>
    </table>

    <div class="footer">
      <div class="not-proof">"This Certificate is not proof of Citizenship"</div>
      <div class="date-line">Dated this &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; day of &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${new Date().getFullYear()}</div>
      <div class="footer-row">
        <div class="qr-block">
          <div class="qr-box">VERIFY: /api/verify/birth/${b.certNo.replace(/ /g, '-')}<br>NID:${b.nationalId}</div>
          <div style="margin-top:3px;">Scan to verify</div>
        </div>
        <div class="sig-block">
          <div class="sig-line">&nbsp;</div>
          <div class="sig-title">REGISTRAR GENERAL<br>NATIONAL BUREAU OF STATISTICS</div>
        </div>
        <div class="cert-serial">${b.certNo}</div>
      </div>
    </div>
  </div>
</div>
</body></html>`
}

// ─── Death Certificate HTML ────────────────────────────────────────────────────
export function buildDeathCertHtml(d: LocalDeath): string {
  const entryNo = d.certNo.replace('TZ-D-', '').replace(' A', '').trim()
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; font-family: 'Times New Roman', Times, serif; }
  .page { width: 210mm; min-height: 297mm; padding: 18mm 20mm; position: relative; overflow: hidden; }
  .border-outer { position: absolute; top: 8mm; left: 8mm; right: 8mm; bottom: 8mm; border: 4px double #555; pointer-events: none; }
  .border-inner { position: absolute; top: 11.5mm; left: 11.5mm; right: 11.5mm; bottom: 11.5mm; border: 1px solid #888; pointer-events: none; }
  .watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%,-50%) rotate(-35deg);
    font-size: 80pt; color: rgba(180,100,100,0.04);
    font-weight: 900; white-space: nowrap; pointer-events: none; z-index: 0;
  }
  .content { position: relative; z-index: 1; }
  .header { text-align: center; padding-bottom: 6mm; border-bottom: 2px solid #333; }
  .coat-circle { width: 70px; height: 70px; border-radius: 50%; background: #1A237E; display: inline-flex; align-items: center; justify-content: center; font-size: 36px; margin-bottom: 6px; border: 3px solid #888; }
  .country { font-size: 13pt; font-weight: 900; color: #1A237E; letter-spacing: 3px; margin-top: 4px; }
  .cert-type { font-size: 22pt; font-weight: 900; color: #1A237E; letter-spacing: 5px; margin: 6px 0; }
  .auth-text { font-size: 8.5pt; color: #333; font-style: italic; line-height: 1.5; max-width: 120mm; margin: 0 auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 7mm; font-size: 10pt; }
  td { border: 1px solid #888; padding: 5px 8px; vertical-align: top; }
  .fn { width: 9mm; text-align: center; font-weight: 700; background: #eee; font-size: 9pt; }
  .fk { width: 42%; background: #f5f5f5; font-weight: 700; color: #222; }
  .fv { color: #111; font-style: italic; font-size: 10.5pt; font-weight: 600; }
  .footer { margin-top: 8mm; }
  .footer-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10mm; }
  .cert-serial { font-size: 16pt; font-weight: 900; letter-spacing: 4px; color: #1A237E; }
  .sig-block { text-align: center; min-width: 60mm; }
  .sig-line { border-bottom: 1px solid #333; margin-bottom: 4px; min-width: 60mm; }
  .sig-title { font-size: 8.5pt; }
  .qr-box { border: 1px solid #ccc; padding: 4px; font-family: monospace; font-size: 6pt; word-break: break-all; max-width: 30mm; }
  .date-line { font-size: 9.5pt; margin-top: 4mm; }
</style>
</head>
<body>
<div class="page">
  <div class="border-outer"></div>
  <div class="border-inner"></div>
  <div class="watermark">🏛</div>
  <div class="content">
    <div class="header">
      <div class="coat-circle">🏛</div>
      <div class="country">THE UNITED REPUBLIC OF TANZANIA</div>
      <div class="cert-type">CERTIFICATE OF DEATH</div>
      <div class="auth-text">
        Certified under the Births and Deaths Registration Act (Cap 108 R.E. 2002)
        to be a true copy of an entry in the Registrar General's custody.
      </div>
    </div>
    <table>
      <tr><td class="fn">(1)</td><td class="fk">Entry No.</td><td class="fv">${entryNo}</td></tr>
      <tr><td class="fn">(2)</td><td class="fk">Deceased's Name</td><td class="fv">${d.deceasedName.toUpperCase() || d.nationalId || '—'}</td></tr>
      <tr><td class="fn">(3)</td><td class="fk">Age at Death</td><td class="fv">${d.category === 'infant' ? 'LESS THAN 1 YEAR' : d.category === 'child' ? 'UNDER 18 YEARS' : 'ADULT (18+)'}</td></tr>
      <tr><td class="fn">(4)</td><td class="fk">Sex</td><td class="fv">—</td></tr>
      <tr><td class="fn">(5)</td><td class="fk">Last Known Residence</td><td class="fv">${d.facilityName || '—'}</td></tr>
      <tr><td class="fn">(6)</td><td class="fk">Occupation</td><td class="fv">—</td></tr>
      <tr><td class="fn">(7)</td><td class="fk">Nationality</td><td class="fv">TANZANIAN</td></tr>
      <tr><td class="fn">(8)</td><td class="fk">Date of Death</td><td class="fv">${fmtDate(d.dateOfDeath)}</td></tr>
      <tr><td class="fn">(9)</td><td class="fk">Place of Death</td><td class="fv">${d.locationType.replace(/_/g, ' ').toUpperCase()} — ${d.facilityName || '—'}</td></tr>
      <tr><td class="fn">(10)</td><td class="fk">Cause of Death</td><td class="fv">${d.causeOfDeath.toUpperCase()}</td></tr>
      <tr><td class="fn">(11)</td><td class="fk">Informant Name &amp; Address</td><td class="fv">${d.informantName.toUpperCase() || '—'}</td></tr>
      <tr><td class="fn">(12)</td><td class="fk">Date of Registration</td><td class="fv">${fmtDate(d.registeredAt)}</td></tr>
      <tr><td class="fn">(13)</td><td class="fk">Registry Number</td><td class="fv">${d.certNo}</td></tr>
      <tr><td class="fn">(14)</td><td class="fk">National ID Number (NIN)</td><td class="fv" style="font-size:11pt;font-weight:900;letter-spacing:2px;">${d.nationalId || '—'}</td></tr>
    </table>
    <div class="footer">
      <div class="date-line">Dated this &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; day of &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${new Date().getFullYear()}</div>
      <div class="footer-row">
        <div>
          <div class="qr-box">VERIFY: /api/verify/death/${d.certNo.replace(/ /g, '-')}</div>
          <div style="font-size:8pt;color:#777;margin-top:3px;">Scan to verify</div>
        </div>
        <div class="sig-block">
          <div class="sig-line">&nbsp;</div>
          <div class="sig-title">REGISTRAR GENERAL<br>NATIONAL BUREAU OF STATISTICS</div>
        </div>
        <div class="cert-serial">${d.certNo}</div>
      </div>
    </div>
  </div>
</div>
</body></html>`
}

// ─── PDF generation ────────────────────────────────────────────────────────────
const CERT_DIR = FileSystem.documentDirectory + 'certificates/'

async function ensureCertDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CERT_DIR)
  if (!info.exists) await FileSystem.makeDirectoryAsync(CERT_DIR, { intermediates: true })
}

export async function generateBirthPdf(birth: LocalBirth): Promise<string> {
  await ensureCertDir()
  const html = buildBirthCertHtml(birth)
  const { uri } = await Print.printToFileAsync({ html, base64: false })
  const dest = CERT_DIR + `birth_${birth.certNo.replace(/ /g, '_')}.pdf`
  await FileSystem.copyAsync({ from: uri, to: dest })
  return dest
}

export async function generateDeathPdf(death: LocalDeath): Promise<string> {
  await ensureCertDir()
  const html = buildDeathCertHtml(death)
  const { uri } = await Print.printToFileAsync({ html, base64: false })
  const dest = CERT_DIR + `death_${death.certNo.replace(/ /g, '_').replace(/-/g, '_')}.pdf`
  await FileSystem.copyAsync({ from: uri, to: dest })
  return dest
}

// ─── Share / Print ─────────────────────────────────────────────────────────────
export async function sharePdf(path: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing is not available on this device')
  await Sharing.shareAsync(path, {
    mimeType: 'application/pdf',
    dialogTitle: 'Download / Print Certificate',
    UTI: 'com.adobe.pdf',
  })
}

export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html })
}
