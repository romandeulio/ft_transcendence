CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      VARCHAR(8) UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password      TEXT,
    role          VARCHAR(15) DEFAULT 'user' CHECK (role IN ('user', 'bocalien', 'piscineux', 'stud', 'bde', 'admin', 'alumni')),
    is_2fa_enabled BOOLEAN DEFAULT FALSE,
    totp_secret   TEXT,
    oauth_42_id   TEXT UNIQUE,
    avatar_url    TEXT,
    last_login    TIMESTAMP,
    gdpr_deleted  BOOLEAN DEFAULT FALSE,
    ban_permanent BOOLEAN DEFAULT FALSE,
    banned_until  TIMESTAMPTZ,
    is_active     BOOLEAN DEFAULT FALSE,
    wallet_tokens INT DEFAULT 10000,
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stats (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_matches     INT DEFAULT 0,
    total_wins        INT DEFAULT 0,
    total_losses      INT DEFAULT 0,
    total_gamelles    INT DEFAULT 0,
    total_demis       INT DEFAULT 0,
    elo_solo          INT DEFAULT 1000,
    elo_team          INT DEFAULT 1000,
    series_wins       INT DEFAULT 0,
    series_losses     INT DEFAULT 0,
    total_bets        INT DEFAULT 0,
    total_wins_bets   INT DEFAULT 0,
    total_losses_bets INT DEFAULT 0,
    total_amount_won  INT DEFAULT 0,
    total_amount_lost INT DEFAULT 0,
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE seasons (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100) NOT NULL,
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    status              VARCHAR(10) NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('UPCOMING', 'ACTIVE', 'FINISHED')),
    rewards_distributed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE matches (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id           UUID REFERENCES seasons(id),
    match_type          VARCHAR(10) NOT NULL DEFAULT 'SOLO' CHECK (match_type IN ('SOLO', 'TEAM', 'FUN')),
    is_ranked           BOOLEAN NOT NULL DEFAULT TRUE,
    status              VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALIDATED', 'CANCELLED')),
    player1_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    player1_teammate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    player2_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    player2_teammate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    score_player1       INT DEFAULT 0,
    score_player2       INT DEFAULT 0,
    gamelles_player1    INT DEFAULT 0,
    gamelles_player2    INT DEFAULT 0,
    demis_player1       INT DEFAULT 0,
    demis_player2       INT DEFAULT 0,
    elo_solo_p1_before  INT DEFAULT 1000,
    elo_solo_p1_after   INT DEFAULT 1000,
    elo_solo_p2_before  INT DEFAULT 1000,
    elo_solo_p2_after   INT DEFAULT 1000,
    elo_team_p1_before  INT DEFAULT 1000,
    elo_team_p1_after   INT DEFAULT 1000,
    elo_team_p1tm_before INT DEFAULT 1000,
    elo_team_p1tm_after  INT DEFAULT 1000,
    elo_team_p2_before  INT DEFAULT 1000,
    elo_team_p2_after   INT DEFAULT 1000,
    elo_team_p2tm_before INT DEFAULT 1000,
    elo_team_p2tm_after  INT DEFAULT 1000,
    played_at           TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE season_rewards (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id      UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    player_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ranking_type   VARCHAR(5) NOT NULL CHECK (ranking_type IN ('SOLO', 'TEAM')),
    tier           VARCHAR(5) NOT NULL CHECK (tier IN ('TOP1', 'TOP3', 'TOP10')),
    tokens_awarded INTEGER NOT NULL CHECK (tokens_awarded >= 0),
    elo_at_end     INTEGER NOT NULL,
    rank_at_end    INTEGER NOT NULL CHECK (rank_at_end > 0),
    awarded_at     TIMESTAMP DEFAULT NOW(),
    UNIQUE (season_id, player_id, ranking_type)
);

CREATE TABLE season_stats (
    id            UUID PRIMARY KEY,
    user_id       UUID REFERENCES users(id),
    season_id     UUID REFERENCES seasons(id),
    total_matches INT DEFAULT 0,
    total_wins    INT DEFAULT 0,
    total_losses  INT DEFAULT 0,
    total_gamelles INT DEFAULT 0,
    total_demis   INT DEFAULT 0,
    elo_solo      INT DEFAULT 1000,
    elo_team      INT DEFAULT 1000,
    updated_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, season_id)
);

