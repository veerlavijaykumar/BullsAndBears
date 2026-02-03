from django.contrib import admin
from .models import AppUser, AppUserMember, AuthSession, OtpChallenge, VocabWord, GameResult

@admin.register(AppUser)
class AppUserAdmin(admin.ModelAdmin):
    list_display = ['username', 'team_no', 'email', 'phone', 'is_active', 'created_at']
    search_fields = ['username', 'email', 'phone']
    list_filter = ['is_active', 'team_no']

@admin.register(AppUserMember)
class AppUserMemberAdmin(admin.ModelAdmin):
    list_display = ['user', 'name', 'email', 'phone', 'member_id']
    search_fields = ['name', 'email', 'phone', 'member_id']
    list_filter = ['user']

@admin.register(AuthSession)
class AuthSessionAdmin(admin.ModelAdmin):
    list_display = ['user', 'member', 'created_at', 'expires_at', 'revoked_at']
    list_filter = ['created_at', 'expires_at']
    search_fields = ['user__username', 'member__name']
    readonly_fields = ['created_at']

@admin.register(OtpChallenge)
class OtpChallengeAdmin(admin.ModelAdmin):
    list_display = ['identifier', 'member', 'created_at', 'expires_at', 'consumed_at']
    list_filter = ['created_at', 'expires_at']
    search_fields = ['identifier']
    readonly_fields = ['created_at']

@admin.register(VocabWord)
class VocabWordAdmin(admin.ModelAdmin):
    list_display = ['word']
    search_fields = ['word']

@admin.register(GameResult)
class GameResultAdmin(admin.ModelAdmin):
    list_display = ['game_name', 'player_id', 'absolute_score', 'percentage_score', 'start_time', 'created_at']
    list_filter = ['game_name', 'created_at']
    search_fields = ['player_id', 'game_name']
    readonly_fields = ['created_at']
    ordering = ['-absolute_score', '-created_at']
