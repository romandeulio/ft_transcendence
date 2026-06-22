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
from stats.models import Stats


def _generate_code():
    return ''.join(random.choices(string.digits, k=6))


def _invalid_code_response():
    """Réponse « code invalide » en HTTP 200 (au lieu de 400) pour éviter une
    ligne d'erreur réseau rouge dans la console du navigateur. Le front détecte
    le cas via l'en-tête X-GDPR-Code-Valid (robuste même quand l'export renvoie
    un fichier) et/ou le champ JSON `valid`."""
    resp = Response({'valid': False}, status=status.HTTP_200_OK)
    resp['X-GDPR-Code-Valid'] = 'false'
    return resp


def _send_verification_mail(user, action: str, code: str):
    labels = {
        'export': 'exporting your data',
        'delete': 'deleting your account',
    }
    send_mail(
        subject=f'[Boca] Confirmation: {labels[action]}',
        message=(
            f'Hello {user.username},\n\n'
            f'Here is your verification code for {labels[action]}:\n\n'
            f'    {code}\n\n'
            f'This code is valid for 15 minutes.\n'
            f'If you did not request this, please ignore this email.'
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
            return _invalid_code_response()
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
            'stats': list(Stats.objects.filter(user=user).values()),
            'season_rewards': list(user.season_rewards.values()),
            'rankings': list(user.rankings.values()),
            'ranking_history': list(user.ranking_history.values()),
            'matches_played': list(
                user.matches_as_player1.values().union(
                    user.matches_as_player2.values()
                )
            ),
            'bets': list(user.bets.values()),
            'wallet_transactions': list(user.wallet_transactions.values()),
            'tournament_registrations': list(
                user.tournament_registrations_as_p1.values()
            ),
            'organization_memberships': list(
                user.organization_memberships.values()
            ),
            'achievements': list(user.achievements.values()),
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
            return _invalid_code_response()
        cache.delete(cache_key)

        user.anonymize()

        return Response({'valid': True, 'status': 'Compte anonymisé'})