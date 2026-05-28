from django.urls import path
from . import views

urlpatterns = [
	path('',                       views.MatchListCreateView.as_view(), name='match-list'),
	path('<int:pk>/',              views.MatchDetailView.as_view(),     name='match-detail'),
	path('<int:pk>/validate/',     views.match_validate,                name='match-validate'),
	path('<int:pk>/cancel/',       views.match_cancel,                  name='match-cancel'),
]
