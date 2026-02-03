import csv
import re

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from hackathon.auth import PBKDF2_ITERATIONS, hash_password
from hackathon.models import AppUser, AppUserMember


_TEAM_NO_RE = re.compile(r'^\s*Team\s*(\d+)\s*$', flags=re.IGNORECASE)


def _parse_team_no(raw: str) -> int:
    match = _TEAM_NO_RE.match((raw or '').strip())
    if not match:
        raise ValueError(f'Invalid Team No. value: {raw!r}')
    return int(match.group(1))


def _format_password(team_no: int) -> str:
    return f'Team@{team_no:03d}'


def _normalize_phone(raw: str) -> str:
    phone = re.sub(r'\D+', '', (raw or '').strip())
    if not phone:
        raise ValueError('Missing phone')
    return phone


class Command(BaseCommand):
    help = 'Import team accounts and members from hackathon_users.csv'

    def add_arguments(self, parser):
        parser.add_argument(
            '--csv',
            dest='csv_path',
            default='hackathon_users.csv',
            help='Path to CSV (default: hackathon_users.csv in backend folder)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Validate and show counts without writing to DB',
        )
        parser.add_argument(
            '--append-only',
            action='store_true',
            help='Only create new teams/members found in CSV; do not update passwords or delete existing members',
        )

    def handle(self, *args, **options):
        csv_path = options['csv_path']
        dry_run = options['dry_run']
        append_only = options['append_only']

        try:
            with open(csv_path, newline='', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                expected = {'Team No.', 'Member ID', 'Name', 'Email', 'Phone'}
                if set(reader.fieldnames or []) != expected:
                    raise CommandError(f'CSV header must be exactly {sorted(expected)}. Got: {reader.fieldnames}')

                rows = [row for row in reader]
        except FileNotFoundError as exc:
            raise CommandError(f'CSV file not found: {csv_path}') from exc

        teams: dict[int, list[dict]] = {}
        seen_member_ids: set[str] = set()

        for idx, row in enumerate(rows, start=2):
            if not (row.get('Team No.') or '').strip() and not (row.get('Phone') or '').strip():
                continue

            team_no_raw = (row.get('Team No.') or '').strip()
            member_id = (row.get('Member ID') or '').strip()
            name = (row.get('Name') or '').strip()
            email = (row.get('Email') or '').strip() or None
            phone_raw = row.get('Phone')

            if not team_no_raw and not name and not email and not (phone_raw or '').strip():
                continue

            if not team_no_raw:
                raise CommandError(f'Row {idx}: missing Team No.')
            if not member_id:
                raise CommandError(f'Row {idx}: missing Member ID')
            if member_id in seen_member_ids:
                raise CommandError(f'Row {idx}: duplicate Member ID {member_id!r}')
            if not name:
                raise CommandError(f'Row {idx}: missing Name')

            try:
                team_no = _parse_team_no(team_no_raw)
                phone = _normalize_phone(phone_raw)
            except ValueError as exc:
                raise CommandError(f'Row {idx}: {exc}') from exc

            seen_member_ids.add(member_id)

            teams.setdefault(team_no, []).append({'member_id': member_id, 'name': name, 'email': email, 'phone': phone})

        if not teams:
            raise CommandError('No valid team rows found in CSV.')

        self.stdout.write(f'Teams found: {len(teams)}')
        self.stdout.write(f'Total members found: {sum(len(m) for m in teams.values())}')

        for team_no, members in sorted(teams.items()):
            if len(members) < 1:
                raise CommandError(f'Team {team_no} has no members')
            if len(members) > 5:
                raise CommandError(f'Team {team_no} has {len(members)} members (> 5).')

            phones: dict[str, str] = {}
            for m in members:
                if m['phone'] in phones and phones[m['phone']] != m['member_id']:
                    raise CommandError(
                        f"Team {team_no} has duplicate phone {m['phone']!r} for Member IDs {phones[m['phone']]!r} and {m['member_id']!r}."
                    )
                phones[m['phone']] = m['member_id']

        if append_only:
            for team_no, members in teams.items():
                existing_user = AppUser.objects.filter(team_no=team_no).first()
                if existing_user is None:
                    continue

                existing_member_ids = set(
                    AppUserMember.objects.filter(user=existing_user).values_list('member_id', flat=True)
                )
                incoming_member_ids = {m['member_id'] for m in members}
                new_member_ids = incoming_member_ids - existing_member_ids
                total_after = len(existing_member_ids) + len(new_member_ids)
                if total_after > 5:
                    raise CommandError(
                        f'Team {team_no} would have {total_after} members (> 5) after append-only import.'
                    )

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry-run enabled: no DB changes.'))
            return

        with transaction.atomic():
            for team_no, members in teams.items():
                unique_by_member_id: dict[str, dict] = {}
                for m in members:
                    unique_by_member_id[m['member_id']] = m
                members = list(unique_by_member_id.values())

                password = _format_password(team_no)
                salt_b64, password_hash_b64, iterations = hash_password(password, iterations=PBKDF2_ITERATIONS)

                user, created = AppUser.objects.get_or_create(
                    team_no=team_no,
                    defaults={
                        'username': f'Team {team_no}',
                        'email': None,
                        'phone': None,
                        'password_salt_b64': salt_b64,
                        'password_hash_b64': password_hash_b64,
                        'password_iterations': iterations,
                        'is_active': True,
                    },
                )

                if not append_only and not created:
                    AppUser.objects.filter(id=user.id).update(
                        username=f'Team {team_no}',
                        password_salt_b64=salt_b64,
                        password_hash_b64=password_hash_b64,
                        password_iterations=iterations,
                        is_active=True,
                    )

                if not append_only:
                    AppUserMember.objects.filter(user=user).exclude(member_id__in=[m['member_id'] for m in members]).delete()

                for m in members:
                    if append_only:
                        member, created_member = AppUserMember.objects.get_or_create(
                            member_id=m['member_id'],
                            defaults={'user': user, 'phone': m['phone'], 'name': m['name'], 'email': m['email']},
                        )
                        if not created_member and member.user_id != user.id:
                            raise CommandError(
                                f"Member ID {m['member_id']!r} already exists under Team {member.user.team_no}; cannot append into Team {team_no}."
                            )
                    else:
                        AppUserMember.objects.update_or_create(
                            member_id=m['member_id'],
                            defaults={'user': user, 'phone': m['phone'], 'name': m['name'], 'email': m['email']},
                        )

        self.stdout.write(self.style.SUCCESS('Import completed.'))
