# 📋 Pharmacy Process Time KPI — Database Schema & API Reference

> เอกสารนี้สำหรับทีม IT / ผู้พัฒนา เพื่อใช้ดูโครงสร้างฐานข้อมูลและการเชื่อมต่อระบบ  
> **Base URL**: `http://localhost:4000/api`  
> **Database**: PostgreSQL (Neon)  
> **Content-Type**: `application/json` (ยกเว้น endpoint อัปโหลดไฟล์ใช้ `multipart/form-data`)  
> **Auth**: `Authorization: Bearer <token>` ทุก endpoint ยกเว้น `GET /api/health` และ `POST /api/auth/login`  
> **Dev proxy**: Vite (`localhost:5173`) proxy `/api` ไป `http://localhost:4000` — frontend เรียก `/api/...` แบบ relative

---

## 🗄️ Database Tables

### 1. `orders` — ออเดอร์ยาและเวลาแต่ละขั้นตอน

| Column              | Type         | PK  | Nullable | คำอธิบาย                                               |
|---------------------|--------------|-----|----------|--------------------------------------------------------|
| `id`                | BIGSERIAL    | ✅  | NO       | Auto-increment ID                                      |
| `import_id`         | INT          |     | YES      | FK → `import_batches.id` (ON DELETE CASCADE)            |
| `dedupe_key`        | TEXT         |     | NO       | **UNIQUE** — SHA-1 ของ VN/AN + PN + item_code + เวลาสั่ง (ใช้ค่าก่อน mask; แถวซ้ำในไฟล์เดียวกันต่อท้าย `#n`) |
| `hn`                | TEXT         |     | YES      | Hospital Number (mask ก่อนบันทึก ผ่าน `lib/mask.js`)    |
| `vn_an`             | TEXT         |     | YES      | Visit Number / Admission Number (mask ก่อนบันทึก)       |
| `patient_name`      | TEXT         |     | YES      | ชื่อผู้ป่วย (mask ก่อนบันทึก ผ่าน `lib/mask.js`)         |
| `item_code`         | TEXT         |     | YES      | รหัสยา — **key ที่ใช้ผูกกลุ่มยาและยาที่ตัดออก**          |
| `item_name`         | TEXT         |     | YES      | ชื่อยา (แสดงผลเท่านั้น ไม่ใช้ map)                       |
| `pn`                | TEXT         |     | YES      | ผู้ช่วย / ผู้เตรียมยา (Assistant)                       |
| `order_by`          | TEXT         |     | YES      | แพทย์ผู้สั่ง                                            |
| `ward`              | TEXT         |     | YES      | Ward / Location                                        |
| `room`              | TEXT         |     | YES      | ห้อง                                                   |
| `high_alert_flag`   | BOOLEAN      |     | YES      | เป็น High Alert Drug ตามไฟล์ดิบ (default: false)        |
| `total_src`         | TEXT         |     | YES      | ค่า "เวลารวม" ดั้งเดิมจากไฟล์ (เก็บไว้อ้างอิง)           |
| `t_order`           | TIMESTAMP    |     | YES      | เวลาแพทย์สั่งยา                                         |
| `t_prepare`         | TIMESTAMP    |     | YES      | เวลาผู้ช่วยเตรียมยา                                     |
| `t_verify`          | TIMESTAMP    |     | YES      | เวลาเภสัชกรตรวจยา (ถ้าว่างใช้ `t_dispense` แทน)          |
| `t_dispense`        | TIMESTAMP    |     | YES      | เวลาเภสัชกรจ่ายยา                                       |
| `t_nurse`           | TIMESTAMP    |     | YES      | เวลาพยาบาลให้ยา (Administration)                        |
| `t_ipd`             | TIMESTAMP    |     | YES      | เวลา IPD รับยา                                          |
| `order_date`        | DATE         |     | YES      | วันที่ออเดอร์ (ใช้จัดกลุ่มรายเดือน)                      |
| `d_order_dispense`  | INT          |     | YES      | Order → Dispense (วินาที)                               |
| `d_order_prepare`   | INT          |     | YES      | Order → Prepare (วินาที)                                |
| `d_prepare_verify`  | INT          |     | YES      | Prepare → Verify (วินาที)                               |
| `d_verify_dispense` | INT          |     | YES      | Verify → Dispense (วินาที)                              |
| `d_order_nurse`     | INT          |     | YES      | Order → Nurse give (วินาที)                             |
| `d_total`           | INT          |     | YES      | Total (Order → Nurse) (วินาที)                          |
| `d_dispense_ipd`    | INT          |     | YES      | Dispense → IPD receive (วินาที)                         |
| `anomaly`           | BOOLEAN      |     | NO       | ข้อมูลผิดปกติ (default: false)                           |
| `anomaly_reasons`   | TEXT         |     | YES      | เหตุผล anomaly คั่นด้วย `,` — `NEG:<step>` (ระยะเวลาติดลบ), `OVER24H:<step>` (เกิน 24 ชม.), `BADTS:<field>` (วันเวลารูปแบบผิด) |
| `excl_reason`       | TEXT         |     | YES      | เหตุผลที่ตัดออกจาก KPI (NULL = ใช้ได้) — เพิ่มใน migration 002 |

**Index:** `order_date`, `item_code`, `ward`, `import_id`, `excl_reason`

#### ค่า `excl_reason`

| ค่า           | ความหมาย                                                        |
|---------------|-----------------------------------------------------------------|
| `NULL`        | ใช้คำนวณ KPI ได้                                                |
| `LOCATION`    | อยู่ใน location ที่ตัดออก (`app_settings.excluded_locations`)     |
| `NO_DISPENSE` | ไม่มีเวลาจ่ายยา                                                 |
| `NO_ADMIN`    | ไม่มีเวลาพยาบาลให้ยา                                            |
| `NEG_TIME`    | เวลาย้อนหลัง — `t_dispense < t_order` หรือ `t_nurse < t_order`    |
| `OVER_LIMIT`  | Order → Nurse ≥ `app_settings.max_order_nurse_hours`             |

> ตรวจตามลำดับ `LOCATION` → `NO_DISPENSE` → `NO_ADMIN` → `NEG_TIME` → `OVER_LIMIT` แถวหนึ่งมีเหตุผลเดียว  
> `LOCATION` ตรวจแบบ "ชื่อ ward มีคำนั้นอยู่" (ไม่สนตัวพิมพ์) · `OVER_LIMIT` คือ `t_nurse - t_order >= max_order_nurse_hours × 3600` วินาที  
> ยาที่ผู้ใช้เลือกตัด **ไม่ได้เก็บใน `excl_reason`** — ตัดตอนคำนวณผ่าน `drug_exclusions` (แถวที่ใช้ได้ = `excl_reason IS NULL` และยาไม่ถูกตัดในเดือนนั้น หรือ `*`)

