from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('matches', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='match',
            name='gamelles_player1',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='match',
            name='gamelles_player2',
            field=models.IntegerField(default=0),
        ),
    ]
