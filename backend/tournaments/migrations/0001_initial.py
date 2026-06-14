from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Tournament',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('start_date', models.DateTimeField()),
                ('deadline', models.DateTimeField(blank=True, null=True)),
                ('max_players', models.IntegerField(choices=[(8, '8'), (16, '16'), (32, '32'), (64, '64')], default=16)),
                ('prize', models.CharField(blank=True, default='', max_length=200)),
                ('status', models.CharField(
                    choices=[
                        ('OPEN', 'Inscriptions ouvertes'),
                        ('ONGOING', 'En cours'),
                        ('DONE', 'Terminé'),
                        ('CANCELLED', 'Annulé'),
                    ],
                    default='OPEN',
                    max_length=15,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='created_tournaments',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='TournamentRegistration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('registered_at', models.DateTimeField(auto_now_add=True)),
                ('tournament', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='registrations',
                    to='tournaments.tournament',
                )),
                ('player1', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='tournament_registrations_as_p1',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('player2', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='tournament_registrations_as_p2',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['registered_at'],
                'unique_together': {('tournament', 'player1')},
            },
        ),
    ]