#### Process Steps (ใช้ใน `kpi_definitions.step`)

| key               | คอลัมน์             | จาก → ถึง                 |
|-------------------|---------------------|---------------------------|
| `order_dispense`  | `d_order_dispense`  | `t_order` → `t_dispense`  |
| `order_prepare`   | `d_order_prepare`   | `t_order` → `t_prepare`   |
| `prepare_verify`  | `d_prepare_verify`  | `t_prepare` → `t_verify`  |
| `verify_dispense` | `d_verify_dispense` | `t_verify` → `t_dispense` |
| `order_nurse`     | `d_order_nurse`     | `t_order` → `t_nurse`     |
| `total`           | `d_total`           | `t_order` → `t_nurse`     |
| `dispense_ipd`    | `d_dispense_ipd`    | `t_dispense` → `t_ipd`    |

> **การเก็บระยะเวลา `d_*`:** หน่วยวินาที · ถ้าไม่มีเวลาต้นทาง/ปลายทาง = NULL · ติดลบ = NULL (ไม่ใช้คำนวณ) และติด anomaly · เกิน 24 ชม. (ยกเว้น `total`) เก็บค่าไว้แต่ติด anomaly  
> **KPI pass:** หน่วย `minutes` เทียบ `floor(วินาที/60)` (ถ้า `floor_to_minute`) หรือ `วินาที/60` กับ `target` ด้วย `operator` · แถวที่ไม่มีระยะเวลานับเป็น Missing

---

### 2. `import_batches` — ประวัติการนำเข้าไฟล์

| Column          | Type        | PK  | Nullable | คำอธิบาย                                                 |
|-----------------|-------------|-----|----------|----------------------------------------------------------|
| `id`            | SERIAL      | ✅  | NO       | Auto-increment ID                                        |
| `file_name`     | TEXT        |     | YES      | ชื่อไฟล์ที่อัปโหลด                                        |
| `sheet_name`    | TEXT        |     | YES      | ชื่อ sheet ที่อ่าน                                        |
| `mode`          | TEXT        |     | YES      | โหมดเมื่อพบข้อมูลซ้ำ: `skip` / `overwrite`                |
| `total_rows`    | INT         |     | YES      | จำนวนแถวทั้งหมดในไฟล์ (default: 0)                        |
| `imported`      | INT         |     | YES      | จำนวนที่นำเข้าใหม่ (default: 0)                           |
| `updated`       | INT         |     | YES      | จำนวนที่อัปเดต (default: 0)                               |
| `skipped`       | INT         |     | YES      | จำนวนที่ข้าม (default: 0)                                 |
| `errors`        | INT         |     | YES      | จำนวนที่ error (default: 0)                               |
| `anomalies`     | INT         |     | YES      | จำนวนที่ผิดปกติ (default: 0)                              |
| `mapping`       | JSONB       |     | YES      | การ map คอลัมน์ Excel → ฟิลด์ระบบ                         |
| `error_samples` | JSONB       |     | YES      | ตัวอย่างแถวที่ error                                      |
| `summary`       | JSONB       |     | YES      | สรุปผลคัดกรอง (`usable`, `excluded`, แยกตามเหตุผล, ไม่มีเวลาพยาบาลแยก ward) |
| `created_at`    | TIMESTAMPTZ |     | NO       | วัน-เวลาที่นำเข้า                                         |

---

### 3. `drug_exclusions` — ยาที่ตัดออกจากการคำนวณ KPI

| Column       | Type        | PK  | Nullable | คำอธิบาย                                       |
|--------------|-------------|-----|----------|------------------------------------------------|
| `month_key`  | TEXT        | ✅  | NO       | `YYYY-MM` หรือ `*` (ทุกเดือน — ระบบแตกเป็นรายเดือนให้อัตโนมัติ) |
| `item_code`  | TEXT        | ✅  | NO       | รหัสยาที่ตัดออก                                 |
| `created_at` | TIMESTAMPTZ |     | NO       | วัน-เวลาที่บันทึก                               |

> Composite PK: `(month_key, item_code)` · Index: `item_code`  
> ใช้งานจริงกำหนดเป็นรายเดือน ตามมติคณะกรรมการยาแต่ละเดือน

---

### 4. `app_settings` — เกณฑ์การคัดกรอง (key/value)

| Column       | Type        | PK  | Nullable | คำอธิบาย              |
|--------------|-------------|-----|----------|-----------------------|
| `key`        | TEXT        | ✅  | NO       | ชื่อการตั้งค่า         |
| `value`      | JSONB       |     | NO       | ค่า                    |
| `updated_at` | TIMESTAMPTZ |     | NO       | เวลาแก้ไขล่าสุด         |

| key                    | ค่าเริ่มต้น                      | คำอธิบาย                                      |
|------------------------|----------------------------------|-----------------------------------------------|
| `max_order_nurse_hours`| `8`                              | Order → Nurse ตั้งแต่ค่านี้ขึ้นไปถือว่าเกิน (7:59 ยังนับ) |
| `excluded_locations`   | `["airport","rawai","khaolak"]`  | คลินิกภายนอกที่ตัดออกทุกเดือน                    |

---

### 5. `subgroups` — กลุ่มยา

| Column          | Type        | PK  | Nullable | คำอธิบาย                                       |
|-----------------|-------------|-----|----------|------------------------------------------------|
| `id`            | SERIAL      | ✅  | NO       | Auto-increment ID                              |
| `code`          | TEXT        |     | NO       | **UNIQUE** — รหัสกลุ่ม (สร้างอัตโนมัติจากชื่อ: ตัวพิมพ์ใหญ่ `A-Z0-9_`) |
| `name`          | TEXT        |     | NO       | ชื่อแสดงผล                                      |
| `description`   | TEXT        |     | YES      | คำอธิบาย                                       |
| `source_column` | TEXT        |     | YES      | ชื่อคอลัมน์ในบัญชียาที่ใช้ map อัตโนมัติ          |
| `color`         | TEXT        |     | YES      | สีแสดงผล (default: `#2563eb`)                   |
| `is_system`     | BOOLEAN     |     | NO       | กลุ่มระบบ ลบไม่ได้ (default: false)             |
| `active`        | BOOLEAN     |     | NO       | เปิดใช้งาน (default: true)                      |
| `sort_order`    | INT         |     | NO       | ลำดับแสดงผล (default: 100)                      |
| `created_at`    | TIMESTAMPTZ |     | NO       | วันที่สร้าง                                     |

