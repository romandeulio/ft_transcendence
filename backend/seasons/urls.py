from django.urls import path
from . import views

urlpatterns = [
	path('',                       views.SeasonListCreateView.as_view(), name='season-list'),
	path('<int:pk>/',              views.SeasonDetailView.as_view(),     name='season-detail'),
	path('<int:pk>/activate/',     views.season_activate,                name='season-activate'),
	path('<int:pk>/close/',        views.season_close,                   name='season-close'),
	path('<int:pk>/ranking/',      views.season_ranking,                 name='season-ranking'),
]