CREATE TABLE rankings (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID REFERENCES users(id),
    season_id  UUID REFERENCES seasons(id),
    scope      VARCHAR(20),
    mode       VARCHAR(10) CHECK (mode IN ('SOLO', 'TEAM')),
    score      INT DEFAULT 0,
    wins       INT DEFAULT 0,
    losses     INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, season_id, mode, scope)
);

CREATE TABLE ranking_history (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID REFERENCES users(id),
    match_id     UUID REFERENCES matches(id),
    season_id    UUID REFERENCES seasons(id),
    mode         VARCHAR(10),
    scope        VARCHAR(10),
    score_before INT,
    score_after  INT,
    score_delta  INT,
    recorded_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE reservations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_type          VARCHAR(10) DEFAULT 'SOLO' CHECK (match_type IN ('SOLO', 'TEAM', 'FUN')),
    is_ranked           BOOLEAN DEFAULT TRUE,
    status              VARCHAR(15) DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'DONE', 'CANCELLED')),
    player1_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    player1_teammate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    player2_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    player2_teammate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    match_id            UUID REFERENCES matches(id) ON DELETE SET NULL,
    started_at          TIMESTAMP DEFAULT NOW(),
    ended_at            TIMESTAMP,
    created_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE queue (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_type          VARCHAR(10) DEFAULT 'SOLO' CHECK (match_type IN ('SOLO', 'TEAM', 'FUN')),
    is_ranked           BOOLEAN DEFAULT TRUE,
    status              VARCHAR(15) DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'CONFIRMED', 'DONE', 'CANCELLED')),
    player1_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    player1_teammate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    player2_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    player2_teammate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at           TIMESTAMP DEFAULT NOW()
);

CREATE TABLE wallet_transactions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
    type         VARCHAR(20) CHECK (type IN ('bet', 'win', 'deposit', 'refund')),
    amount       INTEGER NOT NULL,
    reference_id UUID,
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE bets (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID REFERENCES users(id),
    match_id         UUID REFERENCES matches(id),
    reservation_id   UUID REFERENCES reservations(id),
    amount           INTEGER NOT NULL CHECK (amount > 0),
    predicted_winner UUID REFERENCES users(id),
    result           VARCHAR(10) CHECK (result IN ('won', 'lost', 'refunded')),
    payout           INTEGER,
    created_at       TIMESTAMP DEFAULT NOW(),
    odds             NUMERIC(5,2) NOT NULL CHECK (odds >= 1.00)
);

CREATE TABLE tournaments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    format           VARCHAR(20) DEFAULT 'SINGLE_ELIMINATION' CHECK (format IN ('SINGLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS')),
    team_size        INTEGER DEFAULT 2 CHECK (team_size IN (1, 2)),
    start_date  TIMESTAMP NOT NULL,
    deadline    TIMESTAMP,
    prize       VARCHAR(200) NOT NULL DEFAULT '',
    status      VARCHAR(15) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'ONGOING', 'DONE', 'CANCELLED')),
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tournament_registrations (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player1_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player2_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    registered_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (tournament_id, player1_id)
);

CREATE TABLE tournament_teams (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id   UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL UNIQUE REFERENCES tournament_registrations(id) ON DELETE CASCADE,
    player1_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player2_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    seed            INTEGER NOT NULL CHECK (seed > 0),
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (tournament_id, seed),
    UNIQUE (tournament_id, player1_id),
    UNIQUE (tournament_id, player2_id)
);