| code      | name                          | source_column                  | color     |
|-----------|-------------------------------|--------------------------------|-----------|
| `HAD`     | High Alert Drug (HAD)         | High Alert Drug                | `#dc2626` |
| `VITAL`   | Vital Drug                    | Vital Drug                     | `#7c3aed` |
| `VACCINE` | Vaccine                       | Vaccine                        | `#059669` |
| `PVI`     | Phlebitis/Vesicant/Irritant   | Phlebitis/vesicant/Irritant    | `#d97706` |

> "All Drugs" ไม่ใช่แถวในตาราง — เป็นมุมมองเริ่มต้นที่ไม่กรองกลุ่มยา

---

### 6. `subgroup_items` — สมาชิกของกลุ่มยา

| Column        | Type | PK  | Nullable | คำอธิบาย                                 |
|---------------|------|-----|----------|------------------------------------------|
| `subgroup_id` | INT  | ✅  | NO       | FK → `subgroups.id` (ON DELETE CASCADE)   |
| `item_code`   | TEXT | ✅  | NO       | รหัสยา                                    |
| `source`      | TEXT |     | NO       | ที่มา: `manual` / `import` (default: `manual`) |

> Composite PK: `(subgroup_id, item_code)` · Index: `item_code`  
> นำเข้าบัญชียาใหม่จะลบเฉพาะสมาชิก `import` แล้วสร้างใหม่ — สมาชิก `manual` ไม่ถูกแตะ

---

### 7. `drug_master` — รายการยา (จากบัญชียา)

| Column         | Type        | PK  | Nullable | คำอธิบาย          |
|----------------|-------------|-----|----------|-------------------|
| `item_code`    | TEXT        | ✅  | NO       | รหัสยา             |
| `item_name`    | TEXT        |     | YES      | ชื่อยา             |
| `generic_name` | TEXT        |     | YES      | ชื่อสามัญ          |
| `unit`         | TEXT        |     | YES      | หน่วย              |
| `updated_at`   | TIMESTAMPTZ |     | NO       | เวลาแก้ไขล่าสุด     |

---

### 8. `kpi_definitions` — นิยาม KPI

| Column            | Type    | PK  | Nullable | คำอธิบาย                                             |
|-------------------|---------|-----|----------|------------------------------------------------------|
| `id`              | SERIAL  | ✅  | NO       | Auto-increment ID                                    |
| `code`            | TEXT    |     | YES      | **UNIQUE** — รหัส KPI (เช่น `PTTC`)                   |
| `name`            | TEXT    |     | NO       | ชื่อ KPI                                             |
| `description`     | TEXT    |     | YES      | คำอธิบาย                                             |
| `step`            | TEXT    |     | NO       | key ของขั้นตอนที่วัด (ดูตาราง Process Steps)           |
| `operator`        | TEXT    |     | NO       | เงื่อนไขผ่าน: `<=` `<` `>=` `>` (default: `<=`)        |
| `target`          | NUMERIC |     | NO       | ค่าเป้าหมาย                                           |
| `unit`            | TEXT    |     | NO       | หน่วยของ target: `minutes` / `seconds` (default: `minutes`) |
| `floor_to_minute` | BOOLEAN |     | NO       | ตัดวินาทีทิ้งก่อนเทียบ target (default: true)           |
| `pass_rate_goal`  | NUMERIC |     | YES      | เป้าหมาย % ผ่าน (default: 90)                          |
| `subgroup_id`     | INT     |     | YES      | FK → `subgroups.id` (ON DELETE SET NULL) — null = ทุกกลุ่ม |
| `is_primary`      | BOOLEAN |     | NO       | KPI หลัก — มีได้รายการเดียว (default: false)            |
| `active`          | BOOLEAN |     | NO       | เปิดใช้งาน (default: true)                             |
| `sort_order`      | INT     |     | NO       | ลำดับแสดงผล (default: 100)                             |

| code       | name                  | step             | operator | target | is_primary |
|------------|-----------------------|------------------|----------|--------|------------|
| `PTTC`     | PTTC / Total Process  | `order_nurse`    | `<=`     | 30     | ✅         |
| `PHARMACY` | Pharmacy Process      | `order_dispense` | `<=`     | 15     |            |

> เวลาที่ไม่มีข้อมูลนับเป็น **Missing** ไม่ใช่ Within/Over

---

### 9. `users` — ผู้ใช้งานระบบ

> สร้างและจัดการใน **Neon SQL Editor เท่านั้น** (ไม่อยู่ใน migration)

| Column          | Type        | PK  | Nullable | คำอธิบาย                                          |
|-----------------|-------------|-----|----------|---------------------------------------------------|
| `id`            | UUID        | ✅  | NO       | default `gen_random_uuid()`                        |
| `username`      | TEXT        |     | NO       | ชื่อผู้ใช้ (เทียบแบบไม่สนตัวพิมพ์เล็ก/ใหญ่)          |
| `password_hash` | TEXT        |     | NO       | bcrypt hash                                        |
| `full_name`     | TEXT        |     | NO       | ชื่อ-นามสกุลแสดงผล                                  |
| `role`          | TEXT        |     | NO       | บทบาท (default: `pharmacist`) — ต้องอยู่ใน `ALLOWED_ROLES` |
| `is_active`     | BOOLEAN     |     | NO       | เปิดใช้งานบัญชี (default: true)                     |
| `last_login_at` | TIMESTAMPTZ |     | YES      | เข้าสู่ระบบล่าสุด                                   |
| `created_at`    | TIMESTAMPTZ |     | NO       | วันที่สร้าง (default: now())                        |

---

### 10. `schema_migrations` — ประวัติ migration ที่รันแล้ว

> สร้างอัตโนมัติโดย `npm run migrate` (`backend/src/migrate.js`)

| Column       | Type        | PK  | Nullable | คำอธิบาย                          |
|--------------|-------------|-----|----------|-----------------------------------|
| `name`       | TEXT        | ✅  | NO       | ชื่อไฟล์ใน `backend/sql/` (เช่น `002_data_filter.sql`) |
| `applied_at` | TIMESTAMPTZ |     | YES      | เวลาที่รัน (default: now())        |

- รันไฟล์ `.sql` ตามลำดับชื่อ ข้ามไฟล์ที่อยู่ในตารางนี้แล้ว · แต่ละไฟล์อยู่ในธุรกรรมเดียว (พังแล้ว rollback)
- หลังรัน `002_data_filter.sql` ครั้งแรก จะเรียก `reclassifyAll()` ตรวจข้อมูลเดิมให้ 1 ครั้ง
- ตาราง `users` **ไม่อยู่ใน migration** — สร้างใน Neon SQL Editor

