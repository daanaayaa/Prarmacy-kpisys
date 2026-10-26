# ⏱️ Pharmacy Process Time KPI — ระบบวัดเวลากระบวนการจ่ายยา

> ระบบนำเข้าไฟล์ Excel ดิบ คัดกรองข้อมูลอัตโนมัติ และวิเคราะห์ KPI เวลากระบวนการจ่ายยา  
> เช่น **PTTC (Doctor → Nurse ≤ 30 นาที)** และ **Pharmacy Process (Doctor → Pharmacy ≤ 15 นาที)**  
> พัฒนาสำหรับ **ฝ่ายเภสัชกรรม โรงพยาบาลกรุงเทพสิริโรจน์**

---

## 🎛️ ฟีเจอร์หลักของระบบ

### 🔐 ระบบ Authentication
- เข้าสู่ระบบด้วย Username / Password (JWT-based, bcrypt)
- Token มีอายุ 8 ชั่วโมง (ปรับได้ด้วย `JWT_EXPIRES_IN`)
- ทุก endpoint ภายใต้ `/api` ต้องล็อกอิน ยกเว้น `GET /api/health` และ `POST /api/auth/login`
- จำกัดการเดารหัสผ่าน: ผิดครบ 5 ครั้งใน 15 นาที (ต่อ IP + username) ระบบจะล็อกชั่วคราว
- Role ที่เข้าระบบได้ตอนนี้: `pharmacist` (เภสัชกร) — เพิ่ม Role ใหม่ได้ที่ `ALLOWED_ROLES` ใน `backend/src/middleware/auth.js`
- ตาราง `users` สร้างและจัดการใน Neon SQL Editor เท่านั้น (ไม่อยู่ใน migration)

### 📥 Import Excel (ไฟล์ดิบ → คัดกรองอัตโนมัติ)
- อัปโหลดไฟล์ `.xls` / `.xlsx` (สูงสุด 40 MB) ที่ export จากระบบโดยไม่ต้องกรองเองใน Excel
- เลือก sheet อัตโนมัติ + หาแถวหัวตารางอัตโนมัติ (ตรวจ 15 แถวแรก) + Auto column mapping (ปรับเองได้) — ฟิลด์ที่จำเป็นคือ **Item Code** และ **เวลาแพทย์สั่ง**
- รองรับวันเวลาแบบ Excel serial, `YYYY-MM-DD HH:mm(:ss)` และ `DD/MM/YYYY HH:mm(:ss)` (ปี พ.ศ. แปลงเป็น ค.ศ. อัตโนมัติ)
- ข้ามแถวว่างและแถวท้ายรายงาน (ที่มี "ผู้พิมพ์" / `.rpt`) โดยไม่นับเป็น error
- แถวที่ไม่มี Item Code หรือเวลาสั่งผิดรูปแบบ/ว่าง = error (ไม่บันทึก) · เวลาช่องอื่นที่รูปแบบผิดถือว่าไม่มีข้อมูลและติด anomaly
- ระยะเวลาติดลบ = ไม่นำไปคำนวณ + ติด anomaly · ระยะเวลาเกิน 24 ชม. (ยกเว้น Total) เก็บค่าไว้แต่ติด anomaly
- รายการยาซ้ำในไฟล์เดียวกัน (VN/AN + PN + Item Code + เวลาสั่งตรงกัน) นับทุกแถวเหมือน Excel เดิม ส่วนการนำเข้าไฟล์เดิมซ้ำจะถูกตรวจเป็นข้อมูลซ้ำ
- ชื่อผู้ป่วย / HN / VN-AN ถูก mask ก่อนบันทึกลงฐานข้อมูล (ตาม `MASK_PATIENT`)
- Preview ก่อนบันทึก: จำนวนแถวทั้งหมด / ใช้ได้ / ตัดออกตามเหตุผล / ซ้ำในฐานข้อมูล / ไม่มีเวลาพยาบาลแยกตาม Ward
- ตรวจข้อมูลซ้ำด้วย `dedupe_key` — เลือกโหมด `skip` (ข้าม) หรือ `overwrite` (ต้องยืนยันก่อน ไม่เขียนทับเงียบ ๆ)
- ไฟล์ที่อัปโหลดเก็บชั่วคราวในหน่วยความจำ 30 นาทีระหว่าง preview → commit
- ประวัติการนำเข้าเก็บใน `import_batches` และ **ลบ (rollback) ทั้ง batch** ได้
- ขั้นตอน: **อัปโหลด → ตรวจสอบ → เลือกยาที่ตัดออก → บันทึก**

