import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { gameApi } from '../api/gameApi.js'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Pie, Line, Doughnut, Radar } from 'react-chartjs-2'
import './PerformanceAnalytics.css'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
)

function PerformanceAnalytics() {
  const navigate = useNavigate()
  const { user, member, signOut } = useAuth()
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeChart, setActiveChart] = useState(null) // 'bar', 'pie', 'line', 'doughnut', 'radar', 'timeSeries'

  useEffect(() => {
    async function loadAnalytics() {
      const playerName = member?.name || user?.username
      if (!playerName) return

      try {
        setLoading(true)
        const data = await gameApi.getAnalytics({ player_name: playerName })
        console.log('Analytics Data Received:', data)
        console.log('Recent Games:', data.recent_games)
        setAnalytics(data)
      } catch (err) {
        setError(err.message || 'Failed to load analytics')
      } finally {
        setLoading(false)
      }
    }

    loadAnalytics()
  }, [user, member])

  async function onLogout() {
    await signOut()
    navigate('/login')
  }

  // Prepare chart data
  const winLossData = analytics ? {
    labels: ['Wins', 'Losses'],
    datasets: [
      {
        label: 'Game Results',
        data: [analytics.total_wins || 0, analytics.total_losses || 0],
        backgroundColor: ['#06C270', '#FF3B3B'],
        borderColor: ['#05a860', '#da190b'],
        borderWidth: 2,
      },
    ],
  } : null

  const attemptsDistributionData = analytics?.attempts_distribution ? {
    labels: ['1 Try', '2 Tries', '3 Tries', '4 Tries', '5 Tries', '6 Tries'],
    datasets: [
      {
        label: 'Number of Games',
        data: [
          analytics.attempts_distribution[1] || 0,
          analytics.attempts_distribution[2] || 0,
          analytics.attempts_distribution[3] || 0,
          analytics.attempts_distribution[4] || 0,
          analytics.attempts_distribution[5] || 0,
          analytics.attempts_distribution[6] || 0,
        ],
        backgroundColor: '#3377FF',
        borderColor: '#2266EE',
        borderWidth: 2,
      },
    ],
  } : null

  // Score Progression (last 10 games, use absolute_score)
  const recentGamesData = analytics?.recent_games && analytics.recent_games.length > 0 ? {
    labels: analytics.recent_games.slice(0, 10).reverse().map((_, idx) => `Game ${idx + 1}`),
    datasets: [
      {
        label: 'Score Progression',
        data: analytics.recent_games.slice(0, 10).reverse().map((game) => {
          const score = parseFloat(game.absolute_score) || 0;
          return score;
        }),
        borderColor: '#3377FF',
        backgroundColor: 'rgba(51, 119, 255, 0.1)',
        borderWidth: 3,
        tension: 0.4,
        fill: true,
        pointRadius: 6,
        pointBackgroundColor: '#3377FF',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointHoverRadius: 8,
        pointHoverBackgroundColor: '#FFFFFF',
        pointHoverBorderColor: '#3377FF',
        pointHoverBorderWidth: 3,
      },
    ],
  } : null

  // Time Series Data - Score over time (use absolute_score)
  const timeSeriesData = analytics?.recent_games && analytics.recent_games.length > 0 ? {
    labels: analytics.recent_games.slice(0, 15).reverse().map((game) => {
      const date = new Date(game.created_at)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }),
    datasets: [
      {
        label: 'Score',
        data: analytics.recent_games.slice(0, 15).reverse().map((game) => game.absolute_score || 0),
        borderColor: '#06C270',
        backgroundColor: 'rgba(6, 194, 112, 0.1)',
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#06C270',
      },
      {
        label: 'Attempts',
        data: analytics.recent_games.slice(0, 15).reverse().map((game) => game.attempts_used || 0),
        borderColor: '#FFB800',
        backgroundColor: 'rgba(255, 184, 0, 0.1)',
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#FFB800',
      },
    ],
  } : null

  // Performance Radar Chart (use avg_duration for speed)
  const radarData = analytics ? {
    labels: ['Win Rate', 'Avg Score', 'Speed', 'Consistency', 'Efficiency'],
    datasets: [
      {
        label: 'Your Performance',
        data: [
          ((analytics.total_wins / (analytics.total_games || 1)) * 100).toFixed(0),
          ((analytics.avg_score / 20) * 100).toFixed(0), // Normalize to 100
          (((180 - (analytics.avg_duration || 180)) / 180) * 100).toFixed(0), // Speed: lower avg_duration is better
          ((6 - (analytics.avg_attempts || 6)) / 6 * 100).toFixed(0), // Consistency: fewer attempts is better
          ((analytics.total_wins / (analytics.total_games || 1)) * 100).toFixed(0), // Efficiency (same as win rate for now)
        ],
        backgroundColor: 'rgba(51, 119, 255, 0.2)',
        borderColor: '#3377FF',
        borderWidth: 3,
        pointBackgroundColor: '#3377FF',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#3377FF',
      },
    ],
  } : null

  // Win/Loss Doughnut Chart
  const doughnutData = analytics ? {
    labels: ['Wins', 'Losses'],
    datasets: [
      {
        data: [analytics.total_wins || 0, analytics.total_losses || 0],
        backgroundColor: ['#06C270', '#FF3B3B'],
        borderColor: ['#FFFFFF', '#FFFFFF'],
        borderWidth: 3,
        hoverOffset: 10,
      },
    ],
  } : null

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: {
            size: 14,
            family: 'Inter, sans-serif',
            weight: '600',
          },
          padding: 15,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: {
          size: 14,
          weight: 'bold',
        },
        bodyFont: {
          size: 13,
        },
        cornerRadius: 8,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          font: {
            size: 12,
          },
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
      x: {
        ticks: {
          font: {
            size: 12,
          },
        },
        grid: {
          display: false,
        },
      },
    },
  }

  return (
    <div className="analytics-page-wrapper">
      <div className="analytics-container">
        <header className="analytics-header">
          <h1>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '12px' }}>
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            Performance Analytics
          </h1>
          <div className="analytics-user-info">
            <span className="user-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '6px' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              {member?.name || user?.username || 'User'}
            </span>
          </div>
        </header>

        <main className="analytics-main">
          {loading ? (
            <div className="analytics-loading">
              <div className="spinner"></div>
              <p>Loading analytics...</p>
            </div>
          ) : error ? (
            <div className="analytics-error">
              <i className="bi bi-exclamation-triangle"></i>
              <p>{error}</p>
            </div>
          ) : analytics && analytics.total_games > 0 ? (
            <>
              {/* Stats Cards - Row 1 */}
              <div className="analytics-stats-grid">
                <div className="stat-card">
                  <div className="stat-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                      <line x1="7" y1="7" x2="7" y2="7.01"></line>
                      <line x1="12" y1="7" x2="12" y2="7.01"></line>
                      <line x1="17" y1="7" x2="17" y2="7.01"></line>
                      <line x1="7" y1="12" x2="7" y2="12.01"></line>
                      <line x1="12" y1="12" x2="12" y2="12.01"></line>
                      <line x1="17" y1="12" x2="17" y2="12.01"></line>
                      <line x1="7" y1="17" x2="7" y2="17.01"></line>
                      <line x1="12" y1="17" x2="12" y2="17.01"></line>
                      <line x1="17" y1="17" x2="17" y2="17.01"></line>
                    </svg>
                  </div>
                  <div className="stat-content">
                    <h3>Total Games</h3>
                    <p className="stat-value">{analytics.total_games || 0}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </div>
                  <div className="stat-content">
                    <h3>Total Wins</h3>
                    <p className="stat-value">{analytics.total_wins || 0}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                      <polyline points="17 6 23 6 23 12"></polyline>
                    </svg>
                  </div>
                  <div className="stat-content">
                    <h3>Total Losses</h3>
                    <p className="stat-value">{analytics.total_losses || 0}</p>
                  </div>
                </div>
                <div className="stat-card highlight">
                  <div className="stat-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                      <path d="M4 22h16"></path>
                      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
                    </svg>
                  </div>
                  <div className="stat-content">
                    <h3>Best Score</h3>
                    <p className="stat-value">{analytics.best_score?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10"></line>
                      <line x1="12" y1="20" x2="12" y2="4"></line>
                      <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                  </div>
                  <div className="stat-content">
                    <h3>Average Score</h3>
                    <p className="stat-value">{analytics.avg_score?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                  </div>
                  <div className="stat-content">
                    <h3>Win Rate</h3>
                    <p className="stat-value">{((analytics.total_wins / (analytics.total_games || 1)) * 100).toFixed(0)}%</p>
                  </div>
                </div>
              </div>

              {/* Chart Buttons */}
              <div className="chart-buttons">
                <button onClick={() => setActiveChart('bar')} className="btn-chart">
                  <i className="bi bi-bar-chart-fill"></i> Attempts
                </button>
                <button onClick={() => setActiveChart('pie')} className="btn-chart">
                  <i className="bi bi-pie-chart-fill"></i> Win/Loss
                </button>
                <button onClick={() => setActiveChart('line')} className="btn-chart">
                  <i className="bi bi-graph-up"></i> Progression
                </button>
                <button onClick={() => setActiveChart('doughnut')} className="btn-chart">
                  <i className="bi bi-circle-half"></i> Distribution
                </button>
                <button onClick={() => setActiveChart('radar')} className="btn-chart">
                  <i className="bi bi-hexagon"></i> Performance
                </button>
                <button onClick={() => setActiveChart('timeSeries')} className="btn-chart">
                  <i className="bi bi-activity"></i> Time Series
                </button>
              </div>

              {/* Action Buttons */}
              <div className="analytics-actions">
                <button onClick={() => navigate('/leaderboard')} className="btn-success">
                  <i className="bi bi-trophy"></i> Leaderboard
                </button>
                <button onClick={() => navigate('/game')} className="btn-primary">
                  <i className="bi bi-controller"></i> Play New Game
                </button>
                <button onClick={onLogout} className="btn-danger">
                  <i className="bi bi-box-arrow-right"></i> Exit to Login
                </button>
              </div>
            </>
          ) : (
            <div className="analytics-empty">
              <i className="bi bi-graph-up-arrow" style={{ fontSize: '4rem', color: '#3377FF' }}></i>
              <h2>No games played yet</h2>
              <p>Start playing to see your performance analytics!</p>
              <button onClick={() => navigate('/game')} className="btn-primary">
                <i className="bi bi-controller"></i> Play Your First Game
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Chart Modal Popups */}
      {activeChart === 'bar' && (
        <div className="chart-modal-overlay" onClick={() => setActiveChart(null)}>
          <div className="chart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chart-modal-header">
              <h3><i className="bi bi-bar-chart-fill"></i> Attempts Distribution</h3>
              <button className="chart-close" onClick={() => setActiveChart(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="chart-modal-content">
              {attemptsDistributionData ? (
                <Bar data={attemptsDistributionData} options={chartOptions} />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7588' }}>
                  <p>No attempts data available yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeChart === 'pie' && (
        <div className="chart-modal-overlay" onClick={() => setActiveChart(null)}>
          <div className="chart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chart-modal-header">
              <h3><i className="bi bi-pie-chart-fill"></i> Win/Loss Distribution</h3>
              <button className="chart-close" onClick={() => setActiveChart(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="chart-modal-content">
              {winLossData ? (
                <Pie data={winLossData} options={chartOptions} />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7588' }}>
                  <p>No win/loss data available yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeChart === 'line' && (
        <div className="chart-modal-overlay" onClick={() => setActiveChart(null)}>
          <div className="chart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chart-modal-header">
              <h3><i className="bi bi-graph-up"></i> Score Progression (Last 10 Games)</h3>
              <button className="chart-close" onClick={() => setActiveChart(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="chart-modal-content">
              {recentGamesData ? (
                <Line data={recentGamesData} options={chartOptions} />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7588' }}>
                  <p>No game history available yet.</p>
                  <p>Play more games to see your score progression!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeChart === 'doughnut' && (
        <div className="chart-modal-overlay" onClick={() => setActiveChart(null)}>
          <div className="chart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chart-modal-header">
              <h3><i className="bi bi-circle-half"></i> Win/Loss Doughnut</h3>
              <button className="chart-close" onClick={() => setActiveChart(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="chart-modal-content">
              {doughnutData ? (
                <Doughnut data={doughnutData} options={chartOptions} />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7588' }}>
                  <p>No data available yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeChart === 'radar' && (
        <div className="chart-modal-overlay" onClick={() => setActiveChart(null)}>
          <div className="chart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chart-modal-header">
              <h3><i className="bi bi-hexagon"></i> Performance Radar</h3>
              <button className="chart-close" onClick={() => setActiveChart(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="chart-modal-content">
              {radarData ? (
                <Radar data={radarData} options={{
                  ...chartOptions,
                  scales: {
                    r: {
                      beginAtZero: true,
                      max: 100,
                      ticks: {
                        stepSize: 20,
                        font: {
                          size: 11,
                        },
                      },
                      pointLabels: {
                        font: {
                          size: 13,
                          weight: '600',
                        },
                      },
                      grid: {
                        color: 'rgba(51, 119, 255, 0.1)',
                      },
                    }
                  }
                }} />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7588' }}>
                  <p>Not enough data for performance analysis yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeChart === 'timeSeries' && (
        <div className="chart-modal-overlay" onClick={() => setActiveChart(null)}>
          <div className="chart-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chart-modal-header">
              <h3><i className="bi bi-activity"></i> Performance Over Time</h3>
              <button className="chart-close" onClick={() => setActiveChart(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="chart-modal-content">
              {timeSeriesData ? (
                <Line data={timeSeriesData} options={chartOptions} />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7588' }}>
                  <p>Not enough game history for time series analysis.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PerformanceAnalytics
