"""
Admin dashboard API — authentification par login/mdp fixé dans le .env.
Session admin stockée dans Django sessions.
"""

from datetime import timedelta

from django.conf import settings
from django.db.models import Q, Count
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny

from users.models import User
from matches.models import Match
from tournaments.models import Tournament
from seasons.models import Season


# ---------------------------------------------------------------------------
# Permission helper
# ---------------------------------------------------------------------------

class IsAdminSession:
    """DRF permission : vérifie que la session contient is_admin=True."""
    def has_permission(self, request, view):
        return request.session.get('is_admin', False)


# ---------------------------------------------------------------------------
# Login / Logout
# ---------------------------------------------------------------------------

class AdminLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        login = request.data.get('login', '')
        password = request.data.get('password', '')

        if login == settings.ADMIN_LOGIN and password == settings.ADMIN_PASSWORD:
            request.session['is_admin'] = True
            return Response({'detail': 'ok'})

        # Identifiants invalides renvoyés en 200 + en-tête X-Admin-Login (au lieu
        # d'un 401) pour éviter une ligne rouge dans la console navigateur. Le
        # front lit l'en-tête et affiche le message d'erreur traduit.
        resp = Response({'detail': 'Identifiant ou mot de passe incorrect.'})
        resp['X-Admin-Login'] = 'failed'
        return resp


class AdminLogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        request.session.pop('is_admin', None)
        return Response({'detail': 'Déconnecté'})


# ---------------------------------------------------------------------------
# Stats globales
# ---------------------------------------------------------------------------

class AdminStatsView(APIView):
    permission_classes = [IsAdminSession]

    def get(self, request):
        nb_users = User.objects.filter(is_active=True).count()
        nb_matches = Match.objects.filter(status='VALIDATED').count()
        nb_tournaments = Tournament.objects.exclude(status='CANCELLED').count()
        active_season = Season.get_active()

        return Response({
            'nb_users': nb_users,
            'nb_matches': nb_matches,
            'nb_tournaments': nb_tournaments,
            'active_season': active_season.name if active_season else None,
        })


# ---------------------------------------------------------------------------
# Joueurs
# ---------------------------------------------------------------------------

class AdminPlayersView(APIView):
    permission_classes = [IsAdminSession]

    def get(self, request):
        #users = User.objects.all().order_by('-created_at')
        users = User.objects.select_related("stats").all().order_by('-created_at')
        data = []
        for u in users:
            data.append({
                'id': str(u.id),
                'username': u.username,
                'email': u.email,
                'role': u.role,
                'elo_solo': u.stats.elo_solo,
                'elo_team': u.stats.elo_team,
                'is_active': u.is_active,
                'ban_permanent': u.ban_permanent,
                'banned_until': u.banned_until.isoformat() if u.banned_until else None,
                'is_banned': u.is_banned,
                'wallet_tokens': u.wallet_tokens,
                'avatar_url': u.avatar_url,
                'created_at': u.created_at.isoformat() if u.created_at else None,
            })
        return Response(data)


class AdminBanPlayerView(APIView):
    """
    POST body :
      { "permanent": true }                       → ban définitif
      { "duration_hours": 48 }                    → ban temporaire
    """
    permission_classes = [IsAdminSession]

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Utilisateur introuvable'}, status=404)

        if request.data.get('permanent'):
            user.ban_permanent = True
            user.banned_until = None
            user.save(update_fields=['ban_permanent', 'banned_until'])
            return Response({'detail': f'{user.username} banni définitivement.'})

        hours = request.data.get('duration_hours')
        if not hours:
            return Response({'error': 'Précise permanent=true ou duration_hours.'}, status=400)

        user.ban_permanent = False
        user.banned_until = timezone.now() + timedelta(hours=float(hours))
        user.save(update_fields=['ban_permanent', 'banned_until'])
        return Response({'detail': f'{user.username} banni pour {hours}h.'})


class AdminUnbanPlayerView(APIView):
    permission_classes = [IsAdminSession]

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Utilisateur introuvable'}, status=404)

        user.ban_permanent = False
        user.banned_until = None
        user.save(update_fields=['ban_permanent', 'banned_until'])
        return Response({'detail': f'{user.username} débanni.'})