---

## 🔌 API Endpoints

ทุก error ตอบกลับเป็น `{ "error": "ข้อความ" }` พร้อม HTTP status (400 ข้อมูลไม่ถูกต้อง, 401 ยังไม่ล็อกอิน/token หมดอายุ, 403 ไม่มีสิทธิ์, 409 ซ้ำ/ต้องยืนยัน, 410 ไฟล์ชั่วคราวหมดอายุ, 429 ล็อกอินผิดบ่อย)

### Auth & Health

| Method | Endpoint           | Auth | คำอธิบาย                          |
|--------|--------------------|------|-----------------------------------|
| GET    | `/api/health`      | —    | ตรวจสถานะ API และ DB → `{ "ok": true }` |
| POST   | `/api/auth/login`  | —    | เข้าสู่ระบบ                         |
| GET    | `/api/auth/me`     | ✅   | ตรวจ token และสถานะบัญชีใน DB       |

**POST `/api/auth/login`** — Body:
```json
{ "username": "pharmacist01", "password": "your_password" }
```
Response:
```json
{
  "token": "<jwt>",
  "user": { "id": "uuid", "username": "pharmacist01", "fullName": "ภก.ชื่อ นามสกุล", "role": "pharmacist" }
}
```
> ผิด 5 ครั้งใน 15 นาที (ต่อ IP + username) → 429  
> บัญชีปิดใช้งาน หรือ role ไม่อยู่ใน `ALLOWED_ROLES` → 403

**GET `/api/auth/me`** → `{ "user": { id, username, fullName, role } }`

---

### Analytics

| Method | Endpoint          | คำอธิบาย                                   |
|--------|-------------------|--------------------------------------------|
| GET    | `/api/meta`       | ข้อมูลตั้งต้นของ frontend                    |
| GET    | `/api/dashboard`  | ข้อมูล Dashboard ของ KPI ที่เลือก            |
| GET    | `/api/report`     | ข้อมูล Monthly Report (ต่อ KPI)             |
| GET    | `/api/export`     | ส่งออกไฟล์                                  |

> นับเฉพาะ **ข้อมูลที่ใช้ได้** (`excl_reason IS NULL` และไม่ถูกตัดโดย `drug_exclusions`)

#### Query filter ร่วม

| Param      | คำอธิบาย                                                      | `dashboard` | `report` | `data-quality` |
|------------|---------------------------------------------------------------|:-----------:|:--------:|:--------------:|
| `kpi`      | id ของ KPI (ไม่พบ/ไม่ส่ง = KPI หลัก หรือ KPI แรกที่ active)       | ✅          | ✅ (ไม่ส่ง = ทุก KPI) | —  |
| `year`     | ปี ค.ศ.                                                        | ✅          | ✅       | ✅             |
| `month`    | 1–12                                                          | ✅          | ไม่ใช้ (แสดงทุกเดือน) | ไม่ใช้ (แสดงทุกเดือน) |
| `ward`     | ชื่อ ward ตรงตัว หรือ `all`                                    | ✅          | ✅       | ✅             |
| `subgroup` | id กลุ่มยา หรือ `all`                                          | ✅          | ✅       | ✅             |

> ถ้า KPI ผูกกลุ่มยาไว้ (`kpi_definitions.subgroup_id`) จะกรองกลุ่มนั้นเพิ่มอีกชั้น (AND กับ `subgroup`)

#### Stats object (ใช้ซ้ำใน card / monthly / daily / wards / compare)

| Field          | คำอธิบาย                                        |
|----------------|-------------------------------------------------|
| `total_orders` | จำนวนแถวที่ใช้ได้                                |
| `total`        | จำนวนแถวที่มีระยะเวลาของขั้นตอนนั้น (ฐานคำนวณ %)  |
| `pass` / `fail`| จำนวนที่ผ่าน / ไม่ผ่านเงื่อนไข KPI                |
| `missing`      | จำนวนที่ไม่มีระยะเวลา                             |
| `anomalies`    | จำนวนแถวที่ติด anomaly                           |
| `avg_sec` / `median_sec` / `p90_sec` | ค่าเฉลี่ย / มัธยฐาน / เปอร์เซ็นไทล์ 90 (วินาที) |
| `pct`          | `pass / total × 100` (null ถ้า `total` = 0)       |

**GET `/api/meta`** — Response:
```json
{
  "years": [2026, 2025],
  "wards": ["C5L", "..."],
  "subgroups": [{ "id": 1, "code": "HAD", "name": "High Alert Drug (HAD)", "color": "#dc2626", "active": true }],
  "kpis": [],
  "counts": { "orders": 2157, "usable": 1276, "drugs": 1100 },
  "months": []
}
```
> `wards` เรียงตามจำนวนออเดอร์ที่ใช้ได้ · `subgroups` เฉพาะที่ `active` · `kpis` เฉพาะที่ `active` (มี `subgroup_name`)

**GET `/api/dashboard`** — Response (ไม่พบ KPI → `{ "kpi": null }`):

| Field          | รูปแบบ                                                                 |
|----------------|------------------------------------------------------------------------|
| `kpi`          | แถวจาก `kpi_definitions`                                                |
| `card`         | Stats object รวมตาม filter                                              |
| `monthly`      | 12 รายการ `{ month, name, ...stats }`                                    |
| `daily`        | `[{ day: "YYYY-MM-DD", ...stats }]`                                     |
| `wards`        | `[{ ward, ...stats }]` เรียงตาม `total_orders` มาก→น้อย (ไม่มี ward = "(ไม่ระบุ)") |
| `distribution` | 3 ช่วง `[{ bucket, n }]`: "≤ 15 นาที", "16–30 นาที", "> 30 นาที"           |
| `top`          | 10 ออเดอร์ที่ช้าที่สุด `{ id, t_order, item_code, item_name, ward, order_by, vn_an, sec }` |
| `steps`        | ทุกขั้นตอน `{ key, label, short, n, avg_sec, median_sec, p90_sec }`        |
| `compare`      | `[{ id: "all", name: "All Drugs", color, ...stats }, ...กลุ่มยาที่ active]` |

