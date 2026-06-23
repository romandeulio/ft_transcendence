from rest_framework import serializers
from .models import Achievement, UserAchievement


class AchievementSerializer(serializers.ModelSerializer):
    unlocked = serializers.SerializerMethodField()
    unlocked_at = serializers.SerializerMethodField()

    class Meta:
        model = Achievement
        fields = ['id', 'name', 'description', 'icon', 'category', 'sort_order', 'unlocked', 'unlocked_at']

    def get_unlocked(self, obj):
        user = self.context.get('user')
        if not user:
            return False
        return obj.id in self.context.get('unlocked_ids', set())

    def get_unlocked_at(self, obj):
        user = self.context.get('user')
        if not user:
            return None
        return self.context.get('unlocked_dates', {}).get(obj.id)
