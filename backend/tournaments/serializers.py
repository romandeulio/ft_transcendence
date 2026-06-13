from rest_framework import serializers
from .models import Tournament, TournamentRegistration


class TournamentSerializer(serializers.ModelSerializer):
    registered     = serializers.SerializerMethodField()
    date_label     = serializers.SerializerMethodField()
    deadline_label = serializers.SerializerMethodField()

    class Meta:
        model  = Tournament
        fields = [
            'id', 'name', 'start_date', 'deadline', 'max_players',
            'prize', 'status', 'registered', 'date_label', 'deadline_label', 'created_at',
        ]

    def get_registered(self, obj):
        return obj.registrations.count()

    def get_date_label(self, obj):
        if not obj.start_date:
            return ''
        return obj.start_date.strftime('%d/%m/%Y à %H:%M')

    def get_deadline_label(self, obj):
        if not obj.deadline:
            return None
        return obj.deadline.strftime('%d/%m/%Y')


class TournamentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Tournament
        fields = ['name', 'start_date', 'deadline', 'max_players', 'prize']


class RegistrationSerializer(serializers.ModelSerializer):
    player1 = serializers.CharField(source='player1.username')
    player2 = serializers.SerializerMethodField()

    class Meta:
        model  = TournamentRegistration
        fields = ['id', 'player1', 'player2', 'registered_at']

    def get_player2(self, obj):
        return obj.player2.username if obj.player2 else None
