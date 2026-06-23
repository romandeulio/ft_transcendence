from django.contrib import admin
from .models import Tournament, TournamentRegistration


@admin.register(Tournament)
class TournamentAdmin(admin.ModelAdmin):
    list_display  = ['name', 'status', 'start_date', 'deadline', 'created_by']
    list_filter   = ['status']
    search_fields = ['name']


@admin.register(TournamentRegistration)
class TournamentRegistrationAdmin(admin.ModelAdmin):
    list_display = ['player1', 'player2', 'tournament', 'registered_at']
