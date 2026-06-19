from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('me/',         views.StatsView.as_view(), name='stats-me'),
]
