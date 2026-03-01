-- TRADING FRAMEWORK — Schema PostgreSQL v2
-- ⚠️  Si ya tenés la BD creada con el schema anterior, recreala:
--       dropdb trading_fw
--       psql postgres -f src/db-setup.sql

CREATE DATABASE trading_fw;
\c trading_fw;

-- Cuentas de trading
CREATE TABLE accounts (
  id          VARCHAR(50) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  balance     DECIMAL(12,2) DEFAULT 0,
  color       VARCHAR(20) DEFAULT '#00d4ff',
  type        VARCHAR(20) DEFAULT 'manual', -- manual | binance | hyperliquid
  api_key     TEXT DEFAULT '',
  api_secret  TEXT DEFAULT '',
  note        TEXT DEFAULT '',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Trades cerrados
-- Columnas alineadas con los campos del app (sin prefijos _id / _usd)
CREATE TABLE trades (
  id          SERIAL PRIMARY KEY,
  local_id    BIGINT UNIQUE,               -- ID del trade en localStorage (para migración sin duplicados)
  bn_order_id VARCHAR(50),                 -- orderId de Binance (para reconciliación, UNIQUE nullable)
  date        DATE,
  asset       VARCHAR(20) NOT NULL,
  type        VARCHAR(10) NOT NULL,        -- Long | Short
  account     VARCHAR(50),                 -- account id (sin FK para flexibilidad)
  entry       DECIMAL(20,6),
  sl          DECIMAL(20,6),
  tp          DECIMAL(20,6),
  leverage    INTEGER DEFAULT 1,
  order_type  VARCHAR(20) DEFAULT 'Market', -- Market | Limit
  outcome     VARCHAR(20),                 -- WIN | LOSS | BE | Partial L | Partial W
  pnl         DECIMAL(12,2),
  pnl_r       DECIMAL(8,4),
  source      VARCHAR(50),                 -- YO | Chroma | Silla | Mizer | etc
  reasoning   TEXT,
  anomaly     BOOLEAN DEFAULT FALSE,
  deleted_at  TIMESTAMP DEFAULT NULL,      -- soft delete: fecha de borrado lógico
  closed_at   TIMESTAMP DEFAULT NOW(),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Posiciones abiertas
CREATE TABLE open_positions (
  id            VARCHAR(50) PRIMARY KEY,
  asset         VARCHAR(20) NOT NULL,
  type          VARCHAR(10) NOT NULL,
  account       VARCHAR(50),
  entry         DECIMAL(20,6),
  sl            DECIMAL(20,6),
  tp            DECIMAL(20,6),
  size          DECIMAL(20,6),            -- tamaño real de posición (ej: 2000 en Quantfury)
  qty           DECIMAL(20,6),            -- qty en contratos (Binance/HL)
  leverage      INTEGER DEFAULT 1,
  margin        DECIMAL(12,2),
  upnl          DECIMAL(12,2) DEFAULT 0,
  order_type    VARCHAR(20) DEFAULT 'Market',
  source        VARCHAR(50),
  reasoning     TEXT,
  bn_order_id   VARCHAR(50),
  bn_pos_key    VARCHAR(100),
  bn_status     VARCHAR(20),
  opened_at     DATE DEFAULT CURRENT_DATE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Órdenes paper (pendientes / Chroma tracking)
CREATE TABLE paper_orders (
  id          VARCHAR(50) PRIMARY KEY,
  asset       VARCHAR(20) NOT NULL,
  type        VARCHAR(10) NOT NULL,
  account     VARCHAR(50),
  entry       DECIMAL(20,6),
  sl          DECIMAL(20,6),
  tp          DECIMAL(20,6),
  leverage    INTEGER DEFAULT 1,
  order_type  VARCHAR(20) DEFAULT 'Limit',
  status      VARCHAR(20) DEFAULT 'pending', -- pending | active | closed | cancelled
  source      VARCHAR(50),
  reasoning   TEXT,
  chroma_post TEXT,
  outcome     VARCHAR(20),
  pnl         DECIMAL(12,2),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Watchlist
CREATE TABLE watchlist (
  id         SERIAL PRIMARY KEY,
  symbol     VARCHAR(20) NOT NULL UNIQUE,
  source     VARCHAR(30) DEFAULT 'auto', -- auto | binance | hyperliquid | coingecko | binance-futures | commodity
  created_at TIMESTAMP DEFAULT NOW()
);

-- Configuración general (key-value)
CREATE TABLE config (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO config (key, value) VALUES
  ('r_values',        '{"quantfury": 2.65, "binance": 35, "hyperliquid": 35}'),
  ('leverage_opts',   '[5,10,15,20,25,50,75,100,125,150,200]'),
  ('clp_source',      'dolarapi'),
  ('monthly_income',  '2800'),
  ('personal_reserve','1300');

-- Índices
CREATE INDEX idx_trades_date       ON trades(date);
CREATE INDEX idx_trades_account    ON trades(account);
CREATE INDEX idx_trades_outcome    ON trades(outcome);
CREATE INDEX idx_trades_deleted_at ON trades(deleted_at);
CREATE UNIQUE INDEX idx_trades_bn_order_id ON trades(bn_order_id) WHERE bn_order_id IS NOT NULL;
CREATE INDEX idx_paper_status      ON paper_orders(status);

-- Vista: performance por cuenta
CREATE VIEW v_performance AS
  SELECT
    account,
    COUNT(*) AS total_trades,
    COUNT(*) FILTER (WHERE outcome = 'WIN') AS wins,
    COUNT(*) FILTER (WHERE outcome = 'LOSS') AS losses,
    COUNT(*) FILTER (WHERE outcome LIKE 'Partial%') AS partials,
    SUM(pnl)   AS total_pnl,
    SUM(pnl_r) AS total_pnl_r,
    ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'WIN') / NULLIF(COUNT(*),0), 1) AS win_rate_pct,
    AVG(pnl_r) FILTER (WHERE pnl_r > 0) AS avg_win_r,
    AVG(pnl_r) FILTER (WHERE pnl_r < 0) AS avg_loss_r
  FROM trades
  GROUP BY account;

\echo 'Schema v2 creado correctamente en trading_fw'