### 🧹 Data Filter — กฎคัดกรองข้อมูลดิบ
แถวที่ไม่ผ่านกฎจะไม่ถูกลบ แต่ถูกติดป้ายใน `orders.excl_reason` (NULL = ใช้คำนวณ KPI ได้)

| `excl_reason` | ความหมาย |
|---------------|----------|
| `LOCATION`    | อยู่ใน location ที่ตัดออก (ค่าเริ่มต้น: Airport / Rawai / Khaolak Clinic) |
| `NO_DISPENSE` | ไม่มีเวลาจ่ายยา |
| `NO_ADMIN`    | ไม่มีเวลาพยาบาลให้ยา |
| `NEG_TIME`    | เวลาย้อนหลัง — พยาบาลให้ยา หรือเภสัชจ่ายยา ก่อนเวลาแพทย์สั่ง |
| `OVER_LIMIT`  | Order → Nurse ≥ เกณฑ์ชั่วโมงสูงสุด (ค่าเริ่มต้น 8 ชม. — 7:59 ยังนับ) |

- ตรวจตามลำดับ `LOCATION` → `NO_DISPENSE` → `NO_ADMIN` → `NEG_TIME` → `OVER_LIMIT` (แถวหนึ่งมีเหตุผลเดียว)
- ตัวเลขสรุป "ตัดออก" รายเดือน (`/api/data-quality`) แยกเป็น `LOCATION` → **ยาที่เลือกตัด (`DRUG`)** → เหตุผลที่เหลือ (เฉพาะยาที่ยังนับอยู่) รวมกันเท่ากับ ทั้งหมด − ใช้ได้
- `LOCATION` ตรวจแบบ **มีคำนั้นอยู่ในชื่อ ward** (ไม่สนตัวพิมพ์) เช่น `rawai` ตรงกับ "BSI Rawai Clinic"
- แก้เกณฑ์ได้ในหน้า Data Filter (`app_settings`; ชั่วโมงต้องอยู่ระหว่าง 0–72) — บันทึกแล้วระบบ **ตรวจข้อมูลเดิมใหม่ทั้งหมด (reclassify)** ทันที
- หากไม่มีเวลาเภสัชตรวจยา (verify) ใช้เวลาจ่ายยาแทน
- มี autocomplete รายชื่อ Ward / Location จากข้อมูลที่นำเข้า
- **ยาที่ตัดออกจาก KPI** กำหนด **รายเดือน** (ตามมติคณะกรรมการยาแต่ละเดือน) แก้ไขเพิ่ม/ลบภายหลังได้
- ยาที่เคยตั้งแบบ "ทุกเดือน" (`*`) ระบบแตกเป็นรายเดือนให้อัตโนมัติ
- อัปโหลดบัญชียาเพื่ออ่านสีคอลัมน์ **PTTC** (เขียว = นับ, แดง = ตัด) แล้วตั้งค่าตัดยาให้เดือนที่เลือก (โหมด `replace` แทนที่ทั้งชุด / `merge` รวมกับที่ตัดไว้) — ตรวจจากสีพื้นหลังของเซลล์ สีขาว/ไม่มีสี/สีอื่นจะไม่ถูกนับเป็นยาที่ตัด
- เลือกยาเฉพาะที่มีในข้อมูลเดือนนั้น แยกแท็บ ทั้งหมด / นับ / ตัด
- แสดงจำนวนข้อมูลทั้งเดือน เทียบกับที่ใช้ได้ และข้อมูลที่ไม่มีเวลาพยาบาลให้ยาแยกตาม Ward

### 📊 Dashboard
- KPI ตามกลุ่มยาที่เลือก (ค่าเริ่มต้น All Drugs) — ค่าเฉลี่ยเวลาและ % ผ่านคำนวณใหม่ตามกลุ่ม
- แนวโน้ม KPI รายเดือนและรายวัน, สัดส่วน Within / Over / Missing, Average / Median / P90
- แยกตาม Ward, เปรียบเทียบ All Drugs กับแต่ละกลุ่มยา, ค่าเฉลี่ยแต่ละขั้นตอน
- กระจายเวลา 3 ช่วง (≤ 15 / 16–30 / > 30 นาที) และ 10 ออเดอร์ที่ช้าที่สุด
- กรองตามปี / เดือน / Ward / กลุ่มยา
- แจ้งเตือนข้อมูลที่สูญเสียจาก 3 กฎหลัก (ไม่มีเวลาจ่ายยา, ไม่มีเวลาพยาบาลให้ยา, เกินเกณฑ์ชั่วโมง)