CREATE TABLE tournament_matches (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id    UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number     INTEGER NOT NULL CHECK (round_number > 0),
    bracket_position INTEGER NOT NULL CHECK (bracket_position > 0),
    team1_id         UUID REFERENCES tournament_teams(id) ON DELETE SET NULL,
    team2_id         UUID REFERENCES tournament_teams(id) ON DELETE SET NULL,
    winner_id        UUID REFERENCES tournament_teams(id) ON DELETE SET NULL,
    score_team1      INTEGER CHECK (score_team1 >= 0),
    score_team2      INTEGER CHECK (score_team2 >= 0),
    status           VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE')),
    queue_entry_id   UUID UNIQUE REFERENCES queue(id) ON DELETE SET NULL,
    swiss_round      INTEGER,
    is_bye           BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    UNIQUE (tournament_id, round_number, bracket_position)
);

CREATE TABLE tournament_swiss_standings (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id       UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
    wins          INTEGER NOT NULL DEFAULT 0,
    losses        INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tournament_id, team_id)
);

CREATE TABLE tournament_round_robin_standings (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id       UUID NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
    wins          INTEGER NOT NULL DEFAULT 0,
    losses        INTEGER NOT NULL DEFAULT 0,
    points        INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tournament_id, team_id)
);

CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    avatar      VARCHAR(255) NULL,
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    player_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'MEMBER')),
    joined_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, player_id)
);

CREATE TABLE django_content_type (
    id        SERIAL PRIMARY KEY,
    app_label VARCHAR(100) NOT NULL,
    model     VARCHAR(100) NOT NULL,
    UNIQUE (app_label, model)
);

CREATE TABLE auth_permission (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    content_type_id INTEGER NOT NULL REFERENCES django_content_type(id) ON DELETE CASCADE,
    codename        VARCHAR(100) NOT NULL,
    UNIQUE (content_type_id, codename)
);

CREATE TABLE auth_group (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE
);

