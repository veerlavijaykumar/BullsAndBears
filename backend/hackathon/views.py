import json
import re
import random
from datetime import timedelta
import enchant
import requests

from django.http import HttpRequest, JsonResponse
from django.db import transaction, connections
from django.utils import timezone
from django.views import View
from django.db.models import Sum, Avg, Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

from .auth import (
    create_session_token,
    OtpDispatchError,
    OtpVerifyError,
    get_session_times,
    hash_session_token,
    hash_password,
    dispatch_otp,
    verify_otp_via_gateway,
    verify_password,
)
from .models import AppUser, AppUserMember, AuthSession, OtpChallenge, VocabWord, GameResult
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication


def _normalize_phone(raw: str) -> str:
    return re.sub(r'\D+', '', (raw or '').strip())


def _get_bearer_token(request: HttpRequest) -> str | None:
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None

    prefix = 'Bearer '
    if not auth_header.startswith(prefix):
        return None

    token = auth_header[len(prefix) :].strip()
    return token or None


def _get_session(request: HttpRequest) -> AuthSession | None:
    token = _get_bearer_token(request)
    if not token:
        return None

    token_hash = hash_session_token(token)
    return (
        AuthSession.objects.select_related('user', 'member')
        .filter(token_hash=token_hash, revoked_at__isnull=True, expires_at__gt=timezone.now())
        .first()
    )


def _json_body(request: HttpRequest) -> dict:
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode('utf-8'))
    except json.JSONDecodeError:
        return {}


class HealthView(APIView):
    """Health check endpoint"""
    
    @swagger_auto_schema(
        tags=['5. System'],
        operation_description="Health check endpoint",
        responses={200: openapi.Response('Success', openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={'status': openapi.Schema(type=openapi.TYPE_STRING)}
        ))}
    )
    def get(self, request):
        return Response({'status': 'ok'})


class ApiLoginView(APIView):
    """User authentication endpoint"""
    
    @swagger_auto_schema(
        tags=['1. Authentication'],
        operation_description="Authenticate user with username/email/phone and password",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=['username', 'password'],
            properties={
                'username': openapi.Schema(type=openapi.TYPE_STRING, description='Username, email, or phone number'),
                'password': openapi.Schema(type=openapi.TYPE_STRING, description='User password'),
            }
        ),
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'token': openapi.Schema(type=openapi.TYPE_STRING),
                    'expires_at': openapi.Schema(type=openapi.TYPE_STRING),
                    'user': openapi.Schema(type=openapi.TYPE_OBJECT)
                }
            )),
            400: 'Bad Request',
            401: 'Unauthorized'
        }
    )
    def post(self, request):
        payload = _json_body(request)
        username_raw = (payload.get('username') or '').strip()
        password = (payload.get('password') or '').strip()

        if not username_raw or not password:
            return JsonResponse({'error': 'Please enter username and password.'}, status=400)

        members_qs = AppUserMember.objects.select_related('user').filter(user__is_active=True)
        if '@' in username_raw:
            members_qs = members_qs.filter(email__iexact=username_raw)
        else:
            phone = _normalize_phone(username_raw)
            if not phone:
                return JsonResponse({'error': 'Please enter username and password.'}, status=400)
            members_qs = members_qs.filter(phone=phone)

        members = list(members_qs)
        if not members:
            return JsonResponse({'error': 'Invalid username or password.'}, status=401)

        matched_user: AppUser | None = None
        matched_member: AppUserMember | None = None
        for member in members:
            user = member.user
            if verify_password(
                password,
                salt_b64=user.password_salt_b64,
                password_hash_b64=user.password_hash_b64,
                iterations=user.password_iterations,
            ):
                matched_user = user
                matched_member = member
                break

        if matched_user is None:
            return JsonResponse({'error': 'Invalid username or password.'}, status=401)

        user = matched_user

        raw_token = create_session_token()
        times = get_session_times()
        AuthSession.objects.create(
            user=user,
            member=matched_member,
            token_hash=hash_session_token(raw_token),
            created_at=times.created_at,
            expires_at=times.expires_at,
        )

        return JsonResponse(
            {
                'token': raw_token,
                'expires_at': times.expires_at.isoformat(),
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'team_no': user.team_no,
                },
                'member': {
                    'id': matched_member.id,
                    'member_id': matched_member.member_id,
                    'name': matched_member.name,
                    'email': matched_member.email,
                    'phone': matched_member.phone,
                    'coins': matched_member.coins,
                } if matched_member else None,
            }
        )