### 📑 Monthly Report
- ตารางสรุป Jan–Dec + YTD ต่อปี แยกบล็อก PTTC และ Pharmacy พร้อมแถว % และ Target
- Export เป็น `xlsx` / `csv` (ประเภท `dashboard`, `report`, `orders`) — รายงาน `report` ได้ sheet ต่อ KPI + Data quality + Missing admin by ward + Process steps
- Export `orders` ใส่ `all=1` เพื่อรวมแถวที่ถูกตัดออก (ไว้ตรวจสอบ) สูงสุด 200,000 แถว

### 🧩 Subgroups (กลุ่มยา)
- ค่าเริ่มต้น: `HAD`, `VITAL`, `VACCINE`, `PVI` (Phlebitis/Vesicant/Irritant) และมุมมอง All Drugs
- เพิ่มกลุ่มใหม่ได้ จัดลำดับได้ ผูกยาด้วย **`item_code`** เท่านั้น (ไม่ผูกด้วยชื่อยา)
- นำเข้าบัญชียาเพื่อ map สมาชิกกลุ่มอัตโนมัติจากคอลัมน์ในไฟล์ (`source_column`) — ช่องที่ไม่ว่างและไม่ใช่ `-` / `not had` / `no` / `n` / `0` / `false` ถือว่าอยู่ในกลุ่ม · สมาชิกที่เพิ่มด้วยมือ (`manual`) ไม่ถูกลบตอนนำเข้าใหม่
- กลุ่มระบบลบไม่ได้ (ปิดการใช้งานแทนได้)

### ⚙️ KPI Settings
- กำหนด KPI เองได้: ชื่อ, ขั้นตอน (step), เงื่อนไข (`<=` `<` `>=` `>`), เป้าหมาย, หน่วย (นาที/วินาที), % เป้าหมายผ่าน, กลุ่มยา
- `floor_to_minute` — ตัดวินาทีทิ้งก่อนเทียบเป้า (เหมือนวิธีใน Excel เดิม)
- มี KPI หลัก (`is_primary`) ได้เพียงหนึ่งรายการ
- เวลาที่ไม่มีข้อมูลนับเป็น **Missing** ไม่ใช่ Within/Over

---

## ⏲️ ขั้นตอนกระบวนการ (Process Steps)

ระยะเวลาแต่ละช่วงเก็บในคอลัมน์ `d_*` ของตาราง `orders` **หน่วยวินาที**

| key (`step`)      | คอลัมน์ใน `orders`  | จาก → ถึง                | คำอธิบาย |
|-------------------|---------------------|--------------------------|----------|
| `order_dispense`  | `d_order_dispense`  | `t_order` → `t_dispense` | Doctor → Pharmacy |
| `order_prepare`   | `d_order_prepare`   | `t_order` → `t_prepare`  | Order → ผู้ช่วยจัดยา |
| `prepare_verify`  | `d_prepare_verify`  | `t_prepare` → `t_verify` | จัดยา → ตรวจยา |
| `verify_dispense` | `d_verify_dispense` | `t_verify` → `t_dispense`| ตรวจยา → จ่ายยา |
| `order_nurse`     | `d_order_nurse`     | `t_order` → `t_nurse`    | Doctor → Nurse |
| `total`           | `d_total`           | `t_order` → `t_nurse`    | Total Process Time |
| `dispense_ipd`    | `d_dispense_ipd`    | `t_dispense` → `t_ipd`   | จ่ายยา → IPD รับยา |

### KPI เริ่มต้น

| Code       | ชื่อ                 | Step             | เงื่อนไข |
|------------|----------------------|------------------|----------|
| `PTTC`     | PTTC / Total Process | `order_nurse`    | Doctor → Nurse ≤ 30 นาที |
| `PHARMACY` | Pharmacy Process     | `order_dispense` | Doctor → Pharmacy ≤ 15 นาที |

---

## 🛠️ Stack เทคโนโลยี

| ส่วน        | เทคโนโลยี                                         |
|-------------|---------------------------------------------------|
| Frontend    | React, Vite, Tailwind CSS, React Router           |
| Backend     | Node.js (≥ 18), Express, CORS                     |
| Database    | PostgreSQL (Neon Serverless) ผ่าน `pg`             |
| Auth        | JWT (`jsonwebtoken`), `bcryptjs`                  |
| Import      | `multer` (รับไฟล์), `xlsx` (อ่าน/ส่งออก Excel)     |
| HTTP Client | Fetch API (wrapper ใน `frontend/src/lib/api.js`)   |

