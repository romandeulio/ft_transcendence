from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Stats
from .serializers import StatsSerializer
from django.shortcuts import redirect as django_redirect
from django.conf import settings

class StatsView(APIView):

    def get(self, request):
        stats = Stats.objects.first()
        if not stats:
            return Response({"error": "Stats not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StatsSerializer(stats)
        return Response(serializer.data)