class ApiRegisterView(APIView):
    """User registration endpoint"""
    
    @swagger_auto_schema(
        tags=['1. Authentication'],
        operation_description="Register a new user account",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=['display_name', 'email', 'phone_number', 'password'],
            properties={
                'display_name': openapi.Schema(type=openapi.TYPE_STRING, description='User display name'),
                'email': openapi.Schema(type=openapi.TYPE_STRING, description='User email address'),
                'phone_number': openapi.Schema(type=openapi.TYPE_STRING, description='User phone number'),
                'password': openapi.Schema(type=openapi.TYPE_STRING, description='User password'),
            }
        ),
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'message': openapi.Schema(type=openapi.TYPE_STRING),
                    'user_id': openapi.Schema(type=openapi.TYPE_INTEGER)
                }
            )),
            400: 'Bad Request',
            409: 'Conflict - User already exists'
        }
    )
    def post(self, request):
        payload = _json_body(request)
        display_name = (payload.get('display_name') or '').strip()
        email = (payload.get('email') or '').strip().lower()
        phone_number = (payload.get('phone_number') or '').strip()
        password = (payload.get('password') or '').strip()

        # Validation
        if not display_name:
            return JsonResponse({'error': 'Display name is required.'}, status=400)
        if not email:
            return JsonResponse({'error': 'Email is required.'}, status=400)
        if not phone_number:
            return JsonResponse({'error': 'Phone number is required.'}, status=400)
        if not password:
            return JsonResponse({'error': 'Password is required.'}, status=400)
        
        # Validate email format
        if '@' not in email or '.' not in email.split('@')[-1]:
            return JsonResponse({'error': 'Invalid email format.'}, status=400)
        
        # Normalize phone number
        phone = _normalize_phone(phone_number)
        if not phone:
            return JsonResponse({'error': 'Invalid phone number.'}, status=400)
        
        # Password strength check
        if len(password) < 6:
            return JsonResponse({'error': 'Password must be at least 6 characters long.'}, status=400)

        try:
            with transaction.atomic():
                # Check if user already exists
                if AppUser.objects.filter(email=email).exists():
                    return JsonResponse({'error': 'Email already registered.'}, status=409)
                
                if AppUserMember.objects.filter(phone=phone).exists():
                    return JsonResponse({'error': 'Phone number already registered.'}, status=409)
                
                # Generate username from email
                username = email.split('@')[0]
                # Ensure username is unique
                base_username = username
                counter = 1
                while AppUser.objects.filter(username=username).exists():
                    username = f"{base_username}{counter}"
                    counter += 1
                
                # Hash password
                salt_b64, password_hash_b64, iterations = hash_password(password)
                
                # Create user
                user = AppUser.objects.create(
                    username=username,
                    email=email,
                    phone=phone,
                    password_salt_b64=salt_b64,
                    password_hash_b64=password_hash_b64,
                    password_iterations=iterations,
                    is_active=True,
                )
                
                # Create member
                member = AppUserMember.objects.create(
                    user=user,
                    name=display_name,
                    email=email,
                    phone=phone,
                    coins=100  # Default starting coins
                )
                
                return JsonResponse({
                    'message': 'Account created successfully. Please login.',
                    'user_id': user.id
                }, status=200)
                
        except Exception as e:
            return JsonResponse({'error': 'Unable to create account. Please try again.'}, status=500)


class ApiMeView(APIView):
    """Get current user information"""
    
    @swagger_auto_schema(
        tags=['1. Authentication'],
        operation_description="Get current authenticated user details",
        manual_parameters=[
            openapi.Parameter('Authorization', openapi.IN_HEADER, description="Bearer token", type=openapi.TYPE_STRING, required=True)
        ],
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'user': openapi.Schema(type=openapi.TYPE_OBJECT),
                    'member': openapi.Schema(type=openapi.TYPE_OBJECT)
                }
            )),
            401: 'Unauthorized'
        }
    )
    def get(self, request):
        session = _get_session(request)
        print(f"[DEBUG /api/me] Session: {session}")
        
        if session is None or not session.user.is_active:
            print(f"[DEBUG /api/me] Session is None or user inactive")
            return JsonResponse({'error': 'Unauthorized'}, status=401)

        print(f"[DEBUG /api/me] User: {session.user.username}, Team: {session.user.team_no}")
        
        if session.member is None:
            print(f"[DEBUG /api/me] Member is None")
            return JsonResponse({'error': 'Unauthorized'}, status=401)

        print(f"[DEBUG /api/me] Member: {session.member.name}, Email: {session.member.email}")
        
        response_data = {
            'user': {
                'id': session.user.id,
                'username': session.user.username,
                'team_no': session.user.team_no,
            },
            'member': {
                'id': session.member.id,
                'member_id': session.member.member_id,
                'name': session.member.name,
                'email': session.member.email,
                'phone': session.member.phone,
                'coins': session.member.coins,
            },
        }
        print(f"[DEBUG /api/me] Sending response: {response_data}")
        
        return JsonResponse(response_data)


class ApiLogoutView(APIView):
    """Logout current user"""
    
    @swagger_auto_schema(
        tags=['1. Authentication'],
        operation_description="Logout and revoke current session",
        manual_parameters=[
            openapi.Parameter('Authorization', openapi.IN_HEADER, description="Bearer token", type=openapi.TYPE_STRING)
        ],
        responses={200: openapi.Response('Success', openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={'ok': openapi.Schema(type=openapi.TYPE_BOOLEAN)}
        ))}
    )
    def post(self, request):
        session = _get_session(request)
        if session is None:
            return JsonResponse({'ok': True})

        session.revoked_at = timezone.now()
        session.save(update_fields=['revoked_at'])
        return JsonResponse({'ok': True})