---

## 🚀 วิธีติดตั้งและรันระบบ

### 1. ติดตั้ง Dependencies

```bash
npm install
```

> `postinstall` ที่ root จะติดตั้งทั้ง `backend/` และ `frontend/` ให้อัตโนมัติ

### 2. ตั้งค่าไฟล์ `.env` (ที่ `backend/.env`)

```env
# Neon PostgreSQL
DATABASE_URL=postgresql://user:password@your-neon-host.neon.tech/neondb?sslmode=require

# JWT (สุ่มยาวไม่ต่ำกว่า 32 ตัวอักษร)
JWT_SECRET=your_long_random_secret
JWT_EXPIRES_IN=8h

# Server
PORT=4000

# mask ชื่อ / HN / VN-AN ก่อนบันทึกลงฐานข้อมูล (default = true, ตั้ง false เพื่อปิด)
MASK_PATIENT=true
```

> ⚠️ อย่า commit `.env` ขึ้น Git และอย่า hard-code connection string ในโค้ด  
> ⚠️ ถ้าไม่ตั้ง `JWT_SECRET` ระบบจะ login ไม่ได้ (ตอบ 500 "ระบบยังตั้งค่าไม่ครบ")

### 3. สร้างตารางฐานข้อมูล

```bash
npm run migrate
```

`migrate.js` จะรันไฟล์ `.sql` ทั้งหมดในโฟลเดอร์ `backend/sql/` ตามลำดับชื่อไฟล์ โดยข้ามไฟล์ที่เคยรันแล้ว (บันทึกในตาราง `schema_migrations`) และรันแต่ละไฟล์ในธุรกรรมเดียว — ถ้าพังจะ rollback  
หลังรัน `002_data_filter.sql` เป็นครั้งแรก ระบบจะตรวจข้อมูลเดิมใน DB ด้วยกฎคัดกรอง (`reclassifyAll`) ให้อัตโนมัติ 1 ครั้ง  
รายละเอียดตารางดูที่ **[SCHEMA.md](./SCHEMA.md)**

จากนั้นสร้างตาราง `users` และผู้ใช้แรกใน **Neon SQL Editor** (ดูหัวข้อ Default Users)

### 4. รันระบบ (Frontend + Backend พร้อมกัน)

```bash
npm run dev
```

| บริการ   | URL                   | คำอธิบาย        |
|----------|-----------------------|-----------------|
| Frontend | http://localhost:5173 | Vite dev server (proxy `/api` → `http://localhost:4000`) |
| Backend  | http://localhost:4000 | Express API + Neon DB |

ตรวจสอบสถานะ API: `GET http://localhost:4000/api/health` → `{ "ok": true }`

### หากต้องการรันแยก

```bash
npm --prefix backend run dev     # Backend เท่านั้น
npm --prefix frontend run dev    # Frontend เท่านั้น
```

### 5. Production

```bash
npm run build    # build frontend → frontend/dist
npm start        # Express เสิร์ฟ API และ frontend/dist ในพอร์ตเดียว
```

route ที่ไม่ใช่ `/api` จะส่งกลับ `index.html` (รองรับ React Router)

---

## 📁 โครงสร้างโปรเจกต์

