from django.urls import path
from . import views

urlpatterns = [
	# Réservation
	path('reservation/current/',        views.reservation_current, name='reservation-current'),
	path('reservation/',                views.reservation_create,  name='reservation-create'),
	path('reservation/<uuid:pk>/close/', views.reservation_close,   name='reservation-close'),
	path('reservation/<uuid:pk>/cancel/', views.reservation_cancel, name='reservation-cancel'),

	# File d'attente
	path('queue/',                      views.QueueListView.as_view(), name='queue-list'),
	path('queue/join/',                 views.queue_join,              name='queue-join'),
	path('queue/<uuid:pk>/leave/',       views.queue_leave,             name='queue-leave'),
	path('queue/<uuid:pk>/promote/',     views.queue_promote,           name='queue-promote'),
]