class ApiOtpRequestView(View):
    OTP_TTL = timedelta(minutes=5)

    def post(self, request: HttpRequest) -> JsonResponse:
        payload = _json_body(request)
        channel = (payload.get('channel') or '').strip().lower()
        phone = _normalize_phone(payload.get('phone') or payload.get('username') or '')
        email = (payload.get('email') or payload.get('username') or '').strip()
        team_no_raw = payload.get('team_no')

        if channel not in {'whatsapp', 'email'}:
            return JsonResponse({'error': 'Invalid OTP channel.'}, status=400)

        if channel == 'whatsapp' and not phone:
            return JsonResponse({'error': 'Please enter mobile number.'}, status=400)
        if channel == 'email' and not email:
            return JsonResponse({'error': 'Please enter email id.'}, status=400)

        if channel == 'whatsapp':
            members_qs = (
                AppUserMember.objects.select_related('user')
                .filter(phone=phone)
                .filter(user__is_active=True)
            )
        else:
            members_qs = (
                AppUserMember.objects.select_related('user')
                .filter(email__iexact=email)
                .filter(user__is_active=True)
            )

        if team_no_raw is not None and str(team_no_raw).strip() != '':
            try:
                team_no = int(team_no_raw)
            except (TypeError, ValueError):
                return JsonResponse({'error': 'Invalid team number.'}, status=400)
            members_qs = members_qs.filter(user__team_no=team_no)

        members = list(members_qs)
        if not members:
            if channel == 'whatsapp':
                return JsonResponse({'error': 'Mobile number not registered.'}, status=404)
            return JsonResponse({'error': 'Email id not registered.'}, status=404)

        if len(members) > 1:
            identifier_label = 'mobile number' if channel == 'whatsapp' else 'email id'
            teams = []
            for m in members:
                teams.append({'team_no': m.user.team_no, 'username': m.user.username})
            teams = sorted(teams, key=lambda t: (t['team_no'] is None, t['team_no'] or 0))
            return JsonResponse(
                {
                    'error': f'Multiple team accounts found for this {identifier_label}. Please select team number.',
                    'teams': teams,
                },
                status=409,
            )

        member = members[0]

        identifier = phone if channel == 'whatsapp' else (member.email or email)

        try:
            dispatch_otp(channel=channel, identifier=identifier, display_name=member.name)
        except OtpDispatchError as exc:
            return JsonResponse({'error': str(exc)}, status=502)

        now = timezone.now()
        expires_at = now + self.OTP_TTL

        with transaction.atomic():
            OtpChallenge.objects.filter(
                member=member,
                identifier=identifier,
                consumed_at__isnull=True,
                expires_at__gt=now,
            ).update(consumed_at=now)

            challenge = OtpChallenge.objects.create(
                identifier=identifier,
                member=member,
                created_at=now,
                expires_at=expires_at,
            )

        return JsonResponse({'challenge_id': challenge.id, 'expires_at': expires_at.isoformat()})


class ApiOtpVerifyView(View):
    def post(self, request: HttpRequest) -> JsonResponse:
        payload = _json_body(request)
        challenge_id = payload.get('challenge_id')
        otp = (payload.get('otp') or '').strip()

        if not challenge_id or not otp:
            return JsonResponse({'error': 'Please enter OTP.'}, status=400)

        try:
            challenge_id_int = int(challenge_id)
        except (TypeError, ValueError):
            return JsonResponse({'error': 'Invalid OTP request.'}, status=400)

        challenge = (
            OtpChallenge.objects.select_related('member', 'member__user')
            .filter(id=challenge_id_int)
            .first()
        )
        if challenge is None or not challenge.is_valid() or challenge.member is None:
            return JsonResponse({'error': 'Invalid or expired OTP.'}, status=401)

        try:
            ok = verify_otp_via_gateway(identifier=challenge.identifier, otp=otp)
        except OtpVerifyError as exc:
            return JsonResponse({'error': str(exc)}, status=502)

        if not ok:
            return JsonResponse({'error': 'Invalid or expired OTP.'}, status=401)

        now = timezone.now()

        with transaction.atomic():
            updated = OtpChallenge.objects.filter(id=challenge.id, consumed_at__isnull=True).update(consumed_at=now)
            if updated != 1:
                return JsonResponse({'error': 'Invalid or expired OTP.'}, status=401)

            member = challenge.member
            user = member.user

            raw_token = create_session_token()
            times = get_session_times()
            AuthSession.objects.create(
                user=user,
                member=member,
                token_hash=hash_session_token(raw_token),
                created_at=times.created_at,
                expires_at=times.expires_at,
            )

        return JsonResponse(
            {
                'token': raw_token,
                'expires_at': times.expires_at.isoformat(),
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'team_no': user.team_no,
                },
                'member': {
                    'id': member.id,
                    'member_id': member.member_id,
                    'name': member.name,
                    'email': member.email,
                    'phone': member.phone,
                    'coins': member.coins,
                },
            }
        )


class ApiGameStartView(APIView):
    """Start a new game - Just fetch a random word from lsm_vocab1"""
    
    @swagger_auto_schema(
        tags=['2. Game'],
        operation_description="Start a new Bulls & Bears game round",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                'timer_seconds': openapi.Schema(type=openapi.TYPE_INTEGER, description='Timer duration in seconds (default: 180)')
            }
        ),
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'secret_word': openapi.Schema(type=openapi.TYPE_STRING),
                    'max_attempts': openapi.Schema(type=openapi.TYPE_INTEGER),
                    'timer_seconds': openapi.Schema(type=openapi.TYPE_INTEGER),
                    'started_at': openapi.Schema(type=openapi.TYPE_STRING)
                }
            )),
            500: 'Internal Server Error'
        }
    )
    def post(self, request):
        # No authentication required - just return a word
        
        payload = _json_body(request)
        timer_seconds = payload.get('timer_seconds', 180)  # Default 3 minutes
        
        # Fetch all vocab words from lsm_vocab1 table
        vocab_words = list(VocabWord.objects.all())
        if not vocab_words:
            return JsonResponse({'error': 'No words available. Please contact admin.'}, status=500)
        
        # Collect all 5-letter words from database columns (word, s1-s5, a1-a5)
        all_five_letter_words = []
        for vocab_word in vocab_words:
            all_five_letter_words.extend(vocab_word.get_all_5_letter_words())
        
        # Remove duplicates
        all_five_letter_words = list(set(all_five_letter_words))
        
        if not all_five_letter_words:
            return JsonResponse({'error': 'No 5-letter words available. Please contact admin.'}, status=500)
        
        # Pick a random word
        secret_word = random.choice(all_five_letter_words)
        print(secret_word)
        
        # Return the secret word and game config (frontend will handle all game state)
        return JsonResponse({
            'secret_word': secret_word.lower(),  # Frontend will handle this
            'max_attempts': 6,
            'timer_seconds': timer_seconds,
            'started_at': timezone.now().isoformat()
        })


