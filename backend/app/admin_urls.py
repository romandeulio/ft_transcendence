from django.urls import path
from . import admin_views as v

urlpatterns = [
    path('login/',                                   v.AdminLoginView.as_view()),
    path('logout/',                                  v.AdminLogoutView.as_view()),
    path('stats/',                                   v.AdminStatsView.as_view()),
    path('players/',                                 v.AdminPlayersView.as_view()),
    path('players/<uuid:user_id>/ban/',              v.AdminBanPlayerView.as_view()),
    path('players/<uuid:user_id>/unban/',            v.AdminUnbanPlayerView.as_view()),
    path('players/<uuid:user_id>/elo/',              v.AdminUpdateEloView.as_view()),
    path('players/<uuid:user_id>/wallet/',           v.AdminUpdateWalletView.as_view()),
    path('players/<uuid:pk>/delete/',                v.AdminDeleteUserView.as_view()),
    path('players/<uuid:pk>/role/',                  v.AdminUpdateUserRoleView.as_view()),
    path('matches/',                                 v.AdminRecentMatchesView.as_view()),
    path('matches/<uuid:match_id>/cancel/',          v.AdminCancelMatchView.as_view()),
    path('tournaments/',                             v.AdminTournamentsView.as_view()),
    path('tournaments/<uuid:tournament_id>/cancel/', v.AdminCancelTournamentView.as_view()),
    path('seasons/',                                 v.AdminSeasonsView.as_view()),
    path('seasons/<uuid:season_id>/',                v.AdminSeasonDetailView.as_view()),
]
