import { MapPin } from 'lucide-react'

/**
 * Fixed institutional banner — sits below topbar, never scrolls.
 * activeSection drives the subtle bg overlay image.
 */
export default function NBSHeader({ activeSection = '' }) {

  const overlayMap = {
    'Demographics View':   '/assets/people.jpg',
    'Infrastructure View': '/assets/buildings.jpg',
  }
  const overlay = overlayMap[activeSection] || null

  return (
    <div className="relative w-full shrink-0 overflow-hidden" style={{ height: '108px' }}>

      {/* ── Flag base image */}
      <div className="absolute inset-0 z-0">
        <img src="/assets/flag.jpg" alt=""
             className="w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      {/* ── Section-specific overlay (demographics → people, infra → buildings) */}
      {overlay && (
        <div className="absolute inset-0 z-[1] transition-opacity duration-700"
             style={{
               backgroundImage: `url(${overlay})`,
               backgroundSize: 'cover',
               backgroundPosition: 'center',
               opacity: 0.18,
             }} />
      )}

      {/* ── Content */}
      <div className="relative z-10 h-full flex items-center justify-between px-6">

        {/* Left: CoA + text */}
        <div className="flex items-center gap-4">
          <div className="w-[60px] h-[60px] rounded-full border-2 border-white/35
                          bg-white/10 flex items-center justify-center shrink-0">
            <img src="/assets/court_of_arm.png" alt="Coat of Arms"
                 className="w-11 h-11 object-contain drop-shadow" />
          </div>
          <div>
            <p className="text-[8.5px] font-bold text-yellow-300 tracking-[0.22em] uppercase mb-0.5">
              The United Republic Government of Tanzania
            </p>
            <p className="text-white font-extrabold text-[15px] leading-tight tracking-wide">
              National Bureau of Statistics
            </p>
            <p className="text-[8.5px] text-white/45 font-mono mt-0.5 uppercase tracking-widest">
              Automated Digital Live Census · Research Model (V 1.X.X)
            </p>
          </div>
        </div>

        {/* Right: NBS logo + HQ */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="w-[52px] h-[52px] rounded-xl border border-white/25
                          bg-white/10 flex items-center justify-center">
            <img src="/assets/longo_nbs.png" alt="NBS"
                 className="w-9 h-9 object-contain" />
          </div>
          <div className="flex items-center gap-1 text-white/45">
            <MapPin size={9}/>
            <span className="text-[9px]">NBS HQ · Dodoma, Tanzania</span>
          </div>
        </div>

      </div>
    </div>
  )
}
