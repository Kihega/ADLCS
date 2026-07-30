/**
 * ConfirmModal.jsx — in-app replacement for window.confirm()/alert()
 * (PATCH-ADMINREG-2026). Pass onCancel to get a Cancel + Confirm dialog;
 * omit it for a single-button notice/alert.
 */
import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmModal({
  title = 'Confirm',
  message,
  danger = false,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0d1f38] border border-[#1e3a5f] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a3060]">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className={danger ? 'text-red-400' : 'text-[#00d4ff]'} />
            <h3 className="text-white font-bold text-sm">{title}</h3>
          </div>
          {onCancel && (
            <button onClick={onCancel} className="text-gray-500 hover:text-white"><X size={16} /></button>
          )}
        </div>
        <div className="p-5">
          <p className="text-gray-300 text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 py-2 rounded-lg text-xs font-bold border border-[#1e3a5f] text-gray-400 hover:border-[#2a4060] transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
