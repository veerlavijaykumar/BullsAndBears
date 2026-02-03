import { Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import BullsAndBearsGame from './pages/BullsAndBearsGame.jsx'
import LeaderboardPage from './pages/LeaderboardPage.jsx'
import PerformanceAnalytics from './pages/PerformanceAnalytics.jsx'
import RequireAuth from './auth/RequireAuth.jsx'
import { useAuth } from './auth/AuthContext.jsx'

function App() {
  const { user, status } = useAuth()

  // Show nothing while checking authentication
  if (status === 'loading') {
    return null
  }

  // Check if user is authenticated (has user object)
  const isAuthenticated = !!user

  return (
    <Routes>
      {/* Default route: always redirect to login page first */}
      <Route 
        path="/" 
        element={<Navigate to="/login" replace />} 
      />
      
      {/* Login page - if already authenticated, redirect to landing */}
      <Route 
        path="/login" 
        element={isAuthenticated ? <Navigate to="/landing" replace /> : <LoginPage />} 
      />
      
      {/* Landing page - requires authentication */}
      <Route
        path="/landing"
        element={
          <RequireAuth>
            <LandingPage />
          </RequireAuth>
        }
      />
      
      {/* Game and Leaderboard - public access */}
      <Route path="/game" element={<BullsAndBearsGame />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/analytics" element={<PerformanceAnalytics />} />
      
      {/* Fallback: redirect to login */}
      <Route 
        path="*" 
        element={<Navigate to="/login" replace />} 
      />
    </Routes>
  )
}

export default App