**GET `/api/report`** — Response เป็น array ต่อ KPI:
```json
[
  {
    "kpi": {},
    "months": [],
    "year": {},
    "steps": [],
    "fromOrder": [],
    "endKey": "nurse",
    "prev": { "year": 2025, "months": [], "total": {} }
  }
]
```
- `months` — 12 รายการ `{ month, name, ...stats }` · `year` — Stats object ทั้งปี
- `fromOrder` — เวลาเฉลี่ยจาก "เวลาสั่งยา" ไปแต่ละขั้น (`execute`, `pharmacist`, `nurse`): `{ key, label, months: [{ avg_sec, n }] ×12, year: { avg_sec, n } }`
- `steps` — Doctor to Execute / Execute to Dispense / Dispense to Administration (ส่วนต่างของค่าเฉลี่ย เหมือนสูตร Excel)
- `endKey` — ขั้นตอนที่ KPI นี้ไปจบ (เลือกขั้นที่ค่าเฉลี่ยใกล้ค่าเฉลี่ยของ KPI ที่สุด)
- `prev` — เทียบปีก่อน มีเฉพาะ **KPI หลัก** และเมื่อส่ง `year` มาเท่านั้น (ไม่ก็ `null`)

**GET `/api/export`** — Query: `type`, `format`, `year` + filter ร่วม

| Param    | ค่า                                  | Default     |
|----------|--------------------------------------|-------------|
| `type`   | `dashboard` / `report` / `orders`    | `dashboard` |
| `format` | `xlsx` / `csv`                       | `xlsx`      |
| `year`   | ปี (ใช้กรองข้อมูล + ตั้งชื่อไฟล์)       | ทั้งหมด     |
| `all`    | `1` = รวมแถวที่ถูกตัดออก (เฉพาะ `type=orders`) | —    |

ชื่อไฟล์: `pharmacy-kpi-<type>-<year|all>.xlsx|csv`

| `type`      | Sheet ที่ได้ |
|-------------|--------------|
| `dashboard` | Summary, Monthly, Daily, Process steps, All vs Subgroup, Ward, Distribution, Top slow |
| `report`    | หนึ่ง sheet ต่อ KPI (ชื่อ = ชื่อ KPI) + Data quality + Missing admin by ward (ถ้ามี) + Process steps |
| `orders`    | Orders (สูงสุด 200,000 แถว เรียงตามเวลาสั่ง พร้อมคอลัมน์ Excluded reason) |

> `csv`: ทุก sheet ต่อกันในไฟล์เดียว มีหัว `# <ชื่อ sheet>` คั่น และใส่ BOM (เปิดภาษาไทยใน Excel ได้) · `xlsx`: ชื่อ sheet ตัดอักขระต้องห้ามและยาวไม่เกิน 31 ตัวอักษร

---

### Import (`/api/import`)

| Method | Endpoint                | คำอธิบาย                                  |
|--------|-------------------------|-------------------------------------------|
| POST   | `/api/import/upload`    | อัปโหลดไฟล์ Excel (field ชื่อ `file`, ≤ 40 MB) |
| POST   | `/api/import/preview`   | วิเคราะห์ + คัดกรองก่อนบันทึก               |
| POST   | `/api/import/commit`    | บันทึกเข้าฐานข้อมูล                         |
| GET    | `/api/import/history`   | ประวัติการนำเข้า (ล่าสุด 100 รายการ)         |
| DELETE | `/api/import/:id`       | ลบ batch และ orders ของ batch นั้น (rollback) |

#### ฟิลด์ที่ระบบ map จากไฟล์ Excel

หัวคอลัมน์เทียบแบบ normalize (ตัวพิมพ์เล็ก ตัดอักขระที่ไม่ใช่ a-z, 0-9 และอักษรไทย) · `mapping` เป็น object `{ ฟิลด์: ลำดับคอลัมน์ (เริ่มที่ 0) }`

| ฟิลด์        | ป้ายชื่อ              | หัวคอลัมน์ที่รู้จัก                                   | จำเป็น |
|--------------|-----------------------|-------------------------------------------------------|:------:|
| `item_code`  | Item Code             | ItemCode, รหัสยา                                       | ✅     |
| `t_order`    | เวลาแพทย์สั่ง          | เวลาแพทย์สั่งตรวจ, เวลาแพทย์สั่ง, OrderTime             | ✅     |
| `hn`         | HN                    | HN                                                     |        |
| `vn_an`      | VN/AN                 | VNAN, AN, VN                                           |        |
| `name`       | ชื่อผู้ป่วย            | Name, ชื่อ, PatientName                                 |        |
| `item_name`  | Item Name             | ItemName, ชื่อยา                                        |        |
| `pn`         | PN                    | PN                                                     |        |
| `order_by`   | Order by              | OrderBy                                                |        |
| `t_prepare`  | เวลา ผช.เภสัชจัดยา     | เวลาผชเภสัชจัดยา, เวลาผู้ช่วยเภสัชจัดยา                  |        |
| `t_verify`   | เวลาเภสัชตรวจยา        | เวลาเภสัชตรวจยา (ว่าง → ใช้เวลาจ่ายยาแทน)               |        |
| `t_dispense` | เวลาเภสัชจ่ายยา        | เวลาเภสัชจ่ายยา                                         |        |
| `t_nurse`    | เวลาพยาบาลให้ยา        | เวลาพยาบาลให้ยา                                         |        |
| `total`      | เวลารวม               | เวลารวม (เก็บอ้างอิงใน `total_src`)                      |        |
| `ward`       | Ward/Location         | Ward/Location, Ward, Location                          |        |
| `room`       | Room                  | Room, ห้อง                                              |        |
| `high_alert` | High_Alert_Drug       | High_Alert_Drug (มีคำว่า "high" = true)                  |        |
| `t_ipd`      | เวลาบันทึกรับยา IPD    | เวลาบันทึกรับยาIPD, เวลารับยาIPD                         |        |

**วันเวลาที่อ่านได้:** Excel serial number, `YYYY-MM-DD HH:mm(:ss)`, `DD/MM/YYYY HH:mm(:ss)` · ปี > 2400 แปลง พ.ศ. → ค.ศ. · ปีต้องอยู่ระหว่าง 2000–2100

**POST `/api/import/upload`** — `multipart/form-data` field `file` (`.xls` / `.xlsx`)  
Response:
```json
{
  "token": "uuid",
  "fileName": "Aug_2026.xls",
  "sheets": [{ "name": "Sheet1", "rows": 2157, "matched": 11 }],
  "defaultSheet": "Sheet1",
  "fields": { "item_code": "Item Code *", "t_order": "เวลาแพทย์สั่ง *" },
  "required": ["item_code", "t_order"]
}
```
> `matched` = จำนวนหัวคอลัมน์ที่รู้จัก — `defaultSheet` คือ sheet ที่ `matched` มากที่สุด  
> `token` หมดอายุใน 30 นาที (เก็บในหน่วยความจำ) → 410 ถ้าหมดอายุ

