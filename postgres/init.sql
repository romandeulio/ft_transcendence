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

CREATE TABLE seasons
(
    id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name    VARCHAR(15) NOT NULL,
    start_date   DATE NOT NULL,
    end_date     DATE
);

CREATE TABLE matches
(
    id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id UUID REFERENCES seasons(id),
    mode      VARCHAR(10) CHECK (mode IN ('1v1', '2v2', 'Fun')),
    status    VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('cancelled', 'finished', 'completed', 'draft')),
    played_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE match_participants (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id     UUID REFERENCES matches(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES users(id),
    team         SMALLINT CHECK (team IN (1, 2)),
    result       VARCHAR(10) CHECK (result IN ('win', 'loss')),
    score_before INT DEFAULT 0,
    score_after  INT DEFAULT 0,
    score_delta  INT DEFAULT 0
);

CREATE TABLE rankings (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id   UUID REFERENCES users(id),
    season_id UUID REFERENCES seasons(id),
    mode      VARCHAR(10),
    scope     VARCHAR(10) CHECK (scope IN ('season', 'annual', 'global')),
    score     INT DEFAULT 0,
    wins      INT DEFAULT 0,
    losses    INT DEFAULT 0,
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

CREATE TABLE queue (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id   UUID REFERENCES users(id),
    slot_time TIMESTAMP NOT NULL,
    status    VARCHAR(20) DEFAULT 'waiting'
              CHECK (status IN ('waiting', 'confirmed', 'cancelled'))
);

CREATE TABLE wallets (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID UNIQUE REFERENCES users(id),
    balance    INTEGER NOT NULL DEFAULT 100 CHECK (balance >= 0)
);

CREATE TABLE bets (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID REFERENCES users(id),
    match_id         UUID REFERENCES matches(id),
    amount           INTEGER NOT NULL CHECK (amount > 0),
    predicted_winner UUID REFERENCES users(id),
    result           VARCHAR(10) CHECK (result IN ('won', 'lost', 'refunded')),
    payout           INTEGER
);

CREATE OR REPLACE FUNCTION check_no_self_bet()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM match_participants
        WHERE match_id = NEW.match_id
        AND user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'Un joueur ne peut pas parier sur son propre match.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_no_self_bet
BEFORE INSERT ON bets
FOR EACH ROW EXECUTE FUNCTION check_no_self_bet();

CREATE INDEX idx_rankings_scope   ON rankings(scope, mode, score DESC);
CREATE INDEX idx_history_user     ON ranking_history(user_id, recorded_at DESC);
CREATE INDEX idx_bets_match       ON bets(match_id);
CREATE INDEX idx_users_oauth      ON users(oauth_42_id);
CREATE INDEX idx_queue_slot_time  ON queue(slot_time, status);