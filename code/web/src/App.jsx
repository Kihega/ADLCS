import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// Placeholder pages
const Login = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#050d1a]">
    <div className="text-center">
      <h1 className="text-3xl font-bold text-[#00d4ff] mb-2">
        NBS CENSUS SYSTEM
      </h1>
      <p className="text-gray-400 mb-8">
        Tanzania Digital Live Census Model
      </p>
      <div className="bg-[#0a1628] border border-[#1a3060] rounded-xl p-8 w-80">
        <h2 className="text-white font-semibold mb-6">Admin Login</h2>
        <input
          type="email"
          placeholder="Email address"
          className="w-full bg-[#0f1e38] border border-[#1a3060] text-white
                     rounded-lg px-4 py-3 mb-4 outline-none focus:border-[#00d4ff]"
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full bg-[#0f1e38] border border-[#1a3060] text-white
                     rounded-lg px-4 py-3 mb-6 outline-none focus:border-[#00d4ff]"
        />
        <button className="w-full bg-[#00d4ff] text-[#050d1a] font-bold
                           rounded-lg py-3 hover:bg-[#00b8d9] transition-colors">
          LOGIN
        </button>
      </div>
      <p className="text-gray-600 text-xs mt-6">
        © 2026 NBS Tanzania — Automated Digital Live Census
      </p>
    </div>
  </div>
)

const SuperAdminDashboard = () => (
  <div className="min-h-screen bg-[#050d1a] flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-2xl font-bold text-[#00d4ff]">
        Super Admin Dashboard
      </h1>
      <p className="text-gray-400 mt-2">Coming in Sprint 1</p>
    </div>
  </div>
)

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/super-admin" element={<SuperAdminDashboard />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
