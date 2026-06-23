"""URL routes for the betting API (mounted under /api/bets/)."""
from django.urls import path
from . import views

urlpatterns = [
    path('',           views.place_bet,      name='bet-place'),      # POST   place a bet
    path('available/', views.available_bets, name='bet-available'),  # GET    list open markets
    path('mine/',      views.my_bets,        name='bet-mine'),       # GET    caller's bet history
    path('<uuid:pk>/', views.cancel_bet,     name='bet-cancel'),     # DELETE cancel an open bet
]
