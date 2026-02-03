from django.db import models
from django.utils import timezone


class AppUser(models.Model):
    team_no = models.PositiveIntegerField(unique=True, null=True, blank=True)
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(max_length=254, unique=True, null=True, blank=True)
    phone = models.CharField(max_length=32, unique=True, null=True, blank=True)

    password_salt_b64 = models.CharField(max_length=64)
    password_hash_b64 = models.CharField(max_length=128)
    password_iterations = models.PositiveIntegerField()

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.username


class AppUserMember(models.Model):
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name='members')
    member_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(max_length=254, null=True, blank=True)
    phone = models.CharField(max_length=32)
    coins = models.IntegerField(default=100)  # User coins for hints
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user', 'phone'], name='uniq_member_phone_per_team'),
        ]
        indexes = [
            models.Index(fields=['user', 'phone']),
        ]

    def __str__(self) -> str:
        return f'{self.user.username}:{self.phone}'


class AuthSession(models.Model):
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name='sessions')
    member = models.ForeignKey(AppUserMember, on_delete=models.CASCADE, related_name='sessions', null=True, blank=True)
    token_hash = models.CharField(max_length=64, unique=True)

    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['user', 'expires_at']),
            models.Index(fields=['member', 'expires_at']),
        ]

    def is_valid(self) -> bool:
        if self.revoked_at is not None:
            return False
        return self.expires_at > timezone.now()


class OtpChallenge(models.Model):
    identifier = models.CharField(max_length=255)
    member = models.ForeignKey(AppUserMember, on_delete=models.CASCADE, related_name='otp_challenges', null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['identifier', 'expires_at']),
            models.Index(fields=['member', 'expires_at']),
            models.Index(fields=['expires_at']),
        ]

    def is_valid(self) -> bool:
        if self.consumed_at is not None:
            return False
        return self.expires_at > timezone.now()


class VocabWord(models.Model):
    """Maps to existing lsm_vocab1 table in team25 database"""
    word_id = models.AutoField(primary_key=True)
    word = models.CharField(max_length=100)
    s1 = models.CharField(max_length=100, null=True, blank=True)
    s2 = models.CharField(max_length=100, null=True, blank=True)
    s3 = models.CharField(max_length=100, null=True, blank=True)
    s4 = models.CharField(max_length=100, null=True, blank=True)
    s5 = models.CharField(max_length=100, null=True, blank=True)
    a1 = models.CharField(max_length=100, null=True, blank=True)
    a2 = models.CharField(max_length=100, null=True, blank=True)
    a3 = models.CharField(max_length=100, null=True, blank=True)
    a4 = models.CharField(max_length=100, null=True, blank=True)
    a5 = models.CharField(max_length=100, null=True, blank=True)
    
    class Meta:
        managed = False  # Don't create/modify this table
        db_table = 'lsm_vocab1'  # Use existing lsm_vocab1 table
    
    def __str__(self) -> str:
        return self.word.upper()
    
    def get_all_5_letter_words(self):
        """Extract all 5-letter words from word, s1-s5, and a1-a5 columns"""
        words = set()
        
        # Add main word if it's 5 letters
        if self.word and len(self.word.strip()) == 5:
            words.add(self.word.strip().upper())
        
        # Add s1-s5 words (synonyms)
        for field in [self.s1, self.s2, self.s3, self.s4, self.s5]:
            if field and len(field.strip()) == 5:
                words.add(field.strip().upper())
        
        # Add a1-a5 words (antonyms)
        for field in [self.a1, self.a2, self.a3, self.a4, self.a5]:
            if field and len(field.strip()) == 5:
                words.add(field.strip().upper())
        
        return list(words)


class GameResult(models.Model):
    """Maps to existing gameresults table in team25 database
    
    Table columns: result_id, game_id, game_name, player_id, start_time, end_time, 
                   duration, absolute_score, percentage_score, game_session_data, 
                   words_played, created_at
    """
    # Map to existing columns - result_id is the primary key
    result_id = models.AutoField(primary_key=True, db_column='result_id')
    
    # Game identification - game_id is VARCHAR in the database
    game_id = models.CharField(max_length=50, default='1', db_column='game_id')
    game_name = models.CharField(max_length=100, default='Bulls and Bears', db_column='game_name')
    player_id = models.CharField(max_length=50, null=False, db_column='player_id')
    
    # Timing fields
    start_time = models.DateTimeField(null=False, db_column='start_time')
    end_time = models.DateTimeField(null=True, blank=True, db_column='end_time')
    duration = models.IntegerField(null=True, blank=True, db_column='duration')
    
    # Score fields - percentage_score is VARCHAR in database
    absolute_score = models.IntegerField(default=0, db_column='absolute_score')
    percentage_score = models.CharField(max_length=50, default='0', db_column='percentage_score')
    
    # Store game state as JSON
    game_session_data = models.TextField(null=True, blank=True, db_column='game_session_data')
    
    # Words played - this is INTEGER count of words, not the word itself
    words_played = models.IntegerField(default=0, null=True, blank=True, db_column='words_played')
    
    created_at = models.DateTimeField(default=timezone.now, db_column='created_at')

    class Meta:
        managed = False  # Don't create/modify this table
        db_table = 'gameresults'  # Use existing table
        ordering = ['-absolute_score', '-created_at']

    def __str__(self) -> str:
        return f'{self.game_name} - Score: {self.absolute_score}'