class AdminUpdateEloView(APIView):
    permission_classes = [IsAdminSession]

    def patch(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Utilisateur introuvable'}, status=404)

        elo_solo = request.data.get('elo_solo')
        elo_team = request.data.get('elo_team')

        fields = []
        stats = user.stats

        if elo_solo is not None:
            stats.elo_solo = int(elo_solo)
            fields.append('elo_solo')

        if elo_team is not None:
            stats.elo_team = int(elo_team)
            fields.append('elo_team')

        if not fields:
            return Response({'error': 'Aucun ELO fourni.'}, status=400)

        stats.save(update_fields=fields)
        return Response({
            'detail': 'ELO mis à jour.',
            'elo_solo': stats.elo_solo,
            'elo_team': stats.elo_team,
        })


# ---------------------------------------------------------------------------
# Matchs récents
# ---------------------------------------------------------------------------

class AdminRecentMatchesView(APIView):
    permission_classes = [IsAdminSession]

    def get(self, request):
        matches = Match.objects.select_related(
            'player1', 'player2', 'player1_teammate', 'player2_teammate',
        ).order_by('-played_at')[:20]

        data = []
        for m in matches:
            p1 = m.player1.username if m.player1 else '?'
            p2 = m.player2.username if m.player2 else '?'
            if m.match_type == 'TEAM':
                p1tm = m.player1_teammate.username if m.player1_teammate else '?'
                p2tm = m.player2_teammate.username if m.player2_teammate else '?'
                p1 = f"{p1} & {p1tm}"
                p2 = f"{p2} & {p2tm}"

            entry = {
                'id': str(m.id),
                'p1': p1,
                'p2': p2,
                'score': f"{m.score_player1}-{m.score_player2}",
                'match_type': m.match_type,
                'is_ranked': m.is_ranked,
                'status': m.status,
                'played_at': m.played_at.isoformat() if m.played_at else None,
            }

            if m.is_ranked:
                if m.match_type == 'SOLO':
                    entry['elo_p1'] = m.elo_solo_player1_after - m.elo_solo_player1_before
                    entry['elo_p2'] = m.elo_solo_player2_after - m.elo_solo_player2_before
                else:
                    entry['elo_p1'] = m.elo_team_p1_after - m.elo_team_p1_before
                    entry['elo_p2'] = m.elo_team_p2_after - m.elo_team_p2_before

            data.append(entry)
        return Response(data)


class AdminCancelMatchView(APIView):
    """Annule un match validé et rollback les ELO des joueurs."""
    permission_classes = [IsAdminSession]

    def post(self, request, match_id):
        from stats.models import Stats
        from django.db import transaction

        try:
            match = Match.objects.select_related(
                'player1', 'player2', 'player1_teammate', 'player2_teammate',
            ).get(pk=match_id)
        except Match.DoesNotExist:
            return Response({'error': 'Match introuvable'}, status=404)

        if match.status == 'CANCELLED':
            return Response({'error': 'Match déjà annulé'}, status=400)

        with transaction.atomic():
            # Rembourser le delta ELO si match classé
            if match.is_ranked and match.status == 'VALIDATED':
                if match.match_type == 'SOLO':
                    for player, before, after in [
                        (match.player1, match.elo_solo_player1_before, match.elo_solo_player1_after),
                        (match.player2, match.elo_solo_player2_before, match.elo_solo_player2_after),
                    ]:
                        if player:
                            delta = after - before  # positif si gagné, négatif si perdu
                            stats, _ = Stats.objects.get_or_create(user=player)
                            stats.elo_solo -= delta
                            stats.save(update_fields=['elo_solo'])

                elif match.match_type == 'TEAM':
                    for player, before, after in [
                        (match.player1, match.elo_team_p1_before, match.elo_team_p1_after),
                        (match.player1_teammate, match.elo_team_p1tm_before, match.elo_team_p1tm_after),
                        (match.player2, match.elo_team_p2_before, match.elo_team_p2_after),
                        (match.player2_teammate, match.elo_team_p2tm_before, match.elo_team_p2tm_after),
                    ]:
                        if player:
                            delta = after - before
                            stats, _ = Stats.objects.get_or_create(user=player)
                            stats.elo_team -= delta
                            stats.save(update_fields=['elo_team'])

            match.status = 'CANCELLED'
            match.save(update_fields=['status'])

        return Response({'detail': 'Match annulé, ELO remboursé.'})


# ---------------------------------------------------------------------------
# Tournois
# ---------------------------------------------------------------------------

class AdminTournamentsView(APIView):
    permission_classes = [IsAdminSession]

    def get(self, request):
        tournaments = Tournament.objects.all().order_by('-created_at')
        data = []
        for t in tournaments:
            data.append({
                'id': str(t.id),
                'name': t.name,
                'status': t.status,
                'start_date': t.start_date.isoformat() if t.start_date else None,
                'deadline': t.deadline.isoformat() if t.deadline else None,
                'created_at': t.created_at.isoformat() if t.created_at else None,
            })
        return Response(data)


class AdminCancelTournamentView(APIView):
    permission_classes = [IsAdminSession]

    def post(self, request, tournament_id):
        # Erreurs renvoyées en 200 + en-tête X-Admin-Error (au lieu de 400/404)
        # pour éviter une ligne rouge dans la console. Le front lit l'en-tête.
        def _err(message, code):
            resp = Response({'error': message})
            resp['X-Admin-Error'] = code
            return resp

        try:
            t = Tournament.objects.get(pk=tournament_id)
        except Tournament.DoesNotExist:
            return _err('Tournoi introuvable', 'NOT_FOUND')

        if t.status == 'CANCELLED':
            return _err('Déjà annulé', 'ALREADY_CANCELLED')
        if t.status == 'DONE':
            return _err('Tournoi terminé, impossible d\'annuler', 'DONE')

        t.status = 'CANCELLED'
        t.save(update_fields=['status'])
        return Response({'detail': f'Tournoi "{t.name}" annulé.'})


class AdminCreateTournamentView(APIView):
    # Création de tournoi depuis le panneau admin (session is_admin, pas de JWT).
    # On ne peut pas réutiliser l'endpoint BDE (IsAuthenticated → 403 sans JWT) :
    # on appelle la logique de création partagée avec created_by=None.
    permission_classes = [IsAdminSession]

    def post(self, request):
        from tournaments.views import _create_tournament

        data, error = _create_tournament(request.data, None)
        if error:
            resp = Response({'detail': error[0], 'code': error[1]})
            resp['X-Tournament-Error'] = error[1]
            return resp
        return Response(data, status=201)


class AdminImportPlayersView(APIView):
    # Import de joueurs depuis le panneau admin. L'admin s'authentifie par session
    # (is_admin) et non par JWT : on ne peut donc PAS réutiliser l'endpoint BDE
    # /api/tournaments/<id>/import-players/ (protégé par IsAuthenticated → 403 pour
    # une session sans JWT). On réutilise ici la logique d'import partagée.
    permission_classes = [IsAdminSession]
    parser_classes     = [MultiPartParser, FormParser]

    def post(self, request, tournament_id):
        from tournaments.views import _do_import_players

        tournament = get_object_or_404(Tournament, pk=tournament_id)
        result, error = _do_import_players(tournament, request.FILES.get('file'))
        if error:
            # Même convention que le reste : 200 + en-tête (pas de 400 en console).
            resp = Response({'detail': error[0], 'code': error[1]})
            resp['X-Tournament-Error'] = error[1]
            return resp
        return Response(result, status=201)


class AdminCloseRegistrationsView(APIView):
    permission_classes = [IsAdminSession]

    def post(self, request, tournament_id):
        tournament = get_object_or_404(Tournament, pk=tournament_id)
        if tournament.status != Tournament.Status.OPEN:
            resp = Response({'detail': 'Les inscriptions ne sont pas ouvertes.'})
            resp['X-Admin-Error'] = 'NOT_OPEN'
            return resp
        tournament.status = Tournament.Status.CLOSED
        tournament.save(update_fields=['status'])
        return Response({'status': 'CLOSED'})


class AdminStartTournamentView(APIView):
    permission_classes = [IsAdminSession]

    def post(self, request, tournament_id):
        from tournaments.views import _do_start_tournament

        tournament = get_object_or_404(Tournament, pk=tournament_id)
        data, error = _do_start_tournament(tournament)
        if error:
            payload = {'detail': error[0], 'code': error[1]}
            if len(error) > 2 and error[2]:
                payload.update(error[2])
            resp = Response(payload)
            resp['X-Tournament-Error'] = error[1]
            return resp
        return Response(data)


# ---------------------------------------------------------------------------
# Saisons
# ---------------------------------------------------------------------------

class AdminSeasonsView(APIView):
    permission_classes = [IsAdminSession]

    def get(self, request):
        seasons = Season.objects.all().order_by('-start_date')
        data = []
        for s in seasons:
            data.append({
                'id': str(s.id),
                'name': s.name,
                'status': s.status,
                'start_date': s.start_date.isoformat(),
                'end_date': s.end_date.isoformat(),
            })
        return Response(data)

    def post(self, request):
        name = request.data.get('name', '').strip()
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')

        if not name:
            return Response({'error': 'Champs requis : name'}, status=400)

        # Dates optionnelles : par défaut la saison démarre aujourd'hui
        # et se termine 3 mois plus tard.
        from datetime import date, timedelta
        start_date = start_date or date.today()
        if not end_date:
            base = start_date if isinstance(start_date, date) else date.fromisoformat(start_date)
            end_date = base + timedelta(days=90)

        season = Season.objects.create(
            name=name,
            start_date=start_date,
            end_date=end_date,
        )
        return Response({
            'id': str(season.id),
            'name': season.name,
            'status': season.status,
            'start_date': str(season.start_date),
            'end_date': str(season.end_date),
            'detail': 'Saison créée.',
        }, status=201)


class AdminSeasonDetailView(APIView):
    permission_classes = [IsAdminSession]

    def patch(self, request, season_id):
        from django.db import transaction
        try:
            season = Season.objects.get(pk=season_id)
        except Season.DoesNotExist:
            return Response({'error': 'Saison introuvable'}, status=404)

        action = request.data.get('action')

        if action == 'activate':
            if season.status != 'UPCOMING':
                return Response({'error': f"Statut actuel : '{season.status}'. Seules les saisons UPCOMING peuvent être activées."}, status=400)
            from seasons.views import _close_season
            with transaction.atomic():
                # Clore proprement l'ancienne saison active : récompenses + reset ELO
                old_active = Season.objects.filter(status='ACTIVE').first()
                if old_active:
                    _close_season(old_active)
                season.status = 'ACTIVE'
                season.save(update_fields=['status'])
        elif action == 'finish':
            if season.status != 'ACTIVE':
                return Response({'error': "Seule une saison ACTIVE peut être terminée."}, status=400)
            from seasons.views import _close_season
            with transaction.atomic():
                # Termine la saison : récompenses + reset ELO de tous les joueurs
                _close_season(season)
        else:
            return Response({'error': "Action invalide. Utiliser 'activate' ou 'finish'."}, status=400)

        return Response({
            'id': str(season.id),
            'name': season.name,
            'status': season.status,
        })

class AdminDeleteUserView(APIView):
    permission_classes = [IsAdminSession]

    def delete(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        # anonymize() annule l'activité en cours (matchs, réservations, créneaux
        # de file) et notifie la session WebSocket du joueur (_kick_live_session
        # → fermeture code 4002 → markAccountDeleted côté front). Pas besoin de
        # dupliquer le group_send ici.
        user.anonymize()
        return Response(status=204)
 
 
class AdminUpdateWalletView(APIView):
    permission_classes = [IsAdminSession]

    def patch(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Utilisateur introuvable'}, status=404)

        wallet_tokens = request.data.get('wallet_tokens')
        if wallet_tokens is None:
            return Response({'error': 'wallet_tokens requis.'}, status=400)

        user.wallet_tokens = int(wallet_tokens)
        user.save(update_fields=['wallet_tokens'])
        return Response({
            'detail': 'Jetons mis à jour.',
            'wallet_tokens': user.wallet_tokens,
        })


class AdminUpdateUserRoleView(APIView):
    permission_classes = [IsAdminSession]
 
    ALLOWED_ROLES = {"user", "stud", "bde", "piscineux", "alumni", "bocalien"}
 
    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk)
 
        role = request.data.get("role")
        if role not in self.ALLOWED_ROLES:
            return Response({"error": "Rôle invalide"}, status=400)
 
        user.role = role
        user.save(update_fields=["role"])
        return Response({"id": str(user.id), "role": user.role})
