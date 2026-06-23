from django.urls import path
from . import views

urlpatterns = [
    path('', views.AchievementListView.as_view()),
]