class ApiGameGuessView(APIView):
    """Validate a guess and return feedback - NO DATABASE WRITE"""
    
    # Initialize English dictionary (US English)
    try:
        dictionary = enchant.Dict("en_US")
    except enchant.errors.DictNotFoundError:
        # Fallback to British English if US English not available
        try:
            dictionary = enchant.Dict("en_GB")
        except:
            dictionary = None
    
    @swagger_auto_schema(
        tags=['2. Game'],
        operation_description="Submit a word guess and get feedback",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=['secret_word', 'guess'],
            properties={
                'secret_word': openapi.Schema(type=openapi.TYPE_STRING, description='The secret word for this game'),
                'guess': openapi.Schema(type=openapi.TYPE_STRING, description='The 5-letter word guess')
            }
        ),
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'guess': openapi.Schema(type=openapi.TYPE_STRING),
                    'feedback': openapi.Schema(type=openapi.TYPE_ARRAY, items=openapi.Schema(type=openapi.TYPE_STRING)),
                    'is_correct': openapi.Schema(type=openapi.TYPE_BOOLEAN)
                }
            )),
            400: 'Bad Request'
        }
    )
    def post(self, request):
        payload = _json_body(request)
        secret_word = (payload.get('secret_word') or '').strip().upper()
        guess = (payload.get('guess') or '').strip().upper()
        
        if not secret_word or not guess:
            return JsonResponse({'error': 'Secret word and guess are required.'}, status=400)
        
        if len(guess) != 5:
            return JsonResponse({'error': 'Guess must be exactly 5 letters.'}, status=400)
        
        if not guess.isalpha():
            return JsonResponse({'error': 'Guess must contain only letters.'}, status=400)
        
        # Two-tier validation system:
        # 1. First, check if word exists in database columns (word, s1-s5, a1-a5)
        all_vocab_words = VocabWord.objects.all()
        valid_words_set = set()
        
        for vocab_word in all_vocab_words:
            # Add all 5-letter words from database columns
            valid_words_set.update(vocab_word.get_all_5_letter_words())
        
        # Check if guess is in our database words
        in_database = guess.upper() in valid_words_set
        
        if not in_database:
            # 2. If not in database, check with pyenchant dictionary as fallback
            if not (self.dictionary and self.dictionary.check(guess)):
                # Not in database AND not in dictionary
                return JsonResponse({'error': 'Invalid word.'}, status=400)
            # else: word is valid in dictionary, allow it
        
        # Word is valid (either in database or in dictionary), proceed with game
        # Generate feedback
        feedback = self._generate_feedback(guess, secret_word)
        
        # Check if correct
        is_correct = all(f == 'correct' for f in feedback)
        
        return JsonResponse({
            'guess': guess,
            'feedback': feedback,
            'is_correct': is_correct
        })
    
    def _generate_feedback(self, guess: str, secret: str) -> list:
        """Generate feedback for a guess
        Returns list of 'correct', 'present', or 'absent' for each letter
        """
        feedback = ['absent'] * 5
        secret_letters = list(secret)
        
        # First pass: mark correct positions
        for i in range(5):
            if guess[i] == secret[i]:
                feedback[i] = 'correct'
                secret_letters[i] = None  # Mark as used
        
        # Second pass: mark present letters
        for i in range(5):
            if feedback[i] == 'correct':
                continue
            
            if guess[i] in secret_letters:
                feedback[i] = 'present'
                # Remove first occurrence
                idx = secret_letters.index(guess[i])
                secret_letters[idx] = None
        
        return feedback


class ApiGameCompleteView(APIView):
    """Save completed game result to gameresults table for leaderboard"""
    
    @swagger_auto_schema(
        tags=['2. Game'],
        operation_description="Save completed game result to leaderboard",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=['secret_word', 'status', 'score'],
            properties={
                'secret_word': openapi.Schema(type=openapi.TYPE_STRING),
                'status': openapi.Schema(type=openapi.TYPE_STRING, enum=['won', 'lost']),
                'attempts_used': openapi.Schema(type=openapi.TYPE_INTEGER),
                'time_taken': openapi.Schema(type=openapi.TYPE_NUMBER),
                'score': openapi.Schema(type=openapi.TYPE_NUMBER),
                'player_name': openapi.Schema(type=openapi.TYPE_STRING)
            }
        ),
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'ok': openapi.Schema(type=openapi.TYPE_BOOLEAN),
                    'message': openapi.Schema(type=openapi.TYPE_STRING),
                    'result_id': openapi.Schema(type=openapi.TYPE_INTEGER)
                }
            )),
            400: 'Bad Request',
            500: 'Internal Server Error'
        }
    )
    def post(self, request):
        session = _get_session(request)
        
        payload = _json_body(request)
        
        # Extract game data from frontend
        secret_word = (payload.get('secret_word') or '').strip().lower()
        status = (payload.get('status') or '').strip()  # 'won' or 'lost'
        attempts_used = payload.get('attempts_used', 0)
        time_taken = payload.get('time_taken', 0)  # seconds (duration)
        score = payload.get('score', 0.0)
        player_name = (payload.get('player_name') or '').strip() or 'Anonymous'
        
        # Validation
        if not secret_word or status not in ['won', 'lost']:
            return JsonResponse({'error': 'Invalid game data.'}, status=400)
        
        # Credit coins for winning
        coins_awarded = 0
        if status == 'won' and session and session.member:
            COINS_PER_WIN = 10
            with transaction.atomic():
                member = AppUserMember.objects.select_for_update().get(id=session.member.id)
                member.coins += COINS_PER_WIN
                member.save(update_fields=['coins'])
                coins_awarded = COINS_PER_WIN
        
        # Save to gameresults table for leaderboard
        try:
            now = timezone.now()
            game_result = GameResult.objects.create(
                game_id='1',  # game_id is VARCHAR - '1' for Bulls and Bears
                game_name='Bulls and Bears',
                player_id=player_name,  # Use player name as player_id
                start_time=now,
                end_time=now,
                duration=int(time_taken),  # Time taken in seconds (integer)
                absolute_score=int(score),  # Use absolute_score field (integer)
                percentage_score='100' if status == 'won' else '0',  # VARCHAR field
                game_session_data=json.dumps({
                    'player_name': player_name,
                    'secret_word': secret_word,
                    'status': status,
                    'attempts_used': attempts_used,
                    'time_taken': time_taken,
                    'score': score,
                    'completed_at': now.isoformat()
                }),
                words_played=1,  # Integer count: 1 word played
                created_at=now
            )
            
            # Close database connection to prevent connection leaks
            connections['default'].close()
            
            response_data = {
                'ok': True,
                'message': 'Game result saved successfully!',
                'result_id': game_result.result_id
            }
            
            # Include coins info if awarded
            if coins_awarded > 0:
                response_data['coins_awarded'] = coins_awarded
                response_data['message'] = f'Game result saved! You earned {coins_awarded} coins!'
            
            return JsonResponse(response_data)
        except Exception as e:
            # Close connection even on error
            connections['default'].close()
            return JsonResponse({'error': f'Failed to save result: {str(e)}'}, status=500)


