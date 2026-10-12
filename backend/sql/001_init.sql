CREATE TABLE IF NOT EXISTS subgroups (
  id            SERIAL PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  source_column TEXT,                       -- ชื่อคอลัมน์ในบัญชียา ที่ใช้ map อัตโนมัติ
  color         TEXT DEFAULT '#2563eb',
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT NOT NULL DEFAULT 100,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drug_master (
  item_code    TEXT PRIMARY KEY,
  item_name    TEXT,
  generic_name TEXT,
  unit         TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subgroup_items (
  subgroup_id INT  NOT NULL REFERENCES subgroups(id) ON DELETE CASCADE,
  item_code   TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'manual',   -- manual | import
  PRIMARY KEY (subgroup_id, item_code)
);
CREATE INDEX IF NOT EXISTS idx_subgroup_items_code ON subgroup_items(item_code);

CREATE TABLE IF NOT EXISTS import_batches (
  id            SERIAL PRIMARY KEY,
  file_name     TEXT,
  sheet_name    TEXT,
  mode          TEXT,
  total_rows    INT DEFAULT 0,
  imported      INT DEFAULT 0,
  updated       INT DEFAULT 0,
  skipped       INT DEFAULT 0,
  errors        INT DEFAULT 0,
  anomalies     INT DEFAULT 0,
  mapping       JSONB,
  error_samples JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id              BIGSERIAL PRIMARY KEY,
  import_id       INT REFERENCES import_batches(id) ON DELETE CASCADE,
  dedupe_key      TEXT UNIQUE NOT NULL,
  hn              TEXT,
  vn_an           TEXT,
  patient_name    TEXT,
  item_code       TEXT,
  item_name       TEXT,
  pn              TEXT,
  order_by        TEXT,
  ward            TEXT,
  room            TEXT,
  high_alert_flag BOOLEAN DEFAULT FALSE,
  total_src       TEXT,
  t_order         TIMESTAMP,
  t_prepare       TIMESTAMP,
  t_verify        TIMESTAMP,
  t_dispense      TIMESTAMP,
  t_nurse         TIMESTAMP,
  t_ipd           TIMESTAMP,
  order_date      DATE,
  d_order_dispense  INT,
  d_order_prepare   INT,
  d_prepare_verify  INT,
  d_verify_dispense INT,
  d_order_nurse     INT,
  d_total           INT,
  d_dispense_ipd    INT,
  anomaly         BOOLEAN NOT NULL DEFAULT FALSE,
  anomaly_reasons TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_item ON orders(item_code);
CREATE INDEX IF NOT EXISTS idx_orders_ward ON orders(ward);
CREATE INDEX IF NOT EXISTS idx_orders_import ON orders(import_id);

CREATE TABLE IF NOT EXISTS kpi_definitions (
  id               SERIAL PRIMARY KEY,
  code             TEXT UNIQUE,
  name             TEXT NOT NULL,
  description      TEXT,
  step             TEXT NOT NULL,                   -- key ของขั้นตอน (ดู lib/steps.js)
  operator         TEXT NOT NULL DEFAULT '<=',      -- <= < >= >
  target           NUMERIC NOT NULL,
  unit             TEXT NOT NULL DEFAULT 'minutes', -- minutes | seconds
  floor_to_minute  BOOLEAN NOT NULL DEFAULT TRUE,   -- ตัดวินาทีทิ้งก่อนเทียบ target (แบบ Excel เดิม)
  pass_rate_goal   NUMERIC DEFAULT 90,              -- เป้าหมาย % ผ่าน KPI
  subgroup_id      INT REFERENCES subgroups(id) ON DELETE SET NULL,
  is_primary       BOOLEAN NOT NULL DEFAULT FALSE,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INT NOT NULL DEFAULT 100
);

INSERT INTO subgroups (code, name, source_column, color, is_system, sort_order) VALUES
  ('HAD',     'High Alert Drug (HAD)',       'High Alert Drug',             '#dc2626', TRUE, 10),
  ('VITAL',   'Vital Drug',                  'Vital Drug',                  '#7c3aed', TRUE, 20),
  ('VACCINE', 'Vaccine',                     'Vaccine',                     '#059669', TRUE, 30),
  ('PVI',     'Phlebitis/Vesicant/Irritant', 'Phlebitis/vesicant/Irritant', '#d97706', TRUE, 40)
ON CONFLICT (code) DO NOTHING;

INSERT INTO kpi_definitions (code, name, description, step, operator, target, is_primary, sort_order) VALUES
  ('PTTC',     'PTTC / Total Process', 'Doctor → Nurse ไม่เกิน 30 นาที',    'order_nurse',    '<=', 30, TRUE,  10),
  ('PHARMACY', 'Pharmacy Process',     'Doctor → Pharmacy ไม่เกิน 15 นาที', 'order_dispense', '<=', 15, FALSE, 20)
ON CONFLICT (code) DO NOTHING;
