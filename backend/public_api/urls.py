from django.urls import path
from . import views

urlpatterns = [
	# --- Endpoints publics (X-API-Key) ---
	path('ranking/',               views.PublicRankingView.as_view(),         name='public-ranking'),
	path('matches/',               views.PublicMatchListCreateView.as_view(), name='public-match-list'),
	path('matches/<int:pk>/',      views.PublicMatchDetailView.as_view(),     name='public-match-detail'),

	# --- Gestion des clés (JWT) ---
	path('keys/',                  views.APIKeyListCreateView.as_view(),      name='api-key-list'),
	path('keys/<int:pk>/revoke/',  views.api_key_revoke,                     name='api-key-revoke'),
]