CREATE TABLE auth_group_permissions (
    id            SERIAL PRIMARY KEY,
    group_id      INTEGER NOT NULL REFERENCES auth_group(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES auth_permission(id) ON DELETE CASCADE,
    UNIQUE (group_id, permission_id)
);

CREATE TABLE django_admin_log (
    id              SERIAL PRIMARY KEY,
    action_time     TIMESTAMP WITH TIME ZONE NOT NULL,
    object_id       TEXT NULL,
    object_repr     VARCHAR(200) NOT NULL,
    action_flag     SMALLINT NOT NULL CHECK (action_flag > 0),
    change_message  TEXT NOT NULL,
    content_type_id INTEGER NULL REFERENCES django_content_type(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE django_session (
    session_key  VARCHAR(40) PRIMARY KEY,
    session_data TEXT NOT NULL,
    expire_date  TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE django_migrations (
    id      SERIAL PRIMARY KEY,
    app     VARCHAR(255) NOT NULL,
    name    VARCHAR(255) NOT NULL,
    applied TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE public_api_apikey (
    id                 SERIAL PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    key                VARCHAR(64) NOT NULL UNIQUE,
    owner_id           UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    is_full_access     BOOLEAN NOT NULL DEFAULT FALSE,
    requests_this_hour INTEGER NOT NULL DEFAULT 0,
    rate_limit         INTEGER NOT NULL DEFAULT 200,
    last_request_at    TIMESTAMP WITH TIME ZONE NULL,
    expires_at         TIMESTAMP WITH TIME ZONE NULL,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO django_migrations (app, name, applied) VALUES
('contenttypes', '0001_initial', NOW()),
('contenttypes', '0002_remove_content_type_name', NOW()),
('admin', '0001_initial', NOW()),
('admin', '0002_logentry_remove_auto_add', NOW()),
('admin', '0003_logentry_add_action_flag_choices', NOW()),
('auth', '0001_initial', NOW()),
('auth', '0002_alter_permission_name_max_length', NOW()),
('auth', '0003_alter_user_email_max_length', NOW()),
('auth', '0004_alter_user_username_opts', NOW()),
('auth', '0005_alter_user_last_login_null', NOW()),
('auth', '0006_require_contenttypes_0002', NOW()),
('auth', '0007_alter_validators_add_error_messages', NOW()),
('auth', '0008_alter_user_username_max_length', NOW()),
('auth', '0009_alter_user_last_name_max_length', NOW()),
('auth', '0010_alter_group_name_max_length', NOW()),
('auth', '0011_update_proxy_permissions', NOW()),
('auth', '0012_alter_user_first_name_max_length', NOW()),
('sessions', '0001_initial', NOW());

CREATE OR REPLACE FUNCTION check_no_self_bet()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM reservations
        WHERE id = NEW.reservation_id
          AND NEW.user_id IN (player1_id, player1_teammate_id, player2_id, player2_teammate_id)
    ) THEN
        RAISE EXCEPTION 'Un joueur ne peut pas parier sur son propre match.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_no_self_bet
BEFORE INSERT ON bets
FOR EACH ROW EXECUTE FUNCTION check_no_self_bet();

CREATE OR REPLACE FUNCTION check_fun_not_ranked()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.match_type = 'FUN' AND NEW.is_ranked = TRUE THEN
        RAISE EXCEPTION 'Un match FUN ne peut pas être classé.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fun_not_ranked
BEFORE INSERT OR UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION check_fun_not_ranked();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tournament_matches_updated_at
BEFORE UPDATE ON tournament_matches
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Achievements ──────────────────────────────────────────────────────────
CREATE TABLE achievements (
    id          VARCHAR(40) PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon        VARCHAR(10) NOT NULL DEFAULT '🏆',
    category    VARCHAR(20) NOT NULL CHECK (category IN ('GAMELLES', 'DEMIS', 'MATCH', 'SERIE', 'ELO', 'SAISON', 'EQUIPE', 'ECONOMIE')),
    sort_order  INT NOT NULL DEFAULT 0
);

CREATE TABLE user_achievements (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(40) NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    unlocked_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);

-- Seed achievements
INSERT INTO achievements (id, name, description, icon, category, sort_order) VALUES
-- Gamelles & Demis
('first_gamelle',    'Première gamelle',    'Marquer 1 gamelle',              '🪣', 'GAMELLES', 1),
('gamelleur',        'Gamelleur',           'Marquer 5 gamelles au total',    '🪣', 'GAMELLES', 2),
('roi_gamelle',      'Roi de la gamelle',   'Marquer 20 gamelles au total',   '👑', 'GAMELLES', 3),
('first_demi',       'Premier demi',        'Marquer 1 demi',                 '🍺', 'DEMIS',    4),
('barman',           'Barman',              'Marquer 10 demis au total',      '🍺', 'DEMIS',    5),
('patron_bar',       'Patron du bar',       'Marquer 50 demis au total',      '🍻', 'DEMIS',    6),
-- Scores & Matchs
('bapteme',          'Baptême du feu',      'Jouer son tout premier match',   '🔥', 'MATCH',    10),
('first_win',        'Première victoire',   'Gagner un match',                '✅', 'MATCH',    11),
('ecrasante',        'Victoire écrasante',  'Gagner 10-0',                    '💀', 'MATCH',    12),
('serre',            'Match serré',         'Gagner 10-9',                    '😰', 'MATCH',    13),
('muraille',         'Muraille',            'Gagner sans encaisser (hors 10-0)', '🧱', 'MATCH', 14),
('comeback',         'Comeback',            'Gagner alors que l''adversaire avait 7+ points', '🔄', 'MATCH', 15),
('wins_10',          '10 victoires',        'Gagner 10 matchs',               '⭐', 'MATCH',    16),
('wins_50',          '50 victoires',        'Gagner 50 matchs',               '🌟', 'MATCH',    17),
('wins_100',         '100 victoires',       'Gagner 100 matchs',              '💫', 'MATCH',    18),
('matches_10',       'Joueur régulier',     'Jouer 10 matchs',                '🎮', 'MATCH',    19),
('matches_50',       'Vétéran',             'Jouer 50 matchs',                '🎖️', 'MATCH',    20),
('matches_100',      'Légende',             'Jouer 100 matchs',               '🏅', 'MATCH',    21),
-- Séries
('serie_3',          'En feu',              '3 victoires d''affilée',         '🔥', 'SERIE',    30),
('serie_5',          'Inarrêtable',         '5 victoires d''affilée',         '⚡', 'SERIE',    31),
('serie_10',         'Machine',             '10 victoires d''affilée',        '🤖', 'SERIE',    32),
('resilient',        'Résilient',           'Gagner après 5 défaites d''affilée', '💪', 'SERIE', 33),
-- ELO
('elo_1100',         'Grimpeur',            'Atteindre 1100 ELO',             '📈', 'ELO',      40),
('elo_1200',         'Compétiteur',         'Atteindre 1200 ELO',             '📊', 'ELO',      41),
('elo_1500',         'Élite',               'Atteindre 1500 ELO',             '🏆', 'ELO',      42),
('elo_2000',         'Légende vivante',     'Atteindre 2000 ELO',             '👑', 'ELO',      43),
-- Saisons
('first_season',     'Première saison',     'Participer à une saison classée', '📅', 'SAISON',  50),
('top3_season',      'Top 3',               'Finir dans le top 3 d''une saison', '🥉', 'SAISON', 51),
('champion_season',  'Champion',            'Finir #1 d''une saison',         '🥇', 'SAISON',   52),
('multi_champion',   'Multi-champion',      'Finir #1 dans 3 saisons',        '👑', 'SAISON',   53),
-- 2v2
('first_2v2',        'Coéquipier',          'Jouer un match en 2v2',          '🤝', 'EQUIPE',   60),
('duo_choc',         'Duo de choc',         'Gagner 10 matchs en 2v2',        '💪', 'EQUIPE',   61),
('capitaine',        'Capitaine',           'Gagner 25 matchs en 2v2',        '🫡', 'EQUIPE',   62),
-- Économie
('first_bet',        'Premier pari',        'Placer un pari',                 '🎰', 'ECONOMIE', 70),
('jackpot',          'Jackpot',             'Gagner un pari de 1000+ jetons', '💰', 'ECONOMIE', 71),
('millionnaire',     'Millionnaire',        'Atteindre 50 000 jetons',        '🤑', 'ECONOMIE', 72);

CREATE INDEX idx_django_session_expire      ON django_session(expire_date);
CREATE INDEX idx_rankings_scope             ON rankings(scope, mode, score DESC);
CREATE INDEX idx_history_user               ON ranking_history(user_id, recorded_at DESC);
CREATE INDEX idx_bets_match                 ON bets(match_id);
CREATE INDEX idx_users_oauth                ON users(oauth_42_id);
CREATE INDEX idx_queue_status               ON queue(status, joined_at);
CREATE INDEX idx_matches_players            ON matches(player1_id, player2_id);
CREATE INDEX idx_reservations_status        ON reservations(status);
CREATE INDEX idx_tournaments_status         ON tournaments(status);
CREATE INDEX idx_registrations_tournament   ON tournament_registrations(tournament_id);
CREATE INDEX idx_teams_tournament           ON tournament_teams(tournament_id, seed);
CREATE INDEX idx_bracket_tournament_round   ON tournament_matches(tournament_id, round_number);
CREATE INDEX idx_bracket_status             ON tournament_matches(status);
CREATE INDEX idx_season_rewards_season      ON season_rewards(season_id);
CREATE INDEX idx_season_rewards_player      ON season_rewards(player_id);
CREATE INDEX idx_org_members_player         ON organization_members(player_id);
CREATE INDEX idx_org_members_org            ON organization_members(organization_id);

-- ── Public API Keys ───────────────────────────────────────────────────────
CREATE TABLE api_keys (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    key             VARCHAR(64) NOT NULL UNIQUE,
    owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_full_access  BOOLEAN NOT NULL DEFAULT FALSE,
    requests_this_hour INT NOT NULL DEFAULT 0,
    rate_limit      INT NOT NULL DEFAULT 200,
    last_request_at TIMESTAMPTZ NULL,
    expires_at      TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_owner ON api_keys(owner_id);
CREATE INDEX idx_api_keys_key   ON api_keys(key);

