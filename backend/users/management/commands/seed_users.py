from django.core.management.base import BaseCommand
from django.db import connection
from users.models import User

SEED_USERS = [
    {"username": "player1", "email": "seed_player1@test.local", "password": "Test1234!"},
    {"username": "player2", "email": "seed_player2@test.local", "password": "Test1234!"},
    {"username": "player3", "email": "seed_player3@test.local", "password": "Test1234!"},
    {"username": "player4", "email": "seed_player4@test.local", "password": "Test1234!"},
    {"username": "player5", "email": "seed_player5@test.local", "password": "Test1234!"},
    {"username": "player6", "email": "seed_player6@test.local", "password": "Test1234!"},
    {"username": "player7", "email": "seed_player7@test.local", "password": "Test1234!"},
    {"username": "player8", "email": "seed_player8@test.local", "password": "Test1234!"},
    {"username": "player9", "email": "seed_player9@test.local", "password": "Test1234!"},
    {"username": "player10", "email": "seed_player10@test.local", "password": "Test1234!"},
    {"username": "player11", "email": "seed_player11@test.local", "password": "Test1234!"},
    {"username": "player12", "email": "seed_player12@test.local", "password": "Test1234!"},
    {"username": "player13", "email": "seed_player13@test.local", "password": "Test1234!"},
    {"username": "player14", "email": "seed_player14@test.local", "password": "Test1234!"},
    {"username": "player15", "email": "seed_player15@test.local", "password": "Test1234!"},
    {"username": "player16", "email": "seed_player16@test.local", "password": "Test1234!"},
    {"username": "player17", "email": "seed_player17@test.local", "password": "Test1234!"},
    {"username": "player18", "email": "seed_player18@test.local", "password": "Test1234!"},
    {"username": "player19", "email": "seed_player19@test.local", "password": "Test1234!"},
    {"username": "player20", "email": "seed_player20@test.local", "password": "Test1234!"},
    {"username": "player21", "email": "seed_player21@test.local", "password": "Test1234!"},
    {"username": "player22", "email": "seed_player22@test.local", "password": "Test1234!"},
    {"username": "player23", "email": "seed_player23@test.local", "password": "Test1234!"},
    {"username": "player24", "email": "seed_player24@test.local", "password": "Test1234!"},
    {"username": "player25", "email": "seed_player25@test.local", "password": "Test1234!"},
    {"username": "player26", "email": "seed_player26@test.local", "password": "Test1234!"},
    {"username": "player27", "email": "seed_player27@test.local", "password": "Test1234!"},
    {"username": "player28", "email": "seed_player28@test.local", "password": "Test1234!"},
    {"username": "player29", "email": "seed_player29@test.local", "password": "Test1234!"},
    {"username": "player30", "email": "seed_player30@test.local", "password": "Test1234!"},
    {"username": "player31", "email": "seed_player31@test.local", "password": "Test1234!"},
    {"username": "player32", "email": "seed_player32@test.local", "password": "Test1234!"},
]

SEED_EMAILS = {u["email"] for u in SEED_USERS}


class Command(BaseCommand):
    help = "Crée (ou supprime) 32 joueurs de test. --clean pour les supprimer."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Supprime les 32 joueurs de test de la base",
        )

    def handle(self, *args, **options):
        if options["clean"]:
            placeholders = ','.join(['%s'] * len(SEED_EMAILS))
            with connection.cursor() as cursor:
                cursor.execute(
                    f"DELETE FROM users WHERE email IN ({placeholders})",
                    list(SEED_EMAILS),
                )
                deleted = cursor.rowcount
            self.stdout.write(self.style.SUCCESS(f"{deleted} joueur(s) de test supprimé(s)."))
            return

        created = 0
        skipped = 0
        for data in SEED_USERS:
            if User.objects.filter(email=data["email"]).exists():
                skipped += 1
                continue
            user = User.objects.create_user(
                email=data["email"],
                username=data["username"],
                password=data["password"],
            )
            user.is_active = True
            user.save(update_fields=["is_active"])
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"{created} joueur(s) créé(s), {skipped} déjà existant(s).\n"
                f"Login : seed_playerX@test.local / Test1234!"
            )
        )