**POST `/api/import/preview`** — Body:
```json
{ "token": "uuid", "sheet": "Sheet1", "mapping": {} }
```
> `mapping` ว่าง/ไม่ส่ง = auto mapping  
> ⚠️ endpoint นี้มี side effect: ถ้ามียาที่ตัดแบบ `*` (ทุกเดือน) ระบบจะแตกเป็นรายเดือน (รวมเดือนที่อยู่ในไฟล์) ก่อนตอบ

Response:
```json
{
  "drugs": [{ "item_code": "ITEM001", "item_name": "...", "n": 120 }],
  "existingExclusions": [{ "month_key": "2026-08", "item_code": "ITEM001" }],
  "months": ["2026-08"],
  "sheet": "Sheet1",
  "headers": [],
  "mapping": {},
  "missingRequired": [],
  "stats": {
    "rows": 2157, "blank": 0, "footer": 1, "valid": 2100, "errors": 56,
    "repeatedInFile": 0, "anomalies": 0, "missingByField": { "t_nurse": 53 },
    "usable": 1277, "excluded": 823, "verifyFilled": 0,
    "classCounts": { "LOCATION": 0, "NO_DISPENSE": 0, "NO_ADMIN": 0, "NEG_TIME": 0, "OVER_LIMIT": 0 },
    "missingAdminByWard": [{ "ward": "C5L", "n": 5 }],
    "dateFrom": "2026-08-01", "dateTo": "2026-08-31",
    "dupInDb": 0, "willImport": 2100
  },
  "settings": { "max_order_nurse_hours": 8, "excluded_locations": ["airport", "rawai", "khaolak"] },
  "reasons": {},
  "errors": [{ "row": 12, "message": "ไม่มี item_code" }],
  "sample": [],
  "anomalySample": []
}
```
- `drugs` — ยาที่มีแถว **ใช้ได้** ในไฟล์ (ให้ผู้ใช้ติ๊กตัดก่อนบันทึก) เรียงตามจำนวนมาก→น้อย
- `errors` — สูงสุด 50 รายการ · `sample` / `anomalySample` — ตัวอย่างสูงสุด 8 แถว
- ถ้ายังไม่ map ฟิลด์ที่จำเป็น `missingRequired` จะมีค่า และไม่มีข้อมูลวิเคราะห์

**POST `/api/import/commit`** — Body:
```json
{
  "token": "uuid",
  "sheet": "Sheet1",
  "mapping": {},
  "mode": "skip",
  "confirmOverwrite": false,
  "excludeCodes": ["ITEM001", "ITEM002"],
  "listedCodes": ["ITEM001", "ITEM002", "ITEM003"]
}
```
- `mode`: `skip` (ข้ามข้อมูลซ้ำ, default) หรือ `overwrite` (อัปเดตแถวเดิม — แถวที่ถูกอัปเดตจะย้ายมาอยู่ใน batch ใหม่)
- `overwrite` + มีข้อมูลซ้ำ + ไม่ส่ง `confirmOverwrite: true` → 409
- มี `missingRequired` → 400
- ทุกแถวถูกบันทึก (รวมแถวที่ถูกคัดกรอง โดยติด `excl_reason`) ในธุรกรรมเดียวกับรายการ batch และยาที่ตัด
- `excludeCodes` (เป็น array) = ยาที่เลือกตัด · `listedCodes` = ยาทั้งหมดที่แสดงให้เลือก → ระบบตั้งค่าให้ **ทุกเดือนที่อยู่ในไฟล์**: ลบการตัดของ `listedCodes` ก่อน แล้วเพิ่ม `excludeCodes` (ติ๊กออก = นำกลับมาคิด) · ไม่ส่ง `excludeCodes` = ไม่แตะรายการตัดยา

Response:
```json
{
  "importId": 7, "imported": 2100, "updated": 0, "skipped": 0,
  "errors": 56, "anomalies": 0, "drugsExcluded": 6,
  "usable": 1277, "excluded": 823,
  "classCounts": {}, "missingAdminByWard": []
}
```

**GET `/api/import/history`** — array ของ  
`id, file_name, sheet_name, mode, total_rows, imported, updated, skipped, errors, anomalies, created_at, usable, excluded, rows_now`  
> `total_rows` = จำนวนแถวในไฟล์ไม่รวมแถวว่างและแถวท้ายรายงาน · `usable`/`excluded` มาจาก `import_batches.summary`

---

### Data Filter

| Method | Endpoint                                  | คำอธิบาย                                      |
|--------|-------------------------------------------|-----------------------------------------------|
| GET    | `/api/data-quality`                       | จำนวนทั้งหมด / ใช้ได้ / ตัดออก + ไม่มีเวลาพยาบาลแยก Ward |
| GET    | `/api/filter/settings`                    | อ่านเกณฑ์คัดกรอง                               |
| PUT    | `/api/filter/settings`                    | แก้เกณฑ์ แล้วตรวจข้อมูลเดิมใหม่ทั้งหมด          |
| POST   | `/api/filter/reclassify`                  | ตรวจข้อมูลเดิมใหม่ทั้งหมด (ไม่เปลี่ยนเกณฑ์)      |
| GET    | `/api/filter/locations`                   | รายชื่อ Ward / Location + จำนวนแถว            |
| GET    | `/api/filter/drugs`                       | ยาที่มีในข้อมูลเดือนนั้น + สถานะว่าถูกตัดอยู่หรือไม่ |
| GET    | `/api/filter/drug-exclusions`             | ยาที่ตัดออกทั้งหมด (แตก `*` เป็นรายเดือนก่อนตอบ) |
| PUT    | `/api/filter/drug-exclusions`             | ตั้งยาที่ตัดออกของเดือน (แทนที่ทั้งชุดของเดือนนั้น) |
| POST   | `/api/filter/drug-exclusions/expand-all`  | แปลงยาที่ตัดแบบ `*` เป็นรายเดือน แล้วลบ `*`      |
| POST   | `/api/filter/pttc-list/upload`            | อัปโหลดบัญชียาเพื่ออ่านสีคอลัมน์ PTTC           |
| POST   | `/api/filter/pttc-list/apply`             | ตั้งยาสีแดงเป็นยาที่ตัดของเดือน                 |

