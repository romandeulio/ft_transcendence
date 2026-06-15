from django.urls import path
from . import views

urlpatterns = [
    path('',           views.place_bet,      name='bet-place'),
    path('available/', views.available_bets, name='bet-available'),
    path('mine/',      views.my_bets,        name='bet-mine'),
    path('<uuid:pk>/', views.cancel_bet,     name='bet-cancel'),
]