```
├── package.json                  # สคริปต์ root: dev / build / start / migrate
├── backend/
│   ├── .env                      # Environment variables (อย่า commit ขึ้น Git)
│   ├── sql/                      # ไฟล์ migration (001_*.sql, 002_data_filter.sql)
│   └── src/
│       ├── server.js             # Express app (mount routes + serve frontend)
│       ├── config.js             # PORT, DATABASE_URL, JWT, MASK_PATIENT
│       ├── db.js                 # PostgreSQL pool / query helper
│       ├── migrate.js            # รันไฟล์ใน backend/sql/ + บันทึก schema_migrations
│       ├── middleware/
│       │   └── auth.js           # requireAuth, requireRole, ALLOWED_ROLES
│       ├── routes/
│       │   ├── auth.js           # login / me
│       │   ├── importer.js       # นำเข้า Excel + preview + commit + history
│       │   ├── analytics.js      # meta / dashboard / report / export
│       │   ├── filter.js         # Data Filter / ยาที่ตัดออก / บัญชียา (สี PTTC)
│       │   └── admin.js          # KPI / Subgroups / Drug master
│       ├── services/
│       │   ├── importService.js  # วิเคราะห์ sheet + บันทึก batch
│       │   ├── filterService.js  # เกณฑ์คัดกรอง + reclassify + drug exclusions
│       │   ├── kpiService.js     # คำนวณ KPI + data quality
│       │   ├── reportService.js  # Dashboard / Report / Meta
│       │   └── exportService.js  # ส่งออก xlsx / csv
│       └── lib/
│           ├── parse.js          # อ่าน workbook + auto mapping
│           ├── pttcList.js       # อ่านสีคอลัมน์ PTTC จากบัญชียา
│           ├── format.js         # ค่าคงที่การแสดงผล (MONTHS)
│           ├── rules.js          # กฎคัดกรอง (REASONS, classify)
│           └── steps.js          # นิยาม process steps
├── frontend/
│   ├── vite.config.js            # port 5173 + proxy /api → backend
│   ├── public/logobsk.png
│   └── src/
│       ├── App.jsx               # Layout + sidebar + routes
│       ├── lib/api.js            # HTTP client
│       ├── auth/
│       │   ├── AuthContext.jsx   # สถานะล็อกอิน
│       │   └── UserMenu.jsx      # เมนูผู้ใช้
│       ├── components/
│       │   ├── ui.jsx            # ErrorBox, Loading ฯลฯ
│       │   └── DrugPicker.jsx    # เลือกยานับ/ตัด
│       └── pages/
│           ├── Dashboard.jsx     # ภาพรวม KPI
│           ├── Report.jsx        # Monthly Report
│           ├── Import.jsx        # นำเข้า Excel
│           ├── DataFilter.jsx    # คัดกรอง + ยาที่ตัดออก
│           ├── Subgroups.jsx     # จัดการกลุ่มยา
│           └── KpiAdmin.jsx      # ตั้งค่า KPI
└── SCHEMA.md                     # Database schema & API reference
```

---

## 🔌 API Overview

Base URL: `http://localhost:4000/api`  
ทุก endpoint ต้องส่ง `Authorization: Bearer <token>` ยกเว้น `GET /api/health` และ `POST /api/auth/login`  
Error ตอบกลับเป็น `{ "error": "ข้อความ" }` พร้อม HTTP status ที่เหมาะสม

| Method | Endpoint                               | คำอธิบาย |
|--------|----------------------------------------|----------|
| GET    | `/api/health`                          | ตรวจสถานะ API + DB (สาธารณะ) |
| POST   | `/api/auth/login`                      | เข้าสู่ระบบ (สาธารณะ) |
| GET    | `/api/auth/me`                         | ตรวจ token + สถานะบัญชี |
| GET    | `/api/meta`                            | ข้อมูลตั้งต้นของ frontend |
| GET    | `/api/dashboard`                       | ข้อมูล Dashboard (card, รายเดือน, รายวัน, Ward, distribution, top slow, steps, เทียบกลุ่มยา) |
| GET    | `/api/report`                          | ข้อมูล Monthly Report (ต่อ KPI: รายเดือน + ปี + เวลาเฉลี่ยแต่ละขั้น + เทียบปีก่อน) |
| GET    | `/api/export`                          | ส่งออก xlsx / csv |
| POST   | `/api/import/upload`                   | อัปโหลดไฟล์ Excel |
| POST   | `/api/import/preview`                  | วิเคราะห์ + คัดกรองก่อนบันทึก |
| POST   | `/api/import/commit`                   | บันทึกข้อมูลเข้าฐานข้อมูล |
| GET    | `/api/import/history`                  | ประวัติการนำเข้า |
| DELETE | `/api/import/:id`                      | ลบ batch (rollback) |
| GET    | `/api/data-quality`                    | จำนวนทั้งหมด / ใช้ได้ / ตัดออก |
| GET    | `/api/filter/settings`                 | อ่านเกณฑ์คัดกรอง |
| PUT    | `/api/filter/settings`                 | แก้เกณฑ์ + ตรวจข้อมูลเดิมใหม่ |
| POST   | `/api/filter/reclassify`               | ตรวจข้อมูลเดิมใหม่ทั้งหมด |
| GET    | `/api/filter/locations`                | รายชื่อ Ward / Location |
| GET    | `/api/filter/drugs`                    | รายการยาในข้อมูล (สำหรับเลือกตัด) |
| GET    | `/api/filter/drug-exclusions`          | ยาที่ตัดออกทั้งหมด (รายเดือน) |
| PUT    | `/api/filter/drug-exclusions`          | ตั้งยาที่ตัดออกของเดือน |
| POST   | `/api/filter/drug-exclusions/expand-all` | แปลง `*` เป็นรายเดือน |
| POST   | `/api/filter/pttc-list/upload`         | อัปโหลดบัญชียา (สี PTTC) |
| POST   | `/api/filter/pttc-list/apply`          | ตั้งยาสีแดงเป็นยาที่ตัด |
| GET    | `/api/kpis`                            | รายการ KPI + steps |
| POST   | `/api/kpis`                            | เพิ่ม KPI |
| PUT    | `/api/kpis/:id`                        | แก้ไข KPI |
| DELETE | `/api/kpis/:id`                        | ลบ KPI |
| GET    | `/api/subgroups`                       | รายการกลุ่มยา |
| POST   | `/api/subgroups`                       | เพิ่มกลุ่มยา |
| PUT    | `/api/subgroups-order`                 | จัดลำดับกลุ่มยา |
| PUT    | `/api/subgroups/:id`                   | แก้ไขกลุ่มยา |
| DELETE | `/api/subgroups/:id`                   | ลบกลุ่มยา (ยกเว้นกลุ่มระบบ) |
| GET    | `/api/subgroups/:id/items`             | สมาชิกกลุ่มยา (ค้นหา/แบ่งหน้า) |
| POST   | `/api/subgroups/:id/items`             | เพิ่มสมาชิกด้วย item code |
| DELETE | `/api/subgroups/:id/items`             | ลบสมาชิก |
| GET    | `/api/drugs/summary`                   | สรุปบัญชียา |
| GET    | `/api/drugs/search`                    | ค้นหายา (autocomplete) |
| POST   | `/api/drugs/import`                    | นำเข้าบัญชียา + map กลุ่มอัตโนมัติ |

