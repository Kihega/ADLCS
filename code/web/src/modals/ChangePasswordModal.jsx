/**
 * ChangePasswordModal.jsx — Self-service password change
 *
 * Calls POST /api/auth/change-password with the signed-in user's current
 * and new password. Replaces the old UI-only "forgot password" mock flow.
 */

import { useState } from 'react'
import { X, Lock, Eye, EyeOff, ShieldCheck, CheckCircle, AlertCircle } from 'lucide-react'
import { apiChangePassword } from '../api/admin.api'

function getStrength(pwd) {
  let s = 0
  if (pwd.length >= 8)          s++
  if (/[A-Z]/.test(pwd))        s++
  if (/[0-9]/.test(pwd))        s++
  if (/[^A-Za-z0-9]/.test(pwd)) s++
  if (pwd.length >= 12)         s++
  if (s <= 1) return { label: 'Weak',        color: 'bg-red-500',    tc: 'text-red-400',    w: 'w-1/5'  }
  if (s <= 2) return { label: 'Fair',        color: 'bg-orange-400', tc: 'text-orange-400', w: 'w-2/5'  }
  if (s <= 3) return { label: 'Good',        color: 'bg-yellow-400', tc: 'text-yellow-400', w: 'w-3/5'  }
  if (s <= 4) return { label: 'Strong',      color: 'bg-[#00d4ff]',  tc: 'text-[#00d4ff]',  w: 'w-4/5'  }
  return            { label: 'Very Strong', color: 'bg-[#00ff9d]',  tc: 'text-[#00ff9d]',  w: 'w-full' }
}

export default function ChangePasswordModal({ onClose }) {
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showCur,  setShowCur]  = useState(false)
  const [showNew,  setShowNew]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  const strength = getStrength(next)
  const inp = 'w-full bg-[#060f1e] border border-[#1e3a5f] rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none focus:border-[#00d4ff]/50 transition-colors'
  const lbl = 'text-[10px] text-gray-400 uppercase tracking-widest mb-1.5 block'

  async function handleSubmit() {
    if (!current) { setError('Enter your current password'); return }
    if (next.length < 8) { setError('New password must be at least 8 characters'); return }
    if (next !== confirm) { setError('Passwords do not match'); return }
    setError(''); setLoading(true)
    try {
      await apiChangePassword(current, next)
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0d1f38] border border-[#1e3a5f] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a3060]">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#00d4ff]" />
            <h3 className="text-white font-bold text-sm">Change Password</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {done ? (
            <div className="text-center space-y-3 py-4">
              <CheckCircle size={36} className="text-[#00ff9d] mx-auto" />
              <p className="text-white font-bold text-sm">Password updated</p>
              <p className="text-gray-500 text-xs">Use your new password next time you sign in.</p>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e] hover:opacity-90 transition-all"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className={lbl}>Current Password</label>
                <div className="relative">
                  <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type={showCur ? 'text' : 'password'}
                    value={current}
                    onChange={e => { setCurrent(e.target.value); setError('') }}
                    className={inp.replace('px-4', 'pl-9 pr-10')}
                    placeholder="••••••••"
                  />
                  <button onClick={() => setShowCur(!showCur)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300">
                    {showCur ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              <div>
                <label className={lbl}>New Password</label>
                <div className="relative">
                  <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={next}
                    onChange={e => { setNext(e.target.value); setError('') }}
                    className={inp.replace('px-4', 'pl-9 pr-10')}
                    placeholder="Min. 8 characters"
                  />
                  <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300">
                    {showNew ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                {next && (
                  <div className="mt-1.5">
                    <div className="h-1 bg-[#1a3060] rounded-full overflow-hidden">
                      <div className={`h-full ${strength.color} ${strength.w} transition-all`} />
                    </div>
                    <p className={`text-[10px] mt-1 ${strength.tc}`}>{strength.label}</p>
                  </div>
                )}
              </div>

              <div>
                <label className={lbl}>Confirm New Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError('') }}
                  className={inp}
                  placeholder="Re-enter new password"
                />
              </div>

              {error && (
                <p className="text-red-400 text-[10px] flex items-center gap-1">
                  <AlertCircle size={10} />{error}
                </p>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00d4ff] to-[#0088bb] text-[#060f1e] hover:opacity-90 transition-all disabled:opacity-50"
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
