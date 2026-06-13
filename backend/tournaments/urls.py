from django.urls import path
from . import views

urlpatterns = [
    path('', views.TournamentListCreateView.as_view(), name='tournament-list-create'),
    path('bde-unlock/', views.bde_unlock, name='tournament-bde-unlock'),
    path('<int:pk>/', views.update_tournament, name='tournament-update'),
    path('<int:pk>/start/', views.start_tournament, name='tournament-start'),
    path('<int:pk>/bracket/', views.tournament_bracket, name='tournament-bracket'),
    path('<int:pk>/force-team/', views.force_team, name='tournament-force-team'),
    path('<int:pk>/register/', views.register_to_tournament, name='tournament-register'),
    path('<int:pk>/accept-invite/', views.accept_teammate_invite, name='tournament-accept-invite'),
    path('<int:pk>/registrations/', views.tournament_registrations, name='tournament-registrations'),
    path('<int:pk>/registrations/<int:reg_id>/', views.remove_registration, name='tournament-remove-registration'),
    path('<int:pk>/solo/', views.tournament_solo, name='tournament-solo'),
    path('<int:pk>/my-registration/', views.my_registration, name='tournament-my-registration'),
    path('matches/<int:match_id>/result/', views.tournament_match_result, name='tournament-match-result'),
    path('matches/<int:match_id>/postpone/', views.postpone_tournament_match, name='tournament-match-postpone'),
]
