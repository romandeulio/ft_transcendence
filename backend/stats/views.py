from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Stats
from .serializers import StatsSerializer
from django.shortcuts import redirect as django_redirect
from django.conf import settings

class StatsView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        try:
            stats = Stats.objects.get(user=request.user)
        except Stats.DoesNotExist:
            return Response({
                'total_matches': 0,
                'total_wins': 0,
                'total_losses': 0,
                'total_gamelles': 0,
                'total_demis': 0,
                'elo_solo': request.user.elo_solo,
                'elo_team': request.user.elo_team,
            })
        return Response(StatsSerializer(stats).data)