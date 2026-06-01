import csv, json
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

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
            'ranking_history': list(
                user.rankinghistory_set.values(
                    'mode', 'scope', 'score_before', 'score_after', 'score_delta', 'recorded_at'
                )
            ),
            'bets': list(
                user.bet_set.values('amount', 'result', 'payout', 'created_at')
            ),
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
        # anonyme pas delete
        user.email = f'deleted_{user.id}@deleted.invalid'
        user.username = f'deleted_{user.id}'
        user.password_hash = ''
        user.avatar_url = None
        user.oauth_42_id = None
        user.totp_secret = None
        user.is_active = False
        user.gdpr_deleted = True
        user.save()
        return Response({'status': 'Compte supprimé'})