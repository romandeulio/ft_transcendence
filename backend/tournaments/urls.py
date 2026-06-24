from django.urls import path
from . import views

urlpatterns = [
    path('', views.TournamentListCreateView.as_view(), name='tournament-list-create'),
    path('bde-unlock/', views.bde_unlock, name='tournament-bde-unlock'),
    path('matches/<uuid:match_id>/result/',   views.tournament_match_result,     name='tournament-match-result'),
    path('matches/<uuid:match_id>/postpone/', views.postpone_tournament_match,   name='tournament-match-postpone'),
    path('<uuid:pk>/',                        views.update_tournament,            name='tournament-update'),
    path('<uuid:pk>/start/',                  views.start_tournament,             name='tournament-start'),
    path('<uuid:pk>/close-registrations/',    views.close_registrations,          name='tournament-close-registrations'),
    path('<uuid:pk>/reopen-registrations/',   views.reopen_registrations,         name='tournament-reopen-registrations'),
    path('<uuid:pk>/bracket/',                views.tournament_bracket,           name='tournament-bracket'),
    path('<uuid:pk>/force-team/',             views.force_team,                   name='tournament-force-team'),
    path('<uuid:pk>/register/',               views.register_to_tournament,       name='tournament-register'),
    path('<uuid:pk>/accept-invite/',          views.accept_teammate_invite,       name='tournament-accept-invite'),
    path('<uuid:pk>/registrations/',          views.tournament_registrations,     name='tournament-registrations'),
    path('<uuid:pk>/registrations/<uuid:reg_id>/', views.remove_registration,    name='tournament-remove-registration'),
    path('<uuid:pk>/solo/',                   views.tournament_solo,              name='tournament-solo'),
    path('<uuid:pk>/my-registration/',        views.my_registration,              name='tournament-my-registration'),
    path('<uuid:pk>/import-players/',   views.import_players,    name='tournament-import-players'),
]