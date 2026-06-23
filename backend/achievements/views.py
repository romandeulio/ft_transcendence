from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Achievement, UserAchievement
from .serializers import AchievementSerializer


class AchievementListView(APIView):
    """GET /api/achievements/ — liste tous les achievements avec statut unlock du user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        all_achievements = Achievement.objects.all().order_by('sort_order')

        user_unlocks = UserAchievement.objects.filter(
            user=request.user
        ).values_list('achievement_id', 'unlocked_at')

        unlocked_ids = set()
        unlocked_dates = {}
        for aid, dt in user_unlocks:
            unlocked_ids.add(aid)
            unlocked_dates[aid] = dt

        serializer = AchievementSerializer(
            all_achievements,
            many=True,
            context={
                'user': request.user,
                'unlocked_ids': unlocked_ids,
                'unlocked_dates': unlocked_dates,
            },
        )
        return Response(serializer.data)
