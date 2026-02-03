from django.urls import path

from .views import (
    ApiLoginView, ApiLogoutView, ApiMeView, ApiRegisterView, ApiOtpRequestView, ApiOtpVerifyView, HealthView,
    ApiGameStartView, ApiGameGuessView, ApiGameCompleteView, ApiGameStateView, ApiGameAbandonView,
    ApiLeaderboardView, ApiPlayerStatsView, ApiGameHistoryView, ApiPerformanceAnalyticsView,
    ApiCoinsView, ApiHintView, ApiWordMeaningView, ApiDeductCoinsMeaningView
)

urlpatterns = [
    path('', HealthView.as_view(), name='health'),
    path('api/login', ApiLoginView.as_view(), name='api_login'),
    path('api/register', ApiRegisterView.as_view(), name='api_register'),
    path('api/otp/request', ApiOtpRequestView.as_view(), name='api_otp_request'),
    path('api/otp/verify', ApiOtpVerifyView.as_view(), name='api_otp_verify'),
    path('api/me', ApiMeView.as_view(), name='api_me'),
    path('api/logout', ApiLogoutView.as_view(), name='api_logout'),
    
    # Game endpoints
    path('api/game/start', ApiGameStartView.as_view(), name='api_game_start'),
    path('api/game/guess', ApiGameGuessView.as_view(), name='api_game_guess'),
    path('api/game/complete', ApiGameCompleteView.as_view(), name='api_game_complete'),
    path('api/game/state', ApiGameStateView.as_view(), name='api_game_state'),
    path('api/game/abandon', ApiGameAbandonView.as_view(), name='api_game_abandon'),
    path('api/game/leaderboard', ApiLeaderboardView.as_view(), name='api_game_leaderboard'),  # Frontend expects /api/game/leaderboard
    path('api/leaderboard', ApiLeaderboardView.as_view(), name='api_leaderboard'),  # Keep for backwards compatibility
    path('api/game/analytics', ApiPerformanceAnalyticsView.as_view(), name='api_game_analytics'),  # Frontend expects /api/game/analytics
    path('api/performance-analytics', ApiPerformanceAnalyticsView.as_view(), name='api_performance_analytics'),  # Keep for backwards compatibility
    path('api/stats', ApiPlayerStatsView.as_view(), name='api_player_stats'),
    path('api/history', ApiGameHistoryView.as_view(), name='api_game_history'),
    
    # Coins and hints endpoints
    path('api/coins', ApiCoinsView.as_view(), name='api_coins'),
    path('api/hint', ApiHintView.as_view(), name='api_hint'),
    path('api/deduct-coins-meaning', ApiDeductCoinsMeaningView.as_view(), name='api_deduct_coins_meaning'),
    
    # Word meaning endpoint
    path('api/word-meaning', ApiWordMeaningView.as_view(), name='api_word_meaning'),
]