class ApiGameStateView(View):
    """Get game state - NOT USED (game state is in frontend only)"""
    def get(self, request: HttpRequest) -> JsonResponse:
        return JsonResponse({'error': 'Game state is managed in frontend only.'}, status=400)


class ApiGameAbandonView(View):
    """Abandon game - NOT USED (game state is in frontend only)"""
    def post(self, request: HttpRequest) -> JsonResponse:
        return JsonResponse({'ok': True, 'message': 'Game abandoned (no server action needed).'})


class ApiLeaderboardView(APIView):
    """Get leaderboard - shows top game results ranked by score in descending order - NO AUTH REQUIRED"""
    
    @swagger_auto_schema(
        tags=['3. Leaderboard'],
        operation_description="Get top scores leaderboard (public access)",
        manual_parameters=[
            openapi.Parameter('limit', openapi.IN_QUERY, description="Number of results to return (1-1000, default: 100)", type=openapi.TYPE_INTEGER)
        ],
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'leaderboard': openapi.Schema(
                        type=openapi.TYPE_ARRAY,
                        items=openapi.Schema(
                            type=openapi.TYPE_OBJECT,
                            properties={
                                'rank': openapi.Schema(type=openapi.TYPE_INTEGER),
                                'player_name': openapi.Schema(type=openapi.TYPE_STRING),
                                'score': openapi.Schema(type=openapi.TYPE_NUMBER),
                                'secret_word': openapi.Schema(type=openapi.TYPE_STRING),
                                'attempts_used': openapi.Schema(type=openapi.TYPE_INTEGER),
                                'time_taken': openapi.Schema(type=openapi.TYPE_NUMBER),
                                'created_at': openapi.Schema(type=openapi.TYPE_STRING)
                            }
                        )
                    )
                }
            ))
        }
    )
    def get(self, request):
        # No authentication required for viewing leaderboard
        
        try:
            limit = int(request.GET.get('limit', 100))
            limit = min(max(limit, 1), 1000)  # Between 1 and 1000
            
            # Get top game results sorted by score (descending), then by duration (ascending)
            # Filter for Bulls and Bears game only
            leaderboard_results = (
                GameResult.objects
                .filter(game_name='Bulls and Bears')
                .order_by('-absolute_score', 'duration', '-created_at')[:limit]
            )
            
            data = []
            for rank, result in enumerate(leaderboard_results, start=1):
                # Extract player name and game info from game_session_data JSON
                player_name = result.player_id or 'Anonymous'
                secret_word = 'XXXXX'
                attempts_used = 0
                status = 'unknown'
                
                if result.game_session_data:
                    try:
                        game_data = json.loads(result.game_session_data)
                        player_name = game_data.get('player_name', player_name)
                        secret_word = game_data.get('secret_word', secret_word).upper()
                        attempts_used = game_data.get('attempts_used', attempts_used)
                        status = game_data.get('status', status)
                    except:
                        pass
                
                # Only show won games on leaderboard
                if status != 'won':
                    continue
                
                data.append({
                    'rank': rank,
                    'player_name': player_name,
                    'score': round(result.absolute_score, 2),
                    'secret_word': secret_word,
                    'attempts_used': attempts_used,
                    'time_taken': round(result.duration, 2) if result.duration else 0.0,
                    'created_at': result.created_at.isoformat()
                })
            
            return JsonResponse({'leaderboard': data})
        finally:
            # Always close the database connection
            connections['default'].close()