**GET `/api/data-quality`** — Query: `year`, `ward`, `subgroup` (แสดงทุกเดือนเสมอ; `month` ใช้เฉพาะรวมยอด `missingAdmin.total`)  
Response:
```json
{
  "months": [{ "month": 8, "name": "Aug", "total": 2157, "usable": 1277, "excluded": 880,
               "LOCATION": 0, "DRUG": 0, "NO_DISPENSE": 0, "NO_ADMIN": 0, "NEG_TIME": 0, "OVER_LIMIT": 0 }],
  "year": { "total": 0, "usable": 0, "excluded": 0, "LOCATION": 0, "DRUG": 0, "NO_DISPENSE": 0, "NO_ADMIN": 0, "NEG_TIME": 0, "OVER_LIMIT": 0 },
  "missingAdmin": [{ "ward": "C5L", "total": 5, "months": [0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0] }],
  "reasons": {},
  "maxHours": 8
}
```
- `months` มี 12 รายการ · `excluded = total − usable`
- แถวหนึ่งนับเหตุผลเดียว ตามลำดับ: `LOCATION` → `DRUG` (ยาที่ผู้ใช้เลือกตัดของเดือนนั้น ไม่ว่าแถวจะขาดเวลาอะไร) → `NO_DISPENSE` / `NO_ADMIN` / `NEG_TIME` / `OVER_LIMIT` (เฉพาะยาที่ยังนับอยู่)
- `missingAdmin` — ออเดอร์ที่ไม่มีเวลาพยาบาลให้ยา แยกตาม Ward × เดือน (ไม่รวมยาที่ตัดและ Ward นอก รพ.) เรียงมาก→น้อย

**GET `/api/filter/settings`** → `{ "settings": { "max_order_nurse_hours": 8, "excluded_locations": [...] }, "reasons": { ... } }`

**PUT `/api/filter/settings`** — Body (ส่งเฉพาะที่ต้องการแก้):
```json
{ "max_order_nurse_hours": 8, "excluded_locations": ["airport", "rawai", "khaolak"] }
```
- `max_order_nurse_hours` ต้องเป็นตัวเลข > 0 และ ≤ 72 (ไม่ถูกต้อง → 400)
- `excluded_locations` รับ array หรือข้อความคั่นด้วยบรรทัดใหม่ / `,` / `;` — ระบบแปลงเป็นตัวพิมพ์เล็กและตัดค่าซ้ำ
- หลังบันทึก ระบบ reclassify `orders.excl_reason` ทั้งหมดทันที

Response: `{ "settings": { ... }, "checked": 2157, "changed": 12 }`  
`POST /api/filter/reclassify` ตอบ `{ "checked": 2157, "changed": 12 }`

**GET `/api/filter/drugs`** — Query: `year`, `month`, `q` (ค้นหา item code / ชื่อยา), `limit` (≤ 1000, default 300)  
นับเฉพาะแถวที่ผ่านกฎข้อมูลดิบ (`excl_reason IS NULL`) Response:
```json
{
  "key": "2026-08",
  "items": [
    { "item_code": "ITEM001", "item_name": "...", "n": 120, "n_excluded": 0, "excluded_here": false, "excluded_all": false }
  ]
}
```
> `key` คือ `month_key` ของเดือนที่เลือก (ไม่ส่ง year/month = `*`)

**GET `/api/filter/drug-exclusions`** → array ของ `{ month_key, item_code, item_name }` เรียงเดือนล่าสุดก่อน (ก่อนตอบระบบแตก `*` เป็นรายเดือนให้)

**PUT `/api/filter/drug-exclusions`** — Body:
```json
{ "year": 2026, "month": 8, "codes": ["ITEM001", "ITEM002"] }
```
หรือส่ง `month_key` แทน `year`/`month`:
```json
{ "month_key": "2026-08", "codes": ["ITEM001"] }
```

Response: `{ "month_key": "2026-08", "count": 2 }`  
> `month_key` ต้องเป็น `YYYY-MM` (หรือ `*`) ไม่เช่นนั้น → 400 · ถ้าไม่ส่ง `year`/`month` ระบบจะใช้ `*` — หน้าจอควรส่งเดือนเสมอ

**POST `/api/filter/drug-exclusions/expand-all`** → `{ "added": 0, "removed": 0 }`

**POST `/api/filter/pttc-list/upload`** — `multipart/form-data` field `file`  
Response:
```json
{ "token": "uuid", "sheet": "Sheet1", "red": 120, "green": 410, "other": 0, "none": 5 }
```
> `token` หมดอายุใน 30 นาที · ไม่พบคอลัมน์ ItemCode/PTTC หรือไม่พบสีเขียว/แดง → 400  
> หาแถวหัวตารางใน 15 แถวแรกของ sheet แรกที่มีทั้ง `ItemCode` (หรือ `รหัสยา`) และ `PTTC`  
> **เกณฑ์สี** อ่านจากสีพื้นหลังของเซลล์ในคอลัมน์ PTTC: ขาว (R,G,B > 235) = `none` · เขียว (G สูงกว่า R และ B เกิน 30) = `green` (นับ) · แดง/น้ำตาลแดง (R สูงกว่า G และ B เกิน 30 และ G < 140) = `red` (ตัด) · สีอื่น = `other`  
> `none` / `other` ไม่ถูกนำไปตั้งเป็นยาที่ตัด

**POST `/api/filter/pttc-list/apply`** — Body:
```json
{ "token": "uuid", "year": 2026, "month": 8, "mode": "replace" }
```
- `month` จำเป็น (ไม่ส่ง → 400)
- `mode`: `replace` (แทนที่ทั้งชุดของเดือน, default) หรือ `merge` (รวมกับที่ตัดไว้)

Response:
```json
{ "month_key": "2026-08", "mode": "replace", "previous": 0, "now": 120, "red": 120, "rowsAffected": 350 }
```

---

### KPI Settings

| Method | Endpoint          | คำอธิบาย                     |
|--------|-------------------|------------------------------|
| GET    | `/api/kpis`       | รายการ KPI + รายการ steps     |
| POST   | `/api/kpis`       | เพิ่ม KPI                     |
| PUT    | `/api/kpis/:id`   | แก้ไข KPI                     |
| DELETE | `/api/kpis/:id`   | ลบ KPI                        |

**POST / PUT `/api/kpis`** — Body:
```json
{
  "name": "Pharmacy Process",
  "description": "Doctor → Pharmacy ไม่เกิน 15 นาที",
  "step": "order_dispense",
  "operator": "<=",
  "target": 15,
  "unit": "minutes",
  "floor_to_minute": true,
  "pass_rate_goal": 90,
  "subgroup_id": null,
  "is_primary": false,
  "active": true,
  "sort_order": 20
}
```
- `name`, `step` (ต้องเป็น key ที่มีอยู่), `operator` (`<=` `<` `>=` `>`), `target` (ตัวเลข) จำเป็น — ไม่ถูกต้อง → 400
- `is_primary: true` จะปลด KPI หลักเดิมอัตโนมัติ

---

### Subgroups (กลุ่มยา)

