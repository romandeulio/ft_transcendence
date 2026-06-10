from django.urls import path
from . import views

urlpatterns = [
	path('',                       views.SeasonListCreateView.as_view(), name='season-list'),
	path('<uuid:pk>/',              views.SeasonDetailView.as_view(),     name='season-detail'),
	path('<uuid:pk>/activate/',     views.season_activate,                name='season-activate'),
	path('<uuid:pk>/close/',        views.season_close,                   name='season-close'),
	path('<uuid:pk>/ranking/',      views.season_ranking,                 name='season-ranking'),
]