class ApiPlayerStatsView(View):
    """Get player statistics"""
    def get(self, request: HttpRequest) -> JsonResponse:
        session = _get_session(request)
        if session is None or not session.user.is_active:
            return JsonResponse({'error': 'Unauthorized'}, status=401)

        # Get stats from gameresults
        from django.db.models import Sum, Count, Avg, Max
        
        player_stats = GameResult.objects.filter(
            user=session.user,
            member=session.member
        ).aggregate(
            total_games=Count('id'),
            total_wins=Count('id', filter=Q(status='won')),
            total_losses=Count('id', filter=Q(status='lost')),
            total_score=Sum('score'),
            avg_attempts=Avg('attempts_used'),
            best_time=Max('time_taken', filter=Q(status='won'))
        )
        
        # Get recent games
        recent_results = GameResult.objects.filter(
            user=session.user,
            member=session.member
        ).order_by('-created_at')[:10]
        
        recent_games_data = [
            {
                'round_id': result.game_round_id,
                'status': result.status,
                'attempts_used': result.attempts_used,
                'total_score': result.score,
                'secret_word': result.secret_word,
                'time_taken': result.time_taken,
                'created_at': result.created_at.isoformat()
            }
            for result in recent_results
        ]
        
        stats = {
            'total_rounds': player_stats['total_games'] or 0,
            'rounds_won': player_stats['total_wins'] or 0,
            'rounds_lost': player_stats['total_losses'] or 0,
            'total_score': round(player_stats['total_score'], 2) if player_stats['total_score'] else 0.0,
            'average_attempts': round(player_stats['avg_attempts'], 2) if player_stats['avg_attempts'] else 0.0,
            'best_time': round(player_stats['best_time'], 2) if player_stats['best_time'] else None,
            'recent_games': recent_games_data
        }
        
        return JsonResponse(stats)


class ApiGameHistoryView(View):
    """Get game history with timeline"""
    def get(self, request: HttpRequest) -> JsonResponse:
        session = _get_session(request)
        if session is None or not session.user.is_active:
            return JsonResponse({'error': 'Unauthorized'}, status=401)

        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 20))
        page_size = min(max(page_size, 1), 100)
        
        offset = (page - 1) * page_size
        
        games = GameResult.objects.filter(
            user=session.user,
            member=session.member
        ).order_by('-created_at')[offset:offset + page_size]
        
        total_count = GameResult.objects.filter(
            user=session.user,
            member=session.member
        ).count()
        
        games_data = []
        for game in games:
            game_state = json.loads(game.game_state) if game.game_state else {}
            
            games_data.append({
                'round_id': game.id,
                'status': game.status,
                'secret_word': game.secret_word.upper() if game.status in ['won', 'lost', 'abandoned'] else None,
                'attempts_used': game.attempts_used,
                'max_attempts': game_state.get('max_attempts', 6),
                'total_score': game.score,
                'started_at': game_state.get('started_at', game.created_at.isoformat()),
                'completed_at': game_state.get('completed_at')
            })
        
        return JsonResponse({
            'games': games_data,
            'total_count': total_count,
            'page': page,
            'page_size': page_size,
            'has_more': total_count > (offset + page_size)
        })


class ApiPerformanceAnalyticsView(APIView):
    """Get comprehensive player performance analytics - NO AUTH REQUIRED (uses player_name from query param)"""
    
    @swagger_auto_schema(
        tags=['4. Analytics'],
        operation_description="Get player performance analytics and statistics (public access)",
        manual_parameters=[
            openapi.Parameter('player_name', openapi.IN_QUERY, description="Player name", type=openapi.TYPE_STRING, required=True)
        ],
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'player_name': openapi.Schema(type=openapi.TYPE_STRING),
                    'summary': openapi.Schema(type=openapi.TYPE_OBJECT),
                    'charts': openapi.Schema(type=openapi.TYPE_OBJECT),
                    'achievements': openapi.Schema(type=openapi.TYPE_ARRAY, items=openapi.Schema(type=openapi.TYPE_OBJECT)),
                    'insights': openapi.Schema(type=openapi.TYPE_ARRAY, items=openapi.Schema(type=openapi.TYPE_STRING))
                }
            )),
            400: 'Bad Request'
        }
    )
    def get(self, request):
        # Get player_name from query parameter (no authentication required)
        player_name = request.GET.get('player_name', '').strip()
        
        if not player_name:
            return JsonResponse({'error': 'player_name query parameter required'}, status=400)
        
        try:
            # Get all games for this player
            all_games = (
                GameResult.objects
                .filter(game_name='Bulls and Bears', player_id=player_name)
                .order_by('-created_at')
            )
            
            total_games = all_games.count()
            
            if total_games == 0:
                # Return empty analytics for new players
                return JsonResponse({
                    'total_games': 0,
                    'total_wins': 0,
                    'total_losses': 0,
                    'win_rate': 0.0,
                    'avg_score': 0.0,
                    'avg_attempts': 0.0,
                    'avg_duration': 0.0,
                    'best_score': 0,
                    'fastest_win': 0,
                    'attempts_distribution': {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0},
                    'recent_games': []
                })
            
            # Calculate statistics
            total_wins = 0
            total_losses = 0
            total_score = 0
            total_attempts = 0
            total_duration = 0
            best_score = 0
            fastest_win = None
            attempts_distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}
            
            recent_games_data = []
            
            for result in all_games[:10]:  # Get recent 10 games for chart
                # Parse game_session_data JSON
                game_data = {}
                if result.game_session_data:
                    try:
                        game_data = json.loads(result.game_session_data)
                    except:
                        pass
                
                status = game_data.get('status', 'unknown')
                attempts_used = game_data.get('attempts_used', 0)
                time_taken = result.duration or 0
                score = result.absolute_score or 0
                
                # Add to recent games
                recent_games_data.append({
                    'result_id': result.result_id,
                    'status': status,
                    'absolute_score': score,
                    'attempts_used': attempts_used,
                    'duration': time_taken,
                    'secret_word': game_data.get('secret_word', '').upper(),
                    'created_at': result.created_at.isoformat()
                })
            
            # Calculate aggregate stats from ALL games
            for result in all_games:
                game_data = {}
                if result.game_session_data:
                    try:
                        game_data = json.loads(result.game_session_data)
                    except:
                        pass
                
                status = game_data.get('status', 'unknown')
                attempts_used = game_data.get('attempts_used', 0)
                time_taken = result.duration or 0
                score = result.absolute_score or 0
                
                # Count wins/losses
                if status == 'won':
                    total_wins += 1
                    
                    # Track fastest win
                    if fastest_win is None or time_taken < fastest_win:
                        fastest_win = time_taken
                    
                    # Track attempts distribution (only for wins)
                    if 1 <= attempts_used <= 6:
                        attempts_distribution[attempts_used] += 1
                else:
                    total_losses += 1
                
                # Accumulate totals
                total_score += score
                total_attempts += attempts_used
                total_duration += time_taken
                
                # Track best score
                if score > best_score:
                    best_score = score
            
            # Calculate averages
            win_rate = (total_wins / total_games * 100) if total_games > 0 else 0.0
            avg_score = (total_score / total_games) if total_games > 0 else 0.0
            avg_attempts = (total_attempts / total_games) if total_games > 0 else 0.0
            avg_duration = (total_duration / total_games) if total_games > 0 else 0.0
            
            return JsonResponse({
                'total_games': total_games,
                'total_wins': total_wins,
                'total_losses': total_losses,
                'win_rate': round(win_rate, 1),
                'avg_score': round(avg_score, 2),
                'avg_attempts': round(avg_attempts, 2),
                'avg_duration': round(avg_duration, 2),
                'best_score': best_score,
                'fastest_win': fastest_win or 0,
                'attempts_distribution': attempts_distribution,
                'recent_games': recent_games_data
            })
        except Exception as e:
            return JsonResponse({'error': f'Failed to fetch analytics: {str(e)}'}, status=500)
        finally:
            # Always close the database connection
            connections['default'].close()


