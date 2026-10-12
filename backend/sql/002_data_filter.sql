-- 002: คัดกรองข้อมูลดิบในระบบ (แทนการกรองใน Excel)
--  - orders.excl_reason  : เหตุผลที่ตัดแถวนี้ออกจากการคำนวณ KPI (NULL = ใช้ได้)
--                          LOCATION | NO_DISPENSE | NO_ADMIN | NEG_TIME | OVER_LIMIT
--  - app_settings        : เกณฑ์การกรอง (ชั่วโมงสูงสุด order→nurse, ward ที่ตัดออก)
--  - drug_exclusions     : ยาที่ user เลือกตัดออกจากการคำนวณ KPI (กำหนดเป็นรายเดือน หรือ '*' = ทุกเดือน)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS excl_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_excl ON orders(excl_reason);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES
  ('max_order_nurse_hours', '8'::jsonb),
  ('excluded_locations',    '["airport","rawai","khaolak"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS drug_exclusions (
  month_key  TEXT NOT NULL,                 -- 'YYYY-MM' หรือ '*' (ทุกเดือน)
  item_code  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month_key, item_code)
);
CREATE INDEX IF NOT EXISTS idx_drug_excl_code ON drug_exclusions(item_code);

-- สรุปผลคัดกรองของแต่ละ batch (ใช้ได้ / ตัดออกเพราะอะไร / ไม่มีเวลาพยาบาลให้ยาแยก ward)
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS summary JSONB;
