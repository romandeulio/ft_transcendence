NAME = ft_transcendence
COMPOSE = docker compose

all: up

# Build and start containers
up:
	$(COMPOSE) up --build -d

# Stop containers
down:
	$(COMPOSE) down

# Restart everything
restart: down up

# Stop + remove containers, networks, volumes
clean:
	$(COMPOSE) down -v

# Full clean (images too)
fclean: clean
	docker system prune -af

# Rebuild from scratch
re: fclean up

# Logs
logs:
	$(COMPOSE) logs -f

# Exec into containers
exec-backend:
	docker exec -it transcendence_backend bash

exec-frontend:
	docker exec -it transcendence_frontend sh

exec-db:
	docker exec -it transcendence_postgresql psql -U $(POSTGRES_USER)

# Status
ps:
	$(COMPOSE) ps

backup:
	docker exec transcendence_backup /backup.sh

# Joueurs de test (à supprimer quand plus besoin)
seed:
	docker exec transcendence_backend python manage.py seed_users

# Créer des données de test (saison + users + matchs)
seed2:
	docker exec -it transcendence_backend python manage.py shell -c "\
	from seasons.models import Season; \
	from users.models import User; \
	from matches.models import Match; \
	from datetime import date; \
	import random; \
	\
	# Créer la saison active \
	season, _ = Season.objects.get_or_create( \
		name='Saison Test', \
		defaults={ \
			'start_date': date(2026, 1, 1), \
			'end_date':   date(2026, 12, 31), \
			'status':     'ACTIVE', \
		} \
	); \
	print(f'Saison: {season.name} ({season.status})'); \
	\
	# Récupérer tous les users actifs \
	users = list(User.objects.filter(is_active=True)); \
	print(f'Users trouvés: {len(users)}'); \
	\
	if len(users) < 2: \
		print('Pas assez de users — connecte-toi via OAuth 42 dabord'); \
	else: \
		# Créer 5 matchs SOLO validés avec ELO aléatoire \
		for i in range(5): \
			p1 = users[i % len(users)]; \
			p2 = users[(i + 1) % len(users)]; \
			if p1 == p2: continue; \
			delta = random.randint(10, 30); \
			m = Match.objects.create( \
				season=season, \
				match_type='SOLO', \
				is_ranked=True, \
				status='VALIDATED', \
				player1=p1, \
				player2=p2, \
				score_player1=10, \
				score_player2=random.randint(0, 9), \
				elo_solo_p1_before=p1.elo_solo, \
				elo_solo_p1_after=p1.elo_solo + delta, \
				elo_solo_p2_before=p2.elo_solo, \
				elo_solo_p2_after=p2.elo_solo - delta, \
			); \
			p1.elo_solo += delta; p1.save(); \
			p2.elo_solo -= delta; p2.save(); \
			print(f'Match {i+1}: {p1.username} vs {p2.username} +{delta}'); \
		print('Done — recharge la page classement'); \
	"
unseed:
	docker exec transcendence_backend python manage.py seed_users --clean

.PHONY: all up down restart clean fclean re logs exec-backend exec-frontend exec-db ps backup seed unseed