class ApiCoinsView(APIView):
    """Get current user's coin balance"""
    
    @swagger_auto_schema(
        tags=['4. Game'],
        operation_description="Get current user's coin balance",
        manual_parameters=[
            openapi.Parameter('Authorization', openapi.IN_HEADER, description="Bearer token", type=openapi.TYPE_STRING, required=True)
        ],
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'coins': openapi.Schema(type=openapi.TYPE_INTEGER, description='Current coin balance')
                }
            )),
            401: 'Unauthorized'
        }
    )
    def get(self, request):
        session = _get_session(request)
        if session is None or not session.user.is_active or session.member is None:
            return JsonResponse({'error': 'Unauthorized'}, status=401)
        
        # Refresh member data to get latest coins
        session.member.refresh_from_db()
        
        return JsonResponse({
            'coins': session.member.coins
        })


class ApiHintView(APIView):
    """Get a hint for the current game by revealing a correct letter"""
    
    @swagger_auto_schema(
        tags=['4. Game'],
        operation_description="Get a hint for the current game (costs 10 coins). Reveals one correct letter position.",
        manual_parameters=[
            openapi.Parameter('Authorization', openapi.IN_HEADER, description="Bearer token", type=openapi.TYPE_STRING, required=True)
        ],
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=['secret_word'],
            properties={
                'secret_word': openapi.Schema(type=openapi.TYPE_STRING, description='Current secret word'),
                'revealed_positions': openapi.Schema(
                    type=openapi.TYPE_ARRAY,
                    items=openapi.Schema(type=openapi.TYPE_INTEGER),
                    description='Positions already marked as correct (0-4) to exclude from hints'
                ),
            }
        ),
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'hint': openapi.Schema(type=openapi.TYPE_OBJECT, properties={
                        'position': openapi.Schema(type=openapi.TYPE_INTEGER, description='Letter position (0-4)'),
                        'letter': openapi.Schema(type=openapi.TYPE_STRING, description='The correct letter')
                    }),
                    'remaining_coins': openapi.Schema(type=openapi.TYPE_INTEGER, description='Remaining coin balance')
                }
            )),
            400: 'Bad Request - Insufficient coins or invalid game',
            401: 'Unauthorized'
        }
    )
    def post(self, request):
        session = _get_session(request)
        if session is None or not session.user.is_active or session.member is None:
            return JsonResponse({'error': 'Unauthorized'}, status=401)
        
        payload = _json_body(request)
        secret_word = payload.get('secret_word', '').strip().upper()
        revealed_positions = payload.get('revealed_positions', [])  # Positions already marked as correct
        
        if not secret_word or len(secret_word) != 5:
            return JsonResponse({'error': 'Secret word is required'}, status=400)
        
        # Check if user has enough coins
        session.member.refresh_from_db()
        HINT_COST = 10
        
        if session.member.coins < HINT_COST:
            return JsonResponse({
                'error': 'Not enough coins',
                'required': HINT_COST,
                'available': session.member.coins
            }, status=400)
        
        # Find positions that are NOT already revealed (not marked as correct)
        available_positions = [i for i in range(5) if i not in revealed_positions]
        
        if not available_positions:
            return JsonResponse({'error': 'All positions already revealed or correct'}, status=400)
        
        # Select a random position from available positions
        hint_position = random.choice(available_positions)
        hint_letter = secret_word[hint_position]
        
        # Deduct coins using atomic transaction
        with transaction.atomic():
            member = AppUserMember.objects.select_for_update().get(id=session.member.id)
            
            # Double-check coins in case of race condition
            if member.coins < HINT_COST:
                return JsonResponse({
                    'error': 'Not enough coins',
                    'required': HINT_COST,
                    'available': member.coins
                }, status=400)
            
            member.coins -= HINT_COST
            member.save(update_fields=['coins'])
            
            return JsonResponse({
                'hint': {
                    'position': hint_position,
                    'letter': hint_letter
                },
                'remaining_coins': member.coins
            })


