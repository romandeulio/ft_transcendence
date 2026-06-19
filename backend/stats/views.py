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
        stats, _ = Stats.objects.get_or_create(user=request.user)
        return Response(StatsSerializer(stats).data)