import csv, json, os, uuid
from django.http import HttpResponse
from django.conf import settings
from .models import User
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

class GDPRExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        fmt = request.query_params.get('format', 'json')

        data = {
            'user': {
                'username': user.username,
                'email': user.email,
                'created_at': str(user.created_at),
            },
            "rankings": list(
                user.rankings.values(
                    "mode",
                    "scope",
                    "score",
                    "wins",
                    "losses",
                )
            ),
            'ranking_history': list(
                user.ranking_history.values(
                    'mode',
                    'scope',
                    'score_before',
                    'score_after',
                    'score_delta',
                    'recorded_at'
                )
            ),
            #'bets': list(
            #    user.bets.values('amount', 'result', 'payout')#, 'created_at')
            #),
        }

        if fmt == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="my_data.csv"'
            writer = csv.writer(response)
            writer.writerow(['username', 'email', 'created_at'])
            writer.writerow([user.username, user.email, user.created_at])
            return response

        return HttpResponse(json.dumps(data, default=str), content_type='application/json')

class GDPRDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        user = request.user

        # Supprimer l'avatar local
        if user.avatar_url:
            path = os.path.join(settings.MEDIA_ROOT, user.avatar_url.replace("/media/", ""))
            if os.path.exists(path):
                os.remove(path)

        # Anonymisation
        user.username = f"del{str(user.id)[:5]}"
        user.email = f"{uuid.uuid4()}@deleted.invalid"
        user.set_unusable_password()
        if user.avatar_url:
            path = os.path.join(
                settings.MEDIA_ROOT,
                user.avatar_url.replace("/media/", "")
            )
            if os.path.exists(path):
                os.remove(path)
        user.avatar_url = None
        user.oauth_42_id = None
        user.totp_secret = None
        user.is_2fa_enabled = False

        user.is_active = False
        user.gdpr_deleted = True

        user.save()

        return Response({"status": "Compte anonymisé"})