| Method | Endpoint                    | คำอธิบาย                                  |
|--------|-----------------------------|-------------------------------------------|
| GET    | `/api/subgroups`            | รายการกลุ่มยา + `item_count`               |
| POST   | `/api/subgroups`            | เพิ่มกลุ่มยา (รหัสซ้ำ → 409)               |
| PUT    | `/api/subgroups-order`      | จัดลำดับกลุ่ม                              |
| PUT    | `/api/subgroups/:id`        | แก้ไขกลุ่ม (ไม่เปลี่ยน `code`)              |
| DELETE | `/api/subgroups/:id`        | ลบกลุ่ม (กลุ่มระบบลบไม่ได้ → 400)           |
| GET    | `/api/subgroups/:id/items`  | สมาชิกกลุ่ม (ค้นหา + แบ่งหน้า)              |
| POST   | `/api/subgroups/:id/items`  | เพิ่มสมาชิกด้วย item code                  |
| DELETE | `/api/subgroups/:id/items`  | ลบสมาชิก                                   |

**POST / PUT `/api/subgroups`** — Body:
```json
{
  "name": "Chemo Support",
  "code": "CHEMO_SUPPORT",
  "description": "",
  "source_column": "Chemo",
  "color": "#2563eb",
  "active": true,
  "sort_order": 50
}
```
> ไม่ส่ง `code` = สร้างจากชื่ออัตโนมัติ

**PUT `/api/subgroups-order`** — Body: `{ "ids": [3, 1, 2, 4] }` → จัด `sort_order` เป็น 10, 20, 30, …

**GET `/api/subgroups/:id/items`** — Query: `q` (ค้นหา item code / ชื่อ / generic), `limit` (≤ 500, default 100), `offset`  
Response: `{ "items": [{ item_code, source, item_name, generic_name }], "total": 0 }`

**POST `/api/subgroups/:id/items`** — Body:
```json
{ "codes": "ITEM001, ITEM002\nITEM003" }
```
> คั่นด้วยเว้นวรรค, ขึ้นบรรทัดใหม่, `,` หรือ `;` · Response: `{ "added": 3, "unknownInDrugList": 0 }`

**DELETE `/api/subgroups/:id/items`** — Body: `{ "codes": ["ITEM001"] }`

---

### Drug Master (บัญชียา)

| Method | Endpoint               | คำอธิบาย                                       |
|--------|------------------------|------------------------------------------------|
| GET    | `/api/drugs/summary`   | จำนวนยาในบัญชี + จำนวนรหัสยาในออเดอร์ที่ยังไม่อยู่ในบัญชี |
| GET    | `/api/drugs/search`    | ค้นหายาแบบ autocomplete                         |
| POST   | `/api/drugs/import`    | นำเข้าบัญชียา + map สมาชิกกลุ่มอัตโนมัติ          |

**GET `/api/drugs/search`** — Query: `q` (อย่างน้อย 2 ตัวอักษร), `limit` (1–20, default 8)  
Response: `{ "items": [{ item_code, item_name, generic_name }] }`

**POST `/api/drugs/import`** — `multipart/form-data` field `file`  
- เลือก sheet ที่มี `ItemCode` และคอลัมน์ตรงกับ `subgroups.source_column` มากที่สุด
- upsert ลง `drug_master`, สร้างสมาชิก `source = 'import'` ใหม่ของแต่ละกลุ่ม (ในธุรกรรมเดียว)
- ช่อง flag ของกลุ่มถือว่า "อยู่ในกลุ่ม" เมื่อไม่ว่างและไม่ใช่ `-`, `not had`, `no`, `n`, `0`, `false` (ไม่สนตัวพิมพ์)

Response:
```json
{ "sheet": "Sheet1", "drugs": 1100, "groups": { "High Alert Drug (HAD)": 85 }, "flagColumnsFound": 4 }
```

---

## 📊 ER Diagram

```mermaid
erDiagram
    import_batches ||--o{ orders : "import_id"
    subgroups ||--o{ subgroup_items : "subgroup_id"
    subgroups ||--o{ kpi_definitions : "subgroup_id"
    drug_master ||--o{ subgroup_items : "item_code"
    drug_master ||--o{ orders : "item_code"
    drug_master ||--o{ drug_exclusions : "item_code"

    import_batches {
        serial id PK
        text file_name
        text sheet_name
        text mode
        int total_rows
        jsonb mapping
        jsonb summary
        timestamptz created_at
    }

    orders {
        bigserial id PK
        int import_id FK
        text dedupe_key UK
        text hn
        text item_code
        text ward
        timestamp t_order
        timestamp t_dispense
        timestamp t_nurse
        date order_date
        int d_order_nurse
        int d_order_dispense
        text excl_reason
    }

    drug_master {
        text item_code PK
        text item_name
        text generic_name
        text unit
    }

    drug_exclusions {
        text month_key PK
        text item_code PK
    }

    subgroups {
        serial id PK
        text code UK
        text name
        text source_column
        text color
        boolean is_system
    }

    subgroup_items {
        int subgroup_id PK
        text item_code PK
        text source
    }

    kpi_definitions {
        serial id PK
        text code UK
        text name
        text step
        text operator
        numeric target
        int subgroup_id FK
        boolean is_primary
    }

    app_settings {
        text key PK
        jsonb value
    }

    users {
        uuid id PK
        text username
        text full_name
        text role
        boolean is_active
    }
```

> `orders.item_code`, `subgroup_items.item_code`, `drug_exclusions.item_code` ผูกกับ `drug_master.item_code` เชิงตรรกะ (ไม่มี FOREIGN KEY จริงในฐานข้อมูล)  
> `app_settings` และ `users` ไม่มีความสัมพันธ์กับตารางอื่น

---

## ⚙️ Environment Variables (`backend/.env`)

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=your_long_random_secret
JWT_EXPIRES_IN=8h
PORT=4000
MASK_PATIENT=true
```

| ตัวแปร           | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|------------------|--------|-------------|----------|
| `DATABASE_URL`   | ✅     | —           | Neon connection string |
| `JWT_SECRET`     | ✅     | —           | ไม่ตั้ง = login ไม่ได้ (500) แนะนำยาวไม่ต่ำกว่า 32 ตัวอักษร |
| `JWT_EXPIRES_IN` |        | `8h`        | อายุ token |
| `PORT`           |        | `4000`      | พอร์ต backend |
| `MASK_PATIENT`   |        | `true`      | mask ชื่อผู้ป่วย (ตั้ง `false` เพื่อปิด) |

---

> 📌 ระบบคำนวณ KPI ใช้เฉพาะแถวที่ `excl_reason IS NULL` และยาที่ไม่อยู่ใน `drug_exclusions` ของเดือนนั้น