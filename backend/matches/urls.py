from django.urls import path
from . import views

urlpatterns = [
	path('',                       views.MatchListCreateView.as_view(), name='match-list'),
	path('<uuid:pk>/',              views.MatchDetailView.as_view(),     name='match-detail'),
	path('<uuid:pk>/validate/',     views.match_validate,                name='match-validate'),
	path('<uuid:pk>/cancel/',       views.match_cancel,                  name='match-cancel'),
]
