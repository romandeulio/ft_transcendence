# gdpr/views.py
import csv, json, os, uuid, random, string
from django.http import HttpResponse
from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .models import User


def _generate_code():
    return ''.join(random.choices(string.digits, k=6))


def _send_verification_mail(user, action: str, code: str):
    labels = {
        'export': 'export de vos données',
        'delete': 'suppression de votre compte',
    }
    send_mail(
        subject=f'[Boca] Confirmation : {labels[action]}',
        message=(
            f'Bonjour {user.username},\n\n'
            f'Voici votre code de vérification pour {labels[action]} :\n\n'
            f'    {code}\n\n'
            f'Ce code est valable 15 minutes.\n'
            f'Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce mail.'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )

class GDPRRequestCodeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        action = request.data.get('action')
        if action not in ('export', 'delete'):
            return Response(
                {'error': 'action doit être "export" ou "delete"'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        code = _generate_code()
        cache_key = f'gdpr:{action}:{request.user.id}'
        cache.set(cache_key, code, timeout=60 * 15)
        _send_verification_mail(request.user, action, code)

        return Response({'detail': f'Code envoyé à {request.user.email}'})

class GDPRExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        code = request.data.get('code', '')
        cache_key = f'gdpr:export:{user.id}'
        expected = cache.get(cache_key)

        if not expected or code != expected:
            return Response(
                {'error': 'Code invalide ou expiré'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(cache_key)

        data = {
            'user': {
                'username': user.username,
                'email': user.email,
                'role': user.role,
                'is_active': user.is_active,
                'is_2fa_enabled': user.is_2fa_enabled,
                'wallet_tokens': user.wallet_tokens,
                'avatar_url': user.avatar_url,
                'last_login': str(user.last_login),
                'created_at': str(user.created_at),
            },
            'stats': list(
                user.stats_set.values(
                    'total_matches', 'total_wins', 'total_losses',
                    'total_gamelles', 'total_demis',
                    'elo_solo', 'elo_team',
                    'series_wins', 'series_losses',
                    'total_bets', 'total_wins_bets', 'total_losses_bets',
                    'total_amount_won', 'total_amount_lost',
                )
            ),
            'season_stats': list(
                user.season_stats_set.values(
                    'season_id', 'total_matches', 'total_wins', 'total_losses',
                    'total_gamelles', 'total_demis', 'elo_solo', 'elo_team',
                    'updated_at',
                )
            ),
            'season_rewards': list(
                user.season_rewards_set.values(
                    'season_id', 'ranking_type', 'tier',
                    'tokens_awarded', 'elo_at_end', 'rank_at_end', 'awarded_at',
                )
            ),
            'rankings': list(
                user.rankings.values(
                    'season_id', 'mode', 'scope', 'score', 'wins', 'losses', 'updated_at',
                )
            ),
            'ranking_history': list(
                user.ranking_history.values(
                    'match_id', 'season_id', 'mode', 'scope',
                    'score_before', 'score_after', 'score_delta', 'recorded_at',
                )
            ),
            'matches_played': list(
                user.matches_as_player1.values(
                    'match_type', 'is_ranked', 'status',
                    'score_player1', 'score_player2',
                    'gamelles_player1', 'gamelles_player2',
                    'demis_player1', 'demis_player2',
                    'elo_solo_p1_before', 'elo_solo_p1_after',
                    'played_at',
                ).union(
                    user.matches_as_player2.values(
                        'match_type', 'is_ranked', 'status',
                        'score_player1', 'score_player2',
                        'gamelles_player1', 'gamelles_player2',
                        'demis_player1', 'demis_player2',
                        'elo_solo_p2_before', 'elo_solo_p2_after',
                        'played_at',
                    )
                )
            ),
            'bets': list(
                user.bets.values('match_id', 'amount', 'result', 'payout', 'odds', 'created_at')
            ),
            'wallet_transactions': list(
                user.wallet_transactions.values('type', 'amount', 'reference_id', 'created_at')
            ),
            'tournament_registrations': list(
                user.tournament_registrations_as_p1.values(
                    'tournament_id', 'registered_at',
                )
            ),
            'organization_memberships': list(
                user.organization_members.values(
                    'organization_id', 'role', 'joined_at',
                )
            ),
            'achievements': list(
                user.user_achievements.values(
                    'achievement_id', 'unlocked_at',
                )
            ),
        }

        fmt = request.query_params.get('format', 'json')
        if fmt == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="my_data.csv"'
            writer = csv.writer(response)
            writer.writerow(['=== PROFIL ==='])
            writer.writerow(list(data['user'].keys()))
            writer.writerow(list(data['user'].values()))
            sections = [
                ('STATS', 'stats'),
                ('CLASSEMENTS', 'rankings'),
                ('HISTORIQUE ELO', 'ranking_history'),
                ('MATCHS', 'matches_played'),
                ('PARIS', 'bets'),
                ('TRANSACTIONS', 'wallet_transactions'),
                ('ACHIEVEMENTS', 'achievements'),
            ]
            for label, key in sections:
                rows = data[key]
                if rows:
                    writer.writerow([])
                    writer.writerow([f'=== {label} ==='])
                    writer.writerow(list(rows[0].keys()))
                    for row in rows:
                        writer.writerow(list(row.values()))
            return response

        return HttpResponse(json.dumps(data, default=str), content_type='application/json')


class GDPRDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        user = request.user
        code = request.data.get('code', '')
        cache_key = f'gdpr:delete:{user.id}'
        expected = cache.get(cache_key)

        if not expected or code != expected:
            return Response(
                {'error': 'Code invalide ou expiré'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(cache_key)

        if user.avatar_url:
            path = os.path.join(
                settings.MEDIA_ROOT,
                user.avatar_url.replace('/media/', ''),
            )
            if os.path.exists(path):
                os.remove(path)

        user.username = f"del{str(user.id)[:5]}"
        user.email = f"{uuid.uuid4()}@deleted.invalid"
        user.set_unusable_password()
        user.avatar_url = None
        user.oauth_42_id = None
        user.totp_secret = None
        user.is_2fa_enabled = False
        user.is_active = False
        user.last_login = None
        user.banned_until = None
        user.gdpr_deleted = True
        user.save()

        return Response({'status': 'Compte anonymisé'})