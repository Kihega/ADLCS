/**
 * AlertModal.jsx — errors / alerts shown as a separate modal card with an OK
 * button (patch2). Use <ConfirmModal onCancel=…> for warnings that need a
 * Confirm + Cancel decision.
 *
 *   {error && <AlertModal title="Sign-in failed" message={error} onClose={() => setError('')} />}
 *
 * type: 'error' (default) | 'success' | 'info'
 */
import { useEffect } from 'react'
import { AlertCircle, CheckCircle, Info } from 'lucide-react'

const KINDS = {
  error: { Icon: AlertCircle, tone: 'text-red-400', ring: 'bg-red-500/15', btn: 'bg-red-600 hover:bg-red-700 text-white' },
  success: { Icon: CheckCircle, tone: 'text-emerald-400', ring: 'bg-emerald-500/15', btn: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  info: { Icon: Info, tone: 'text-[#00d4ff]', ring: 'bg-[#00d4ff]/15', btn: 'bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e]' },
}

export default function AlertModal({ title, message, type = 'error', onClose }) {
  const k = KINDS[type] || KINDS.error
  const { Icon } = k

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="alertdialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-[#0d1f38] border border-[#3d6ca3] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center px-6 pt-6 pb-2">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${k.ring}`}>
            <Icon size={24} className={k.tone} />
          </div>
          <h3 className="text-white font-bold text-sm">{title || (type === 'error' ? 'Error' : 'Notice')}</h3>
          {message && <p className="text-gray-300 text-sm leading-relaxed mt-2">{message}</p>}
        </div>
        <div className="px-6 pb-5 pt-4">
          <button
            autoFocus
            onClick={onClose}
            className={`w-full py-2 rounded-lg text-xs font-bold transition-colors ${k.btn}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
