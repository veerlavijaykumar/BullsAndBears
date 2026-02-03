import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameApi } from '../api/gameApi';
import { useAuth } from '../auth/AuthContext';
import html2canvas from 'html2canvas';
import './BullsAndBearsGame.css';

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;
const DEFAULT_TIMER = 180; // 3 minutes

const BullsAndBearsGame = () => {
  const navigate = useNavigate();
  const { user, member, signOut } = useAuth();
  const [gameState, setGameState] = useState(null);
  const [currentGuess, setCurrentGuess] = useState('');
  const [attempts, setAttempts] = useState([]);
  const [gameStatus, setGameStatus] = useState('idle'); // idle, active, won, lost
  const [timeRemaining, setTimeRemaining] = useState(DEFAULT_TIMER);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [coins, setCoins] = useState(100); // User's coin balance
  const [hints, setHints] = useState([]); // Array of {position, letter} revealed by hints
  const [showCoinModal, setShowCoinModal] = useState(false); // Modal for insufficient coins
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    // Load dark mode preference from localStorage
    const savedMode = localStorage.getItem('darkMode');
    return savedMode === 'true';
  });
  const [soundEffects, setSoundEffects] = useState(() => {
    // Load sound effects preference from localStorage
    const savedSound = localStorage.getItem('soundEffects');
    return savedSound === null ? true : savedSound === 'true';
  });
  const [keyboardVibration, setKeyboardVibration] = useState(() => {
    // Load vibration preference from localStorage
    const savedVibration = localStorage.getItem('keyboardVibration');
    return savedVibration === null ? true : savedVibration === 'true';
  });
  const [wordMeaning, setWordMeaning] = useState(null); // Word meaning and definition
  const [meaningClueUsed, setMeaningClueUsed] = useState(false); // Track if meaning clue was used
  const [showMeaningModal, setShowMeaningModal] = useState(false); // Modal for showing meaning
  const timerRef = useRef(null);
  
  // Audio refs for sound effects
  const audioRefs = useRef({
    keyPress: new Audio('/sounds/key-press.mp3'),
    correct: new Audio('/sounds/correct.mp3'),
    present: new Audio('/sounds/present.mp3'),
    absent: new Audio('/sounds/absent.mp3'),
    win: new Audio('/sounds/win.mp3'),
    lose: new Audio('/sounds/lose.mp3'),
    hint: new Audio('/sounds/hint.mp3')
  });

  // Play sound effect
  const playSound = useCallback((soundName) => {
    if (soundEffects && audioRefs.current[soundName]) {
      audioRefs.current[soundName].currentTime = 0; // Reset to start
      audioRefs.current[soundName].play().catch(err => {
        console.log('Audio play failed:', err);
      });
    }
  }, [soundEffects]);

  // Trigger vibration
  const vibrate = useCallback((pattern = 50) => {
    if (keyboardVibration && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, [keyboardVibration]);

  // Apply dark mode to document
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // Persist sound effects preference
  useEffect(() => {
    localStorage.setItem('soundEffects', soundEffects);
  }, [soundEffects]);

  // Persist vibration preference
  useEffect(() => {
    localStorage.setItem('keyboardVibration', keyboardVibration);
  }, [keyboardVibration]);

  // Get player name from logged-in user or use Anonymous
  const getPlayerName = () => {
    if (member?.name) {
      return member.name;
    }
    if (user?.username) {
      return user.username;
    }
    if (user?.team_no) {
      return `Team ${user.team_no}`;
    }
    return 'Anonymous';
  };

  // Handle time up
  const handleTimeUp = async () => {
    // Time is up - game lost
    setGameStatus('lost');
    setError('Time is up!');
    
    // Save result to leaderboard
    if (gameState?.secret_word) {
      try {
        const startedAt = new Date(gameState.started_at);
        const timeTaken = (Date.now() - startedAt.getTime()) / 1000;
        
        await gameApi.completeGame({
          secret_word: gameState.secret_word,
          status: 'lost',
          attempts_used: attempts.length,
          time_taken: timeTaken,
          score: 0.0,
          player_name: getPlayerName()
        });
      } catch (err) {
        console.error('Error saving game result:', err);
      }
    }
  };

  // Timer countdown
  useEffect(() => {
    if (gameStatus === 'active' && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [gameStatus, timeRemaining, handleTimeUp]);

  const startNewGame = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await gameApi.startGame(DEFAULT_TIMER);
      setGameState(response);
      setAttempts([]);
      setCurrentGuess('');
      setTimeRemaining(DEFAULT_TIMER);
      setGameStatus('active');
      setHints([]); // Reset hints for new game
      setWordMeaning(null); // Reset word meaning for new game
      setMeaningClueUsed(false); // Reset meaning clue for new game
    } catch (err) {
      setError(err.message || 'Failed to start game');
    } finally {
      setLoading(false);
    }
  };

  const submitGuess = useCallback(async () => {
    // Build the complete guess by combining hints and user input
    let completeGuess = '';
    let userInputIndex = 0;
    
    for (let i = 0; i < WORD_LENGTH; i++) {
      const hint = hints.find(h => h.position === i);
      if (hint) {
        // This position has a hint - use hint letter
        completeGuess += hint.letter;
      } else {
        // This position needs user input
        completeGuess += currentGuess[userInputIndex] || '';
        userInputIndex++;
      }
    }
    
    if (completeGuess.length !== WORD_LENGTH) {
      setError(`Word must be ${WORD_LENGTH} letters`);
      return;
    }

    if (!/^[A-Za-z]+$/.test(completeGuess)) {
      setError('Only letters allowed');
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      // Call new API with secret_word and complete guess (hints + user input)
      const response = await gameApi.submitGuess(gameState.secret_word, completeGuess);
      
      const currentTime = new Date();
      const startedAt = new Date(gameState.started_at);
      const elapsedSeconds = Math.floor((currentTime - startedAt) / 1000);
      
      setAttempts(prev => [...prev, {
        guess: response.guess,
        feedback: response.feedback,
        timestamp: currentTime.toISOString(),
        elapsedSeconds: elapsedSeconds
      }]);

      // Play sound based on feedback
      const feedbackCounts = response.feedback.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
      }, {});
      
      if (feedbackCounts.correct > 0) {
        playSound('correct');
      } else if (feedbackCounts.present > 0) {
        playSound('present');
      } else {
        playSound('absent');
      }

      // Check if won
      if (response.is_correct) {
        // Play win sound
        setTimeout(() => playSound('win'), 500);
        
        // Calculate score using the ACTUAL countdown timer value
        // This is the most accurate representation of seconds remaining
        const timeRemainingSeconds = Math.max(0, timeRemaining);
        const attemptsUsedCount = attempts.length + 1;
        
        // Calculate actual time taken
        const startedAt = new Date(gameState.started_at);
        const timeTaken = (Date.now() - startedAt.getTime()) / 1000;
        
        // Scoring Formula (As per requirement):
        // Base Score = 1 point (for winning)
        // Time Bonus = 0.1 points × seconds remaining (from countdown timer)
        const baseScore = 1.0;
        const timeBonus = timeRemainingSeconds * 0.1;
        const totalScore = baseScore + timeBonus;
        
        // Update game state with scores first
        setGameState(prev => ({ 
          ...prev, 
          total_score: totalScore,
          time_bonus: timeBonus,
          base_score: baseScore,
          attempts_used: attemptsUsedCount,
          time_taken: timeTaken,
          time_remaining: timeRemainingSeconds, // Store the countdown timer value
          is_winning: true // Flag to identify winning state
        }));
        
        // Delay the winning state to allow the green animation to complete
        setTimeout(() => {
          setGameStatus('won');
        }, 1000); // 1.0 seconds - animation completes at ~0.78s (0.48s + 0.3s)
        
        // Save to leaderboard and get coins awarded
        try {
          const completeResponse = await gameApi.completeGame({
            secret_word: gameState.secret_word,
            status: 'won',
            attempts_used: attempts.length + 1,
            time_taken: timeTaken,
            score: totalScore,
            player_name: getPlayerName()
          });
          
          // Update coins if awarded
          if (completeResponse.coins_awarded) {
            setCoins(prev => prev + completeResponse.coins_awarded);
          } else {
            // Fallback: refetch coins after a short delay if not returned in response
            setTimeout(async () => {
              try {
                const coinsResponse = await gameApi.getCoins();
                setCoins(coinsResponse.coins);
              } catch (err) {
                console.error('Error refetching coins:', err);
              }
            }, 500);
          }
        } catch (err) {
          console.error('Error saving game result:', err);
        }
      } 
      // Check if lost (max attempts reached)
      else if (attempts.length + 1 >= MAX_ATTEMPTS) {
        // Play lose sound
        setTimeout(() => playSound('lose'), 500);
        
        setGameStatus('lost');
        
        // Save to leaderboard
        try {
          const startedAt = new Date(gameState.started_at);
          const timeTaken = (Date.now() - startedAt.getTime()) / 1000;
          
          await gameApi.completeGame({
            secret_word: gameState.secret_word,
            status: 'lost',
            attempts_used: attempts.length + 1,
            time_taken: timeTaken,
            score: 0.0,
            player_name: getPlayerName()
          });
        } catch (err) {
          console.error('Error saving game result:', err);
        }
      }

      setCurrentGuess('');
    } catch (err) {
      setError(err.message || 'Invalid word or error occurred');
    } finally {
      setLoading(false);
    }
  }, [currentGuess, gameState, attempts, getPlayerName, timeRemaining, hints, playSound]);

  // Fetch word meaning when game ends
  const fetchWordMeaning = useCallback(async (word) => {
    try {
      const response = await gameApi.getWordMeaning(word);
      setWordMeaning(response);
    } catch (err) {
      console.error('Error fetching word meaning:', err);
      setWordMeaning({
        word: word.toUpperCase(),
        meaning: 'Definition not available',
        definitions: [],
        parts_of_speech: []
      });
    }
  }, []);

  // Fetch word meaning when game status changes to won or lost
  useEffect(() => {
    if ((gameStatus === 'won' || gameStatus === 'lost') && gameState?.secret_word && !wordMeaning) {
      fetchWordMeaning(gameState.secret_word);
    }
  }, [gameStatus, gameState?.secret_word, wordMeaning, fetchWordMeaning]);

  // Fetch coins on component mount only
  useEffect(() => {
    const fetchCoins = async () => {
      try {
        const response = await gameApi.getCoins();
        setCoins(response.coins);
      } catch (err) {
        console.error('Error fetching coins:', err);
      }
    };

    if (member) {
      fetchCoins();
    }
  }, [member]); // Only fetch on mount, not on game status change

  // Auto-start game when component mounts (skip "How to Play" screen)
  useEffect(() => {
    let mounted = true;
    
    if (gameStatus === 'idle' && mounted) {
      startNewGame();
    }

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - we want to auto-start game once

  // Handle hint button click
  const handleHint = async () => {
    if (!gameState?.secret_word) {
      setError('No active game');
      return;
    }

    if (coins < 10) {
      setShowCoinModal(true);
      setTimeout(() => setShowCoinModal(false), 3000);
      return;
    }

    // Calculate which positions are already revealed (marked as correct in previous attempts)
    const revealedPositions = [];
    for (let i = 0; i < WORD_LENGTH; i++) {
      // Check if this position is already correct in any attempt
      const isAlreadyCorrect = attempts.some(attempt => 
        attempt.feedback[i] === 'correct'
      );
      if (isAlreadyCorrect) {
        revealedPositions.push(i);
      }
      // Also check if this position already has a hint
      const hasHint = hints.some(h => h.position === i);
      if (hasHint) {
        revealedPositions.push(i);
      }
    }

    // Don't allow hint if all positions are already revealed
    if (revealedPositions.length >= WORD_LENGTH) {
      setError('All positions are already revealed!');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await gameApi.getHint(gameState.secret_word, revealedPositions);
      
      // Add the hint to the hints array
      setHints(prev => [...prev, {
        position: response.hint.position,
        letter: response.hint.letter
      }]);
      
      // Play hint sound
      playSound('hint');
      
      // Update coins
      setCoins(response.remaining_coins);
      
    } catch (err) {
      if (err.message.includes('Not enough coins')) {
        setShowCoinModal(true);
        setTimeout(() => setShowCoinModal(false), 3000);
      } else {
        setError(err.message || 'Failed to get hint');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle meaning clue button click - Can be clicked multiple times, only deducts 5 coins once
  const handleMeaningClue = async () => {
    if (!gameState?.secret_word) {
      setError('No active game');
      return;
    }

    // If already used, just show the modal again (no coin deduction)
    if (meaningClueUsed && wordMeaning) {
      setShowMeaningModal(true);
      return;
    }

    // First time use - check coins and deduct
    if (coins < 5) {
      setShowCoinModal(true);
      setTimeout(() => setShowCoinModal(false), 3000);
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      // Fetch word meaning
      const meaningResponse = await gameApi.getWordMeaning(gameState.secret_word);
      setWordMeaning(meaningResponse);
      
      // Deduct 5 coins via backend (only on first use)
      const response = await gameApi.deductCoinsForMeaning();
      setCoins(response.remaining_coins);
      
      // Mark as used and show modal
      setMeaningClueUsed(true);
      setShowMeaningModal(true);
      
    } catch (err) {
      if (err.message.includes('Not enough coins')) {
        setShowCoinModal(true);
        setTimeout(() => setShowCoinModal(false), 3000);
      } else {
        setError(err.message || 'Failed to get meaning clue');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLetterClick = (letter) => {
    // Play key press sound and vibrate
    playSound('keyPress');
    vibrate(50);
    
    // Calculate how many non-hint positions we've filled
    let userFilledCount = 0;
    for (let i = 0; i < WORD_LENGTH; i++) {
      const hint = hints.find(h => h.position === i);
      if (!hint) {
        if (currentGuess[userFilledCount]) {
          userFilledCount++;
        } else {
          break;
        }
      }
    }
    
    // Only add if we haven't filled all non-hint positions
    const totalNonHintPositions = WORD_LENGTH - hints.length;
    if (userFilledCount < totalNonHintPositions) {
      setCurrentGuess(prev => (prev + letter).toUpperCase());
    }
  };

  const handleBackspace = () => {
    playSound('keyPress');
    vibrate(30);
    setCurrentGuess(prev => prev.slice(0, -1));
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      // Navigate anyway
      navigate('/login');
    }
  };

  const shareResults = async () => {
    const emoji = attempts.map(attempt => 
      attempt.feedback.map(f => 
        f === 'correct' ? '🟩' : f === 'present' ? '🟨' : '⬜'
      ).join('')
    ).join('\n');

    // Generate congratulatory message based on performance
    let congratsMessage = '';
    const attemptsUsed = attempts.length;
    const scoreValue = gameState?.total_score || 0;
    
    if (attemptsUsed === 1) {
      congratsMessage = '🎯 ABSOLUTE GENIUS! First try!';
    } else if (attemptsUsed === 2) {
      congratsMessage = '🌟 You are a GENIUS! Incredible!';
    } else if (attemptsUsed <= 3) {
      congratsMessage = '🔥 BRILLIANT! Outstanding performance!';
    } else if (attemptsUsed <= 4) {
      congratsMessage = '⭐ IMPRESSIVE! Great job!';
    } else if (attemptsUsed <= 5) {
      congratsMessage = '💪 WELL DONE! Nice work!';
    } else {
      congratsMessage = '✨ VICTORY! You did it!';
    }

    const text = `${congratsMessage}\n\nBulls and Bears ${attempts.length}/${MAX_ATTEMPTS}\nScore: ${scoreValue.toFixed(2)} points\n\n${emoji}\n\nPlay now at: localhost:5173/game`;
    
    try {
      // Capture the game result screen
      const resultElement = document.querySelector('.game-result-card');
      if (resultElement) {
        const canvas = await html2canvas(resultElement, {
          backgroundColor: '#FFFFFF',
          scale: 2,
          logging: false,
          useCORS: true
        });
        
        // Convert canvas to blob
        canvas.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], 'bulls-and-bears-result.png', { type: 'image/png' });
            
            // Try to share with both text and image
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
              try {
                await navigator.share({
                  text: text,
                  files: [file]
                });
                return;
              } catch (err) {
                if (err.name !== 'AbortError') {
                  console.error('Error sharing:', err);
                }
              }
            }
            
            // Fallback: Copy text and download image
            navigator.clipboard.writeText(text);
            
            // Download the image
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'bulls-and-bears-result.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            alert('Results copied to clipboard and image downloaded! 📋🖼️');
          }
        }, 'image/png');
      }
    } catch (err) {
      console.error('Error capturing screenshot:', err);
      // Fallback to text only
      if (navigator.share) {
        try {
          await navigator.share({ text });
        } catch {
          navigator.clipboard.writeText(text);
          alert('Results copied to clipboard! 📋');
        }
      } else {
        navigator.clipboard.writeText(text);
        alert('Results copied to clipboard! 📋');
      }
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getLetterStatus = (letter) => {
    let hasPresent = false;
    
    for (const attempt of attempts) {
      for (let i = 0; i < attempt.guess.length; i++) {
        if (attempt.guess[i] === letter) {
          if (attempt.feedback[i] === 'correct') return 'correct';
          if (attempt.feedback[i] === 'present') hasPresent = true;
        }
      }
    }
    
    if (hasPresent) return 'present';
    
    // Check if letter was used but marked as absent
    for (const attempt of attempts) {
      if (attempt.guess.includes(letter)) return 'absent';
    }
    
    return 'unused';
  };

  const keyboard = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DEL']
  ];

  // Calculate timer percentage and color
  const getTimerColor = () => {
    const percentage = (timeRemaining / DEFAULT_TIMER) * 100;
    if (percentage > 66) return '#06C270'; // Green
    if (percentage > 33) return '#FFB800'; // Yellow/Orange
    return '#FF3B3B'; // Red
  };

  const getTimerPercentage = () => {
    return (timeRemaining / DEFAULT_TIMER) * 100;
  };

  // Enable keyboard input on component mount
  useEffect(() => {
    const handleGlobalKeyPress = (e) => {
      if (gameStatus !== 'active') return;
      
      if (e.key === 'Enter' && !loading) {
        e.preventDefault();
        submitGuess();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        playSound('keyPress');
        vibrate(30);
        setCurrentGuess(prev => prev.slice(0, -1));
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        // Calculate how many non-hint positions are available
        const totalNonHintPositions = WORD_LENGTH - hints.length;
        if (currentGuess.length < totalNonHintPositions) {
          playSound('keyPress');
          vibrate(50);
          setCurrentGuess(prev => (prev + e.key).toUpperCase());
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyPress);
    return () => window.removeEventListener('keydown', handleGlobalKeyPress);
  }, [gameStatus, loading, currentGuess, submitGuess, hints, playSound, vibrate]);

  return (
    <div className="game-page-wrapper">
      {/* Navigation Bar - Document Level */}
      <nav className="game-navbar">
        <div className="navbar-content">
          <h1 className="navbar-title">Bulls and Bears</h1>
          <div className="navbar-actions">
            {/* Hint Button - Only show during active game */}
            {gameStatus === 'active' && (
              <button 
                className="navbar-icon-btn navbar-hint-btn"
                onClick={handleHint}
                disabled={loading || hints.length >= 5}
                aria-label="Get Hint"
                title={`Get a hint (10 coins) - ${hints.length}/5 used`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18h6"/>
                  <path d="M10 22h4"/>
                  <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.5 4.5-3.5 6a2 2 0 0 0-.5 1.5V18h-6v-1.5a2 2 0 0 0-.5-1.5C6.5 13.5 5 11.5 5 9a7 7 0 0 1 7-7z"/>
                </svg>
                <span className="hint-badge">10</span>
              </button>
            )}
            
            {/* Separator */}
            {gameStatus === 'active' && <div className="navbar-separator"></div>}

            {/* Dictionary/Meaning Clue Button - Active until game over, deducts 5 coins only once */}
            {gameStatus === 'active' && (
              <button 
                className="navbar-icon-btn navbar-meaning-btn"
                onClick={handleMeaningClue}
                disabled={loading}
                aria-label="Get Meaning Clue"
                title={meaningClueUsed ? "View word meaning (Already paid 5 coins)" : "Get word meaning (5 coins)"}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  <path d="M12 8v8"></path>
                  <path d="M9 12h6"></path>
                </svg>
                <span className={`meaning-badge ${meaningClueUsed ? 'used' : ''}`}>
                  {meaningClueUsed ? '✓' : '5'}
                </span>
              </button>
            )}
            
            {/* Separator */}
            {gameStatus === 'active' && <div className="navbar-separator"></div>}

            {/* Help Icon */}
            <button 
              className="navbar-icon-btn"
              onClick={() => setShowHelpModal(true)}
              aria-label="Help"
              title="How to Play"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </button>

            {/* Leaderboard Icon */}
            <button 
              className="navbar-icon-btn"
              onClick={() => navigate('/leaderboard')}
              aria-label="Leaderboard"
              title="View Leaderboard"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                {/* Star on top */}
                <path d="M12 2l1.5 4.5h4.5l-3.5 2.5 1.5 4.5-3.5-2.5-3.5 2.5 1.5-4.5-3.5-2.5h4.5z"/>
                {/* Podium base */}
                <rect x="2" y="20" width="20" height="2" rx="1"/>
                {/* 3rd place (left) */}
                <rect x="2" y="15" width="5" height="5" rx="0.5"/>
                {/* 1st place (center - tallest) */}
                <rect x="8.5" y="11" width="7" height="9" rx="0.5"/>
                {/* 2nd place (right) */}
                <rect x="17" y="13" width="5" height="7" rx="0.5"/>
              </svg>
            </button>

            {/* Settings Icon */}
            <button 
              className="navbar-icon-btn"
              onClick={() => setShowSettingsModal(true)}
              aria-label="Settings"
              title="Settings"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6m0-12a3 3 0 0 0-3 3m6 0a3 3 0 0 0-3-3m3 3h6m-6 0H7m5-3V1m0 6v6m0-6a3 3 0 0 1 3 3m-6 0a3 3 0 0 1 3-3m3 3h6m-18 0h6"></path>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>

            {/* Profile Icon with Dropdown */}
            <div className="profile-dropdown-container">
              <button 
                className="navbar-icon-btn profile-icon-btn"
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                aria-label="User Profile"
                title="Profile"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </button>
              {showProfileDropdown && (
                <div className="profile-dropdown">
                  <div className="profile-dropdown-header">
                    <div className="profile-avatar">
                      {getPlayerName().charAt(0).toUpperCase()}
                    </div>
                    <div className="profile-info">
                      <div className="profile-name">{getPlayerName()}</div>
                      {member?.team_no && <div className="profile-team">Team {member.team_no}</div>}
                    </div>
                  </div>
                  <div className="profile-dropdown-divider"></div>
                  <div className="profile-stats">
                    <div className="profile-stat-item">
                      <span className="stat-label">Coins</span>
                      <span className="stat-value">{coins}</span>
                    </div>
                    <div className="profile-stat-item">
                      <span className="stat-label">Attempts</span>
                      <span className="stat-value">{attempts.length}/{MAX_ATTEMPTS}</span>
                    </div>
                    <div className="profile-stat-item">
                      <span className="stat-label">Time</span>
                      <span className="stat-value">{formatTime(timeRemaining)}</span>
                    </div>
                  </div>
                  <div className="profile-dropdown-divider"></div>
                  <button className="profile-logout-btn" onClick={handleLogout}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="game-scroll-container">
        <div className="game-container" tabIndex={0}>
          <div className="game-info-bar">
            <div className="info-item">
              <div className="circular-timer" style={{ '--timer-color': getTimerColor() }}>
                <svg className="timer-ring" viewBox="0 0 120 120">
                  <circle
                    className="timer-ring-bg"
                    cx="60"
                    cy="60"
                    r="54"
                  />
                  <circle
                    className="timer-ring-progress"
                    cx="60"
                    cy="60"
                    r="54"
                    style={{
                      strokeDashoffset: `${339.29 * (1 - getTimerPercentage() / 100)}`
                    }}
                  />
                </svg>
                <div className="timer-text">
                  {formatTime(timeRemaining)}
                </div>
              </div>
            </div>
            <div className="info-item">
              <span className="info-label">Attempts</span>
              <span className="info-value">{attempts.length}/{MAX_ATTEMPTS}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Coins</span>
              <span className="info-value">{coins}</span>
            </div>
          </div>

      {error && <div className="error-message">{error}</div>}

      {/* Show loading state while game is starting */}
      {gameStatus === 'idle' && (
        <div className="game-start">
          <h2 className="demo-title">Starting Game...</h2>
          <p className="demo-description">Please wait while we prepare your game.</p>
        </div>
      )}

      {gameStatus === 'active' && (
        <div className="game-board">
          <div className="attempts-grid">
            {[...Array(MAX_ATTEMPTS)].map((_, rowIndex) => {
              const attempt = attempts[rowIndex];
              const isWinningRow = gameState?.is_winning && rowIndex === attempts.length - 1;
              const isCurrentRow = rowIndex === attempts.length && !gameState?.is_winning;
              
              return (
                <div key={rowIndex} className={`attempt-row ${isWinningRow ? 'winning-row' : ''}`}>
                  {[...Array(WORD_LENGTH)].map((_, colIndex) => {
                    // Check if this position has a hint
                    const hint = isCurrentRow ? hints.find(h => h.position === colIndex) : null;
                    
                    // Determine letter to display
                    let letter = '';
                    if (attempt) {
                      // Past attempts - show the guessed letter
                      letter = attempt.guess[colIndex];
                    } else if (isCurrentRow) {
                      // Current input row - show hint letter OR user typed letter
                      if (hint) {
                        // This position has a hint - show hint letter
                        letter = hint.letter;
                      } else {
                        // Find which user input index this corresponds to (skip hint positions)
                        let userInputIndex = 0;
                        for (let i = 0; i < colIndex; i++) {
                          const hintAtI = hints.find(h => h.position === i);
                          if (!hintAtI) {
                            userInputIndex++;
                          }
                        }
                        letter = currentGuess[userInputIndex] || '';
                      }
                    }
                    
                    const status = attempt ? attempt.feedback[colIndex] : '';

                    return (
                      <div 
                        key={colIndex} 
                        className={`letter-box ${status} ${hint ? 'hint-box' : ''}`}
                        style={hint ? { background: '#00D2FF', color: '#fff', borderColor: '#00B2CC' } : {}}
                      >
                        {letter}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="keyboard">
            {keyboard.map((row, rowIndex) => (
              <div key={rowIndex} className="keyboard-row">
                {row.map(key => {
                  const status = key.length === 1 ? getLetterStatus(key) : '';
                  return (
                    <button
                      key={key}
                      className={`key ${status} ${key.length > 1 ? 'key-special' : ''}`}
                      onClick={() => {
                        if (key === 'ENTER') submitGuess();
                        else if (key === 'DEL') handleBackspace();
                        else handleLetterClick(key);
                      }}
                      disabled={loading}
                    >
                      {key === 'DEL' ? '⌫' : key}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {(gameStatus === 'won' || gameStatus === 'lost') && (
        <div className="game-result">
          <div className="game-result-card">
            <div className="game-result-card-header">
              {gameStatus === 'lost' ? (
                <span className="game-result-icon heartbreak">
                  {/* Heartbreak SVG icon */}
                  <svg width="54" height="54" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M27 48s-13.5-10.5-18-16.5C3 27 3 18 10.5 13.5C15.75 10.5 21.75 13.5 27 21C32.25 13.5 38.25 10.5 43.5 13.5C51 18 51 27 45 31.5C40.5 37.5 27 48 27 48Z" fill="#FF3B3B" stroke="#FF3B3B" strokeWidth="2.5"/>
                    <path d="M27 21L23 28L28 32L24 39" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              ) : (
                <span className="game-result-icon trophy">
                  {/* Trophy SVG icon */}
                  <svg width="54" height="54" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="14" y="8" width="26" height="20" rx="8" fill="#06C270" stroke="#06C270" strokeWidth="2.5"/>
                    <path d="M27 28V44" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
                    <ellipse cx="27" cy="48" rx="8" ry="3" fill="#06C270"/>
                    <path d="M14 14C7 14 7 24 14 24" stroke="#06C270" strokeWidth="2.5"/>
                    <path d="M40 14C47 14 47 24 40 24" stroke="#06C270" strokeWidth="2.5"/>
                  </svg>
                </span>
              )}
              <h2 className="game-result-title">{gameStatus === 'won' ? 'You Won!' : 'Game Over'}</h2>
              {gameStatus === 'lost' && (
                <div className="fail-message">
                  You have failed. <span className="fail-highlight">Better luck next time!</span>
                </div>
              )}
            </div>
            <div className="game-result-card-body">
              <div className="result-details-card">
                <p className="secret-word-reveal">The word was: <strong>{gameState?.secret_word?.toUpperCase()}</strong></p>
                {/* Word Meaning - Compact inline display */}
                {wordMeaning && wordMeaning.meaning && (
                  <p className="word-meaning-compact">
                    {wordMeaning.meaning}
                  </p>
                )}
              </div>
              
              {/* Score Breakdown - Only show when won */}
              {gameStatus === 'won' && gameState?.total_score && (
                <div className="score-breakdown-container">
                  <p className="total-score">Total Score: <strong>{gameState.total_score.toFixed(2)}</strong></p>
                  <div className="score-components">
                    <div className="score-item">
                      <span className="score-label">Base Score:</span>
                      <span className="score-value">{gameState.base_score?.toFixed(2) || '1.00'} pts</span>
                    </div>
                    <div className="score-item">
                      <span className="score-label">Time Bonus (0.1 × {Math.round(gameState.time_remaining || 0)}s):</span>
                      <span className="score-value">+{gameState.time_bonus?.toFixed(2) || '0.00'} pts</span>
                    </div>
                  </div>
                  <p className="time-taken">⏱ Total Time: {formatTime(Math.round(gameState.time_taken || 0))}</p>
                </div>
              )}
            </div>
          </div>
          <div className="result-action-row">
            <div className="result-action-row-top">
              <button className="btn-primary" onClick={startNewGame}>
                Play Again
              </button>
              <button className="btn-secondary btn-timeline" onClick={() => setShowTimeline(true)}>
                View Timeline
              </button>
            </div>
            <div className="result-action-row-bottom">
              <button className="btn-secondary btn-leaderboard" onClick={() => navigate('/leaderboard')}>
                Leaderboard
              </button>
              {gameStatus === 'won' && (
                <button className="btn-secondary btn-share" onClick={shareResults}>
                  Share
                </button>
              )}
              <button className="btn-secondary btn-analytics" onClick={() => navigate('/analytics')}>
                Analytics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Modal */}
      {showTimeline && (
        <div className="timeline-modal-overlay" onClick={() => setShowTimeline(false)}>
          <div className="timeline-modal" onClick={(e) => e.stopPropagation()}>
            <div className="timeline-modal-header">
              <h3>Game Timeline</h3>
              <button className="timeline-close" onClick={() => setShowTimeline(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="timeline-modal-content">
              {attempts.map((attempt, index) => {
                // Calculate time taken for this specific attempt ONLY (in seconds)
                const timeTakenForAttempt = index === 0 
                  ? attempt.elapsedSeconds 
                  : attempt.elapsedSeconds - attempts[index - 1].elapsedSeconds;
                
                // Format duration in a readable way
                let durationLabel;
                if (timeTakenForAttempt < 60) {
                  // Less than 60 seconds - show as seconds
                  durationLabel = `+${timeTakenForAttempt}s`;
                } else {
                  // 60+ seconds - show as minutes:seconds
                  const mins = Math.floor(timeTakenForAttempt / 60);
                  const secs = timeTakenForAttempt % 60;
                  durationLabel = `+${mins}m ${secs}s`;
                }
                
                // Format the timestamp - clean and compact
                const attemptTime = new Date(attempt.timestamp);
                const timeString = attemptTime.toLocaleTimeString('en-US', { 
                  hour: 'numeric', 
                  minute: '2-digit',
                  hour12: true 
                }).replace(' ', '');
                
                return (
                  <div key={index} className="timeline-item">
                    <div className="timeline-marker">{index + 1}</div>
                    <div className="timeline-content">
                      <div className="timeline-word">
                        {attempt.guess.split('').map((letter, i) => (
                          <div key={i} className={`timeline-letter ${attempt.feedback[i]}`}>
                            {letter}
                          </div>
                        ))}
                      </div>
                      <div className="timeline-meta">
                        <div className="timeline-meta-left">
                          <div className="timeline-time-label">Time: {timeString}</div>
                        </div>
                        <div className="timeline-meta-right">
                          <div className="timeline-duration-label" title={`Time taken for this attempt: ${timeTakenForAttempt} seconds`}>
                            {durationLabel}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Coin Modal */}
      {showCoinModal && (
        <div className="coin-modal-overlay" onClick={() => setShowCoinModal(false)}>
          <div className="coin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="coin-modal-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="currentColor">
                <circle cx="32" cy="32" r="30" fill="#FFCC00"/>
                <text x="32" y="42" textAnchor="middle" fontSize="32" fontWeight="bold" fill="#8B6500">$</text>
              </svg>
            </div>
            <h3>Insufficient Coins</h3>
            <p>You need <strong>10 coins</strong> to get a hint.</p>
            <p className="coin-balance">Your balance: {coins} coins</p>
            <p className="coin-tip">💡 Win games to earn more coins!</p>
            <button className="btn-primary" onClick={() => setShowCoinModal(false)}>
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="help-modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-modal-header">
              <h3>How to Play</h3>
              <button className="modal-close" onClick={() => setShowHelpModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="help-modal-content">
              <div className="help-section">
                <h4>Objective</h4>
                <p>Guess the 5-letter word in 6 tries or less within the time limit!</p>
              </div>

              <div className="help-section">
                <h4>How to Play</h4>
                <ul>
                  <li>Each guess must be a valid 5-letter word</li>
                  <li>After each guess, the color of the tiles will change to show how close your guess was</li>
                  <li>You have 3 minutes to complete the game</li>
                  <li>Use hints (costs 10 coins) to reveal letters</li>
                </ul>
              </div>

              <div className="help-section">
                <h4>Examples</h4>
                <div className="help-example">
                  <div className="demo-word">
                    <div className="demo-letter correct">W</div>
                    <div className="demo-letter">O</div>
                    <div className="demo-letter">R</div>
                    <div className="demo-letter">D</div>
                    <div className="demo-letter">S</div>
                  </div>
                  <p><strong className="color-success">W</strong> is in the word and in the correct spot</p>
                </div>

                <div className="help-example">
                  <div className="demo-word">
                    <div className="demo-letter">P</div>
                    <div className="demo-letter present">L</div>
                    <div className="demo-letter">A</div>
                    <div className="demo-letter">N</div>
                    <div className="demo-letter">T</div>
                  </div>
                  <p><strong className="color-warning">L</strong> is in the word but in the wrong spot</p>
                </div>

                <div className="help-example">
                  <div className="demo-word">
                    <div className="demo-letter">V</div>
                    <div className="demo-letter">A</div>
                    <div className="demo-letter">G</div>
                    <div className="demo-letter">U</div>
                    <div className="demo-letter absent">E</div>
                  </div>
                  <p><strong className="color-absent">E</strong> is not in the word anywhere</p>
                </div>
              </div>

              <div className="help-section">
                <h4>Scoring</h4>
                <p>Your score is calculated based on:</p>
                <ul>
                  <li>Base Score: 1.00 point</li>
                  <li>Time Bonus: 0.1 × seconds remaining</li>
                  <li>Fewer attempts = Higher score!</li>
                </ul>
              </div>

              <div className="help-section">
                <h4>Coins & Hints</h4>
                <ul>
                  <li>Start with 100 coins</li>
                  <li><strong>Letter Hint:</strong> 10 coins - Reveals one letter position</li>
                  <li><strong>Meaning Clue:</strong> 5 coins - Shows word definition (once per game)</li>
                  <li>Earn coins by winning games</li>
                  <li>Use hints strategically!</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="settings-modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h3>Settings</h3>
              <button className="modal-close" onClick={() => setShowSettingsModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="settings-modal-content">
              <div className="settings-section">
                <div className="setting-item">
                  <div className="setting-info">
                    <h4>Dark Mode</h4>
                    <p>Toggle between light and dark themes</p>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={darkMode}
                      onChange={(e) => setDarkMode(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <h4>Sound Effects</h4>
                    <p>Enable or disable game sounds</p>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={soundEffects}
                      onChange={(e) => setSoundEffects(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <h4>Keyboard Vibration</h4>
                    <p>Haptic feedback on mobile devices</p>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={keyboardVibration}
                      onChange={(e) => setKeyboardVibration(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="settings-section">
                <h4>Game Information</h4>
                <div className="game-info-item">
                  <span className="info-label">Version</span>
                  <span className="info-value">1.0.0</span>
                </div>
                <div className="game-info-item">
                  <span className="info-label">Player</span>
                  <span className="info-value">{getPlayerName()}</span>
                </div>
                {member?.team_no && (
                  <div className="game-info-item">
                    <span className="info-label">Team</span>
                    <span className="info-value">Team {member.team_no}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meaning Clue Modal */}
      {showMeaningModal && wordMeaning && (
        <div className="meaning-modal-overlay" onClick={() => setShowMeaningModal(false)}>
          <div className="meaning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="meaning-modal-header">
              <h3>Word Meaning Clue</h3>
              <button className="modal-close" onClick={() => setShowMeaningModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="meaning-modal-content">
              <div className="meaning-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  <circle cx="12" cy="10" r="2"></circle>
                  <path d="M12 12v3"></path>
                </svg>
              </div>
              <div className="meaning-content">
                <p className="meaning-text">{wordMeaning.meaning}</p>
                {wordMeaning.definitions && wordMeaning.definitions.length > 0 && (
                  <div className="meaning-definitions">
                    <h4>Definitions:</h4>
                    <ul>
                      {wordMeaning.definitions.slice(0, 2).map((def, idx) => (
                        <li key={idx}>{def}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <p className="meaning-cost">5 coins deducted • Remaining: {coins} coins</p>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default BullsAndBearsGame;
