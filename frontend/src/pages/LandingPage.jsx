import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import './LandingPage.css'

function LandingPage() {
  const navigate = useNavigate()
  const { user, member, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Debug: Log user and member data
  useEffect(() => {
    console.log('=== LANDING PAGE - USER DATA ===')
    console.log('User:', user)
    console.log('Member:', member)
    console.log('Team No:', user?.team_no)
    console.log('Username:', user?.username)
    console.log('Member Name:', member?.name)
    console.log('Member ID:', member?.member_id)
    console.log('Member Email:', member?.email)
    console.log('Member Phone:', member?.phone)
    console.log('================================')
  }, [user, member])

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  async function onLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="landing-shell">
      <div className="landing-topbar">
        <div className="landing-brand">
          <i className="bi bi-graph-up-arrow landing-brand-icon"></i>
          <span className="landing-brand-text">Bulls & Bears</span>
        </div>

        <div className="dropdown" ref={menuRef}>
          <button
            className="landing-userbtn"
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <i className="bi bi-person-circle" />
          </button>

          <ul
            className={`dropdown-menu dropdown-menu-end landing-dropdown${menuOpen ? ' show' : ''}`}
          >
            <li className="px-3 pt-2 pb-1">
              <div className="landing-userline">
                <i className="bi bi-person-circle" />
                <div>
                  <div className="landing-username">{member?.name || user?.username || 'Guest User'}</div>
                  <div className="landing-userdetail">{member?.email || '--'}</div>
                  <div className="landing-userdetail">{member?.phone || '--'}</div>
                  <div className="landing-userdetail">ID: {member?.member_id || '--'}</div>
                </div>
              </div>
            </li>
            <li>
              <hr className="dropdown-divider" />
            </li>
            <li className="px-3 pb-3">
              <button className="btn btn-danger w-100" type="button" onClick={onLogout}>
                <i className="bi bi-box-arrow-right"></i> Logout
              </button>
            </li>
          </ul>
        </div>
      </div>

      <main className="landing-center" aria-live="polite">
        <h1 className="landing-title">
          <span className="title-bulls-bears">Bulls & Bears</span>
        </h1>
        <p className="landing-subtitle">🎯 Welcome to the Ultimate Word Guessing Challenge</p>
        
        {/* Game Instructions Card */}
        <div className="instructions-card">
          <div className="instructions-header">
            <h2>📖 Instructions</h2>
          </div>
          <div className="instructions-content">
            <div className="instruction-item">
              <div className="instruction-label">
                <i className="bi bi-bullseye instruction-icon"></i>
                <strong>Objective:</strong>
              </div>
              <div className="instruction-text">
                Guess the secret 5-letter word in 6 attempts or less
              </div>
            </div>
            
            <div className="instruction-item">
              <div className="instruction-label">
                <i className="bi bi-check-circle instruction-icon" style={{color: '#06C270'}}></i>
                <strong>Green (Bull):</strong>
              </div>
              <div className="instruction-text">
                Letter is correct and in the right position
              </div>
            </div>
            
            <div className="instruction-item">
              <div className="instruction-label">
                <i className="bi bi-exclamation-circle instruction-icon" style={{color: '#FFB800'}}></i>
                <strong>Yellow (Bear):</strong>
              </div>
              <div className="instruction-text">
                Letter is in the word but in the wrong position
              </div>
            </div>
            
            <div className="instruction-item">
              <div className="instruction-label">
                <i className="bi bi-x-circle instruction-icon" style={{color: '#8E8E93'}}></i>
                <strong>Gray:</strong>
              </div>
              <div className="instruction-text">
                Letter is not in the word
              </div>
            </div>
            
            <div className="instruction-item">
              <div className="instruction-label">
                <i className="bi bi-clock instruction-icon"></i>
                <strong>Scoring System:</strong>
              </div>
              <div className="instruction-text">
                <div className="scoring-details">
                  <div className="score-formula">
                    <strong>Total Score = Base Score + Time Bonus</strong>
                  </div>
                  <ul className="score-breakdown">
                    <li><strong>Base Score:</strong> 1.0 point (for winning)</li>
                    <li><strong>Time Bonus:</strong> 0.1 points × seconds remaining
                      <div className="score-example">→ Example: 45s remaining = 0.1 × 45 = 4.5 bonus points</div>
                    </li>
                    <li><strong>Maximum Score:</strong> 19.0 points (instant win with 180s)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="landing-actions">
          <button 
            className="btn btn-primary btn-lg"
            onClick={() => navigate('/game')}
          >
            <i className="bi bi-controller"></i> Start Playing
          </button>
        </div>
      </main>
    </div>
  )
}

export default LandingPage
