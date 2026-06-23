import uuid
from django.db import models


class Achievement(models.Model):
    class Meta:
        db_table = 'achievements'
        managed = False
        ordering = ['sort_order']

    id = models.CharField(max_length=40, primary_key=True)
    name = models.CharField(max_length=100)
    description = models.TextField(default='')
    icon = models.CharField(max_length=10, default='🏆')
    category = models.CharField(max_length=20)
    sort_order = models.IntegerField(default=0)

    def __str__(self):
        return self.name


class UserAchievement(models.Model):
    class Meta:
        db_table = 'user_achievements'
        managed = False
        unique_together = [('user', 'achievement')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='achievements',
    )
    achievement = models.ForeignKey(
        Achievement,
        on_delete=models.CASCADE,
        related_name='unlocks',
    )
    unlocked_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} → {self.achievement}"