> ดูรายละเอียด request/response body, schema และ ER Diagram ทั้งหมดได้ที่ **[SCHEMA.md](./SCHEMA.md)**

---

## 👤 Default Users

> ตาราง `users` สร้างและเพิ่มผู้ใช้ผ่าน **Neon SQL Editor เท่านั้น**

| Role       | คำอธิบาย |
|------------|----------|
| pharmacist | เภสัชกร — Role แรกที่เข้าระบบได้ (เพิ่ม Role อื่นภายหลังที่ `ALLOWED_ROLES`) |

Password ถูก hash ด้วย bcrypt ก่อนบันทึก (`bcryptjs` ตรวจสอบได้)

**SQL สำหรับสร้างตาราง `users` ใน Neon:**
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'pharmacist',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (lower(username));
```

**SQL สำหรับเพิ่มผู้ใช้ใหม่:**
```sql
INSERT INTO users (username, password_hash, full_name, role)
VALUES (
  'pharmacist01',
  crypt('your_password', gen_salt('bf')),
  'ภก.ชื่อ นามสกุล',
  'pharmacist'
);
```

**ปิดการใช้งานบัญชี:**
```sql
UPDATE users SET is_active = FALSE WHERE lower(username) = 'pharmacist01';
```

---

## 📋 Database & Schema

ระบบใช้ **PostgreSQL บน Neon** ประกอบด้วย 10 ตาราง:

`orders` · `import_batches` · `drug_exclusions` · `app_settings`  
`subgroups` · `subgroup_items` · `drug_master` · `kpi_definitions`  
`users` (สร้างใน Neon เอง) · `schema_migrations` (สร้างโดย `migrate.js`)

> ผูกกลุ่มยา / ยาที่ตัดออก ด้วย `item_code` เท่านั้น  
> ระบบคำนวณ KPI ใช้เฉพาะแถวที่ `excl_reason IS NULL` และยาที่ไม่อยู่ใน `drug_exclusions` ของเดือนนั้น  
> ดูโครงสร้างตาราง, column types, relation และ ER Diagram ได้ที่ **[SCHEMA.md](./SCHEMA.md)**

---

> 📌 v3.0.0 · Pharmacy Process Time KPI · ฝ่ายเภสัชกรรม โรงพยาบาลกรุงเทพสิริโรจน์  
> ข้อมูลผู้ป่วยเป็นความลับ — ระบบ mask ชื่อ / HN / VN-AN ก่อนบันทึกโดยค่าเริ่มต้น (`MASK_PATIENT`)