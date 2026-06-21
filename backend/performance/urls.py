from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('stats/',        views.StatsView.as_view()),
    path('history/',      views.PerformanceHistoryView.as_view()),
    path('rank-history/', views.RankHistoryView.as_view()),
]