class ApiWordMeaningView(APIView):
    """Get word meaning and definition using Free Dictionary API"""
    
    @swagger_auto_schema(
        tags=['2. Game'],
        operation_description="Get meaning and definition of a word (no authentication required)",
        manual_parameters=[
            openapi.Parameter('word', openapi.IN_QUERY, description="Word to get meaning for", type=openapi.TYPE_STRING, required=True)
        ],
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'word': openapi.Schema(type=openapi.TYPE_STRING),
                    'meaning': openapi.Schema(type=openapi.TYPE_STRING),
                    'definitions': openapi.Schema(type=openapi.TYPE_ARRAY, items=openapi.Schema(type=openapi.TYPE_STRING)),
                    'parts_of_speech': openapi.Schema(type=openapi.TYPE_ARRAY, items=openapi.Schema(type=openapi.TYPE_STRING))
                }
            )),
            400: 'Bad Request',
            404: 'Word not found'
        }
    )
    def get(self, request):
        # No authentication required - public endpoint
        
        word = request.GET.get('word', '').strip().lower()
        
        if not word:
            return JsonResponse({'error': 'Word parameter is required'}, status=400)
        
        try:
            # Use Free Dictionary API
            api_url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
            
            response = requests.get(api_url, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                
                if data and len(data) > 0:
                    entry = data[0]
                    
                    # Extract all definitions and parts of speech
                    all_definitions = []
                    parts_of_speech = []
                    meaning_parts = []
                    
                    if 'meanings' in entry:
                        for meaning in entry['meanings']:
                            pos = meaning.get('partOfSpeech', 'Unknown')
                            if pos not in parts_of_speech:
                                parts_of_speech.append(pos)
                            
                            definitions = meaning.get('definitions', [])
                            if definitions and len(definitions) > 0:
                                # Add first definition for primary meaning
                                first_def = definitions[0].get('definition', '')
                                if first_def and len(meaning_parts) < 2:
                                    meaning_parts.append(f"{pos.capitalize()}: {first_def}")
                                
                                # Add all definitions to list
                                for idx, defn in enumerate(definitions[:3]):  # Limit to 3 per part of speech
                                    definition_text = defn.get('definition', '')
                                    if definition_text:
                                        all_definitions.append(f"({pos.capitalize()}) {definition_text}")
                    
                    primary_meaning = meaning_parts[0] if meaning_parts else f"A {parts_of_speech[0] if parts_of_speech else 'word'}"
                    
                    return JsonResponse({
                        'word': word.upper(),
                        'meaning': primary_meaning,
                        'definitions': all_definitions[:4],  # Limit to 4 definitions
                        'parts_of_speech': parts_of_speech
                    })
            
            # If API fails, return fallback
            return JsonResponse({
                'word': word.upper(),
                'meaning': f'A five-letter word: {word.upper()}',
                'definitions': [f'"{word.upper()}" is a valid English word.'],
                'parts_of_speech': []
            }, status=200)
            
        except Exception as e:
            # Fallback if API fails
            print(f"[ERROR] Dictionary API failed for word '{word}': {str(e)}")
            return JsonResponse({
                'word': word.upper(),
                'meaning': f'A five-letter word: {word.upper()}',
                'definitions': [f'"{word.upper()}" is a valid English word.'],
                'parts_of_speech': []
            }, status=200)


class ApiDeductCoinsMeaningView(APIView):
    """
    Deduct 5 coins for word meaning clue
    POST /api/deduct-coins-meaning
    """
    
    @swagger_auto_schema(
        tags=['4. Game'],
        operation_description="Deduct 5 coins to get word meaning clue (once per game)",
        manual_parameters=[
            openapi.Parameter('Authorization', openapi.IN_HEADER, description="Bearer token", type=openapi.TYPE_STRING, required=True)
        ],
        responses={
            200: openapi.Response('Success', openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'success': openapi.Schema(type=openapi.TYPE_BOOLEAN),
                    'coins_deducted': openapi.Schema(type=openapi.TYPE_INTEGER),
                    'remaining_coins': openapi.Schema(type=openapi.TYPE_INTEGER, description='Remaining coin balance')
                }
            )),
            400: 'Bad Request - Insufficient coins',
            401: 'Unauthorized'
        }
    )
    def post(self, request):
        # Use the same authentication pattern as ApiHintView
        session = _get_session(request)
        if session is None or not session.user.is_active or session.member is None:
            return JsonResponse({'error': 'Unauthorized'}, status=401)
        
        # Check if member has enough coins
        session.member.refresh_from_db()
        MEANING_COST = 5
        
        if session.member.coins < MEANING_COST:
            return JsonResponse({
                'error': 'Not enough coins',
                'required': MEANING_COST,
                'current': session.member.coins
            }, status=400)
        
        # Deduct coins using atomic transaction (same pattern as ApiHintView)
        with transaction.atomic():
            member = AppUserMember.objects.select_for_update().get(id=session.member.id)
            
            # Double-check coins in case of race condition
            if member.coins < MEANING_COST:
                return JsonResponse({
                    'error': 'Not enough coins',
                    'required': MEANING_COST,
                    'current': member.coins
                }, status=400)
            
            member.coins -= MEANING_COST
            member.save(update_fields=['coins'])
            
            return JsonResponse({
                'success': True,
                'coins_deducted': MEANING_COST,
                'remaining_coins': member.coins
            })
