CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users
(
    id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(8) UNIQUE NOT NULL,
    email   VARCHAR(255) UNIQUE NOT NULL,
    password TEXT,
    role    VARCHAR(15) DEFAULT 'user' check( role IN ('user', 'bocalien', 'piscineux', 'stud', 'bde', 'admin', 'alumnni')),
    is_2fa_enabled BOOLEAN DEFAULT FALSE,
    totp_secret TEXT,
    oauth_42_id TEXT UNIQUE,
    avatar_url TEXT,
    last_login TIMESTAMP,
    gdpr_deleted  BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT FALSE,
    wallet_tokens INT DEFAULT 10,
    elo_solo INT DEFAULT 1000,
    elo_team INT DEFAULT 1000,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stats
(
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    total_matches INT DEFAULT 0,
    total_wins INT DEFAULT 0,
    total_losses INT DEFAULT 0,
    total_gamelles INT DEFAULT 0,
    total_demis INT DEFAULT 0,
    elo_solo INT DEFAULT 1000,
    elo_team INT DEFAULT 1000,
    series_wins INT DEFAULT 0,
    series_losses INT DEFAULT 0,
    total_bets INT DEFAULT 0,
    total_wins_bets INT DEFAULT 0,
    total_losses_bets INT DEFAULT 0,
    total_amount_won INT DEFAULT 0,
    total_amount_lost INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE seasons
(
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100) NOT NULL,
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    status              VARCHAR(10) NOT NULL DEFAULT 'UPCOMING'
                        CHECK (status IN ('UPCOMING', 'ACTIVE', 'FINISHED')),
    rewards_distributed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE matches (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id  UUID REFERENCES seasons(id),
    match_type VARCHAR(10) NOT NULL DEFAULT 'SOLO'
               CHECK (match_type IN ('SOLO', 'TEAM', 'FUN')),
    is_ranked  BOOLEAN NOT NULL DEFAULT TRUE,
    status     VARCHAR(10) NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING', 'VALIDATED', 'CANCELLED')),
    player1_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    player1_teammate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    player2_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    player2_teammate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    score_player1 INT DEFAULT 0,
    score_player2 INT DEFAULT 0,
    gamelles_player1 INT DEFAULT 0,
    gamelles_player2 INT DEFAULT 0,
    demis_player1 INT DEFAULT 0,
    demis_player2 INT DEFAULT 0,
    elo_solo_p1_before INT DEFAULT 1000,
    elo_solo_p1_after  INT DEFAULT 1000,
    elo_solo_p2_before INT DEFAULT 1000,
    elo_solo_p2_after  INT DEFAULT 1000,
    elo_team_p1_before    INT DEFAULT 1000,
    elo_team_p1_after     INT DEFAULT 1000,
    elo_team_p1tm_before  INT DEFAULT 1000,
    elo_team_p1tm_after   INT DEFAULT 1000,
    elo_team_p2_before    INT DEFAULT 1000,
    elo_team_p2_after     INT DEFAULT 1000,
    elo_team_p2tm_before  INT DEFAULT 1000,
    elo_team_p2tm_after   INT DEFAULT 1000,
    played_at  TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE season_rewards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id       UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    player_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ranking_type    VARCHAR(5) NOT NULL CHECK (ranking_type IN ('SOLO', 'TEAM')),
    tier            VARCHAR(5) NOT NULL CHECK (tier IN ('TOP1', 'TOP3', 'TOP10')),
    tokens_awarded  INTEGER NOT NULL CHECK (tokens_awarded >= 0),
    elo_at_end      INTEGER NOT NULL,
    rank_at_end     INTEGER NOT NULL CHECK (rank_at_end > 0),
    awarded_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (season_id, player_id, ranking_type)
);

CREATE TABLE rankings (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID REFERENCES users(id),
    season_id  UUID REFERENCES seasons(id),
    mode       VARCHAR(10) CHECK (mode IN ('SOLO', 'TEAM')),
    scope      VARCHAR(10) CHECK (scope IN ('season', 'global')),
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
    match_type          VARCHAR(10) DEFAULT 'SOLO'
                        CHECK (match_type IN ('SOLO', 'TEAM', 'FUN')),
    is_ranked           BOOLEAN DEFAULT TRUE,
    status              VARCHAR(15) DEFAULT 'IN_PROGRESS'
                        CHECK (status IN ('IN_PROGRESS', 'DONE', 'CANCELLED')),
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
    match_type          VARCHAR(10) DEFAULT 'SOLO'
                        CHECK (match_type IN ('SOLO', 'TEAM', 'FUN')),
    is_ranked           BOOLEAN DEFAULT TRUE,
    status              VARCHAR(15) DEFAULT 'WAITING'
                        CHECK (status IN ('WAITING', 'CONFIRMED', 'DONE', 'CANCELLED')),
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
    reservation_id     UUID REFERENCES reservations(id),
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
    start_date  TIMESTAMP NOT NULL,
    deadline    TIMESTAMP,
    max_players INTEGER NOT NULL DEFAULT 16
                CHECK (max_players IN (16, 32)),
    prize       VARCHAR(200) NOT NULL DEFAULT '',
    status      VARCHAR(15) NOT NULL DEFAULT 'OPEN'
                CHECK (status IN ('OPEN', 'ONGOING', 'DONE', 'CANCELLED')),
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
    player2_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    status           VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'DONE')),
    queue_entry_id   UUID UNIQUE REFERENCES queue(id) ON DELETE SET NULL,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    UNIQUE (tournament_id, round_number, bracket_position)
);

CREATE OR REPLACE FUNCTION check_no_self_bet()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM reservations
        WHERE match_id = NEW.match_id
          AND (
              NEW.user_id = player1_id
              OR NEW.user_id = player1_teammate_id
              OR NEW.user_id = player2_id
              OR NEW.user_id = player2_teammate_id
          )
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

CREATE INDEX idx_rankings_scope   ON rankings(scope, mode, score DESC);
CREATE INDEX idx_history_user     ON ranking_history(user_id, recorded_at DESC);
CREATE INDEX idx_bets_match       ON bets(match_id);
CREATE INDEX idx_users_oauth      ON users(oauth_42_id);
CREATE INDEX idx_queue_status      ON queue(status, joined_at);
CREATE INDEX idx_matches_players   ON matches(player1_id, player2_id);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_tournaments_status        ON tournaments(status);
CREATE INDEX idx_registrations_tournament  ON tournament_registrations(tournament_id);
CREATE INDEX idx_teams_tournament          ON tournament_teams(tournament_id, seed);
CREATE INDEX idx_bracket_tournament_round  ON tournament_matches(tournament_id, round_number);
CREATE INDEX idx_bracket_status            ON tournament_matches(status);
CREATE INDEX idx_season_rewards_season ON season_rewards(season_id);
CREATE INDEX idx_season_rewards_player ON season_rewards(player_id);