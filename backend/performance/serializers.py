from rest_framework import serializers
from .models import Stats

class StatsSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Stats
        fields = [
            'id',
            'user',
            'total_matches',
            'total_wins',
            'total_losses',
            'total_gamelles',
            'total_demis',
            'elo_solo',
            'elo_team',
            'series_wins',
            'series_losses',
            'total_bets',
            'total_wins_bets',
            'total_losses_bets',
            'total_amount_won',
            'total_amount_lost',
            'created_at',
            'updated_at'
        ]