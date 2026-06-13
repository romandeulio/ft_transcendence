from django.urls import path
from . import views

urlpatterns = [
    path('', views.TournamentListCreateView.as_view(), name='tournament-list-create'),
    path('bde-unlock/', views.bde_unlock, name='tournament-bde-unlock'),
    path('<int:pk>/register/', views.register_to_tournament, name='tournament-register'),
    path('<int:pk>/registrations/', views.tournament_registrations, name='tournament-registrations'),
    path('<int:pk>/solo/', views.tournament_solo, name='tournament-solo'),
    path('<int:pk>/my-registration/', views.my_registration, name='tournament-my-registration'),
]
