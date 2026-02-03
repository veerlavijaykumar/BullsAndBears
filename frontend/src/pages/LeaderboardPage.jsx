import { useState, useEffect } from 'react';
import { gameApi } from '../api/gameApi';
import { Link } from 'react-router-dom';
import './LeaderboardPage.css';

const DEFAULT_PAGE_SIZE = 10; // 10 entries per page with vertical scrolling

const LeaderboardPage = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [allLeaderboard, setAllLeaderboard] = useState([]); // Cache all data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const itemsPerPage = DEFAULT_PAGE_SIZE;

  useEffect(() => {
    fetchLeaderboard();
    // eslint-disable-next-line
  }, [search]);

  useEffect(() => {
    // Update displayed entries when page changes
    if (allLeaderboard.length > 0) {
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedEntries = allLeaderboard.slice(startIndex, endIndex);
      setLeaderboard(paginatedEntries);
    }
    // eslint-disable-next-line
  }, [currentPage, allLeaderboard]);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await gameApi.getLeaderboard({
        limit: 10000,
        page: 1,
        page_size: 10000,
        search: search.trim(),
      });
      
      // Get all leaderboard data
      const allEntries = response.leaderboard || [];
      setAllLeaderboard(allEntries);
      
      // Calculate pagination
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedEntries = allEntries.slice(startIndex, endIndex);
      
      setLeaderboard(paginatedEntries);
      setTotalPages(Math.ceil(allEntries.length / itemsPerPage));
      setCurrentPage(1); // Reset to page 1 on new search
    } catch (err) {
      setError(err.message || 'Failed to load leaderboard');
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    setSearch(searchInput);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const goToPage = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  };

  // Get top 3 for podium display - always from the overall leaderboard
  const top3 = allLeaderboard.slice(0, 3);

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <h1>🏆 Leaderboard</h1>
        <p className="leaderboard-subtitle">Top scores from Bulls and Bears players</p>
      </div>

      {error && <div className="leaderboard-error">{error}</div>}

      {loading ? (
        <div className="leaderboard-loading">Loading leaderboard...</div>
      ) : leaderboard.length === 0 ? (
        <div className="leaderboard-empty">
          <p>No games played yet. Be the first!</p>
          <Link to="/game">
            <button className="btn-primary">🎮 Start Playing</button>
          </Link>
        </div>
      ) : (
        <>
          {/* Combined Card with Podium and List */}
          <div className="leaderboard-combined-card">
            {/* Top 3 Podium - Always visible on all pages */}
            {top3.length >= 3 && (
              <div className="podium-container-mini">
                {/* Second Place */}
                <div className="podium-item-mini podium-second">
                  <div className="podium-avatar-mini">
                    <div className="avatar-circle-mini silver">
                      {top3[1].player_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="rank-badge-mini silver">2</div>
                  </div>
                  <div className="podium-name-mini">{top3[1].player_name}</div>
                  <div className="podium-score-mini">{top3[1].score.toFixed(2)}</div>
                  <div className="podium-time-mini">⏱️ {top3[1].time_taken}s</div>
                  <div className="podium-stand-mini silver-stand">2</div>
                </div>

                {/* First Place */}
                <div className="podium-item-mini podium-first">
                  <div className="crown-mini">👑</div>
                  <div className="podium-avatar-mini">
                    <div className="avatar-circle-mini gold">
                      {top3[0].player_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="rank-badge-mini gold">1</div>
                  </div>
                  <div className="podium-name-mini">{top3[0].player_name}</div>
                  <div className="podium-score-mini">{top3[0].score.toFixed(2)}</div>
                  <div className="podium-time-mini">⏱️ {top3[0].time_taken}s</div>
                  <div className="podium-stand-mini gold-stand">1</div>
                </div>

                {/* Third Place */}
                <div className="podium-item-mini podium-third">
                  <div className="podium-avatar-mini">
                    <div className="avatar-circle-mini bronze">
                      {top3[2].player_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="rank-badge-mini bronze">3</div>
                  </div>
                  <div className="podium-name-mini">{top3[2].player_name}</div>
                  <div className="podium-score-mini">{top3[2].score.toFixed(2)}</div>
                  <div className="podium-time-mini">⏱️ {top3[2].time_taken}s</div>
                  <div className="podium-stand-mini bronze-stand">3</div>
                </div>
              </div>
            )}

            {/* Table - Shows all entries for the current page */}
            <div className="leaderboard-table-wrapper">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th>PLAYER</th>
                    <th>SCORE</th>
                    <th>TIME (S)</th>
                    <th>WORD</th>
                    <th>ATTEMPTS</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => {
                    const displayRank = entry.rank;
                    
                    return (
                      <tr key={entry.rank}>
                        <td className={`rank-cell ${displayRank <= 3 ? `rank-${displayRank}` : ''}`}>
                          {displayRank <= 3 && <span className="medal-icon">{displayRank === 1 ? '🥇' : displayRank === 2 ? '🥈' : '🥉'}</span>}
                          {displayRank}
                        </td>
                        <td><span className="player-name">{entry.player_name}</span></td>
                        <td className="score-cell">{entry.score.toFixed(2)}</td>
                        <td className="time-cell">{entry.time_taken}</td>
                        <td className="word-cell">
                          <span className="word-badge">{entry.secret_word || '-'}</span>
                        </td>
                        <td className="attempts-cell">{entry.attempts_used}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls inside the card */}
            {totalPages > 1 && (
              <div className="pagination-container-inline">
                <button 
                  className="pagination-btn pagination-prev" 
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                
                <div className="pagination-info">
                  <span className="page-indicator">
                    Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                  </span>
                </div>

                <button 
                  className="pagination-btn pagination-next" 
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="back-button-container">
        <Link to="/game">
          <button className="btn-action">🎮 Play Game</button>
        </Link>
        <Link to="/landing">
          <button className="btn-action">🏠 Back to Home</button>
        </Link>
      </div>
    </div>
  );
};

export default LeaderboardPage;
