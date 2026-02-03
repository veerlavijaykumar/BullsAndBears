import { httpJson } from './http.js'
import { getAuthToken } from '../auth/tokenStorage.js'

export const gameApi = {
  // Start a new game
  startGame(timer = 180) {
    return httpJson('/api/game/start', {
      method: 'POST',
      body: { timer },
    })
  },

  // Submit a guess
  submitGuess(secretWord, guess) {
    return httpJson('/api/game/guess', {
      method: 'POST',
      body: { secret_word: secretWord, guess },
    })
  },

  // Complete a game and save to leaderboard
  completeGame({ secret_word, status, attempts_used, time_taken, score, player_name }) {
    const token = getAuthToken()
    return httpJson('/api/game/complete', {
      method: 'POST',
      body: { secret_word, status, attempts_used, time_taken, score, player_name },
      token,
    })
  },

  // Get leaderboard with pagination and search
  getLeaderboard({ limit = 1000, page = 1, page_size = 100, search = '' } = {}) {
    let url = `/api/game/leaderboard?limit=${limit}&page=${page}&page_size=${page_size}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return httpJson(url, { method: 'GET' });
  },

  // Get player analytics
  getAnalytics({ player_name }) {
    return httpJson(`/api/game/analytics?player_name=${encodeURIComponent(player_name)}`, {
      method: 'GET',
    })
  },

  // Get current user's coin balance
  getCoins() {
    const token = getAuthToken()
    return httpJson('/api/coins', {
      method: 'GET',
      token,
    })
  },

  // Get a hint (costs 10 coins)
  getHint(secretWord, revealedPositions = []) {
    const token = getAuthToken()
    return httpJson('/api/hint', {
      method: 'POST',
      body: { secret_word: secretWord, revealed_positions: revealedPositions },
      token,
    })
  },

  // Get word meaning and definition
  getWordMeaning(word) {
    return httpJson(`/api/word-meaning?word=${encodeURIComponent(word)}`, {
      method: 'GET',
    })
  },

  // Deduct 5 coins for meaning clue
  deductCoinsForMeaning() {
    const token = getAuthToken()
    return httpJson('/api/deduct-coins-meaning', {
      method: 'POST',
      token,
    })
  },
}
