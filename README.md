# Pharmacy Process Time KPI

ระบบคำนวณและแสดงผล Pharmacy Process Time KPI แทนการคำนวณใน Excel
**React + Vite + Tailwind + Recharts** · **Node.js + Express** · **PostgreSQL (Neon)** · อ่านไฟล์ `.xls` / `.xlsx`

> ⚠️ ใช้กับ **demo database เท่านั้น** (ไม่ใช่ฐานข้อมูลโรงพยาบาลจริง) — ชื่อ/HN/VN-AN ผู้ป่วยถูก mask ตอน import

## ติดตั้งและรัน

ต้องมี Node.js 18 ขึ้นไป

```bash
# 1) ติดตั้งทุกอย่าง (root + backend + frontend)
npm install

# 2) ตั้งค่า database
cp backend/.env.example backend/.env
#    แล้วแก้ DATABASE_URL ใน backend/.env เป็น connection string ของ Neon
#    (ห้าม commit ไฟล์ .env — .gitignore กันไว้ให้แล้ว)

# 3) สร้างตาราง + ข้อมูลตั้งต้น (subgroup 4 กลุ่ม, KPI PTTC ≤30 / Pharmacy ≤15)
npm run migrate

# 4) รันโหมดพัฒนา  →  เปิด http://localhost:5173
npm run dev
```

รัน production (เสิร์ฟ frontend ผ่าน Express ที่ port เดียว):

```bash
npm run build && npm start      # http://localhost:4000
```

### สร้าง Neon database
1. สมัคร https://neon.tech → New Project
2. คัดลอก **Connection string** (แบบ `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`) ใส่ `DATABASE_URL`

## ลำดับการใช้งานครั้งแรก
1. **Subgroups** → “นำเข้าบัญชียา” (`บัญชียา_xx.xls`) — ระบบ map ยาเข้ากลุ่ม HAD / Vital / Vaccine / Phlebitis ด้วย **ItemCode** อัตโนมัติ
2. **Import Excel** → เลือกไฟล์ order (เช่น `Jun_2026.xls`) → เลือกชีต → ตรวจ column mapping → Preview → Import
3. ดูผลที่ **Dashboard** และ **Monthly Report**

## คัดกรองข้อมูลดิบอัตโนมัติ (ไม่ต้องกรองใน Excel)
อัปโหลดไฟล์ raw จากระบบได้เลย เมื่อกด Import ระบบจะคัดกรองให้ตามกฎนี้ (ตั้งค่าได้ที่เมนู **Data Filter**)

| ลำดับ | กฎ | ผล |
|---|---|---|
| 1 | Ward/Location มีคำว่า Airport / Rawai / Khaolak | ตัดออกทุกเดือน |
| 2 | ไม่มีเวลาเภสัชจ่ายยา (dispense) | ตัดออก |
| 3 | ไม่มีเวลาพยาบาลให้ยา (admin) | ตัดออก + นับเป็นข้อมูลสูญหายแยกตาม Ward |
| 4 | เวลาย้อนหลัง (พยาบาลให้ยา/เภสัชจ่ายยา ก่อนเวลาสั่ง) | ตัดออก (คำนวณระยะเวลาไม่ได้) |
| 5 | สั่งยา → พยาบาลให้ยา ตั้งแต่ 8 ชม.ขึ้นไป | ตัดออก (7:59:59 ยังใช้; ปรับจำนวนชั่วโมงได้) |
| – | เวลาเภสัชตรวจยาว่าง | ใช้เวลาเภสัชจ่ายยาแทน |
| – | ยาที่ user เลือกตัดออก (Data Filter → ยาที่ตัดออก) | ไม่นำมาคำนวณ KPI — กำหนดรายเดือนหรือทุกเดือน มีผลทันที |

- แถวหนึ่งมีเหตุผลที่ถูกตัดเพียงข้อเดียว ตามลำดับในตาราง (เช่น แถวของ Khaolak Clinic ที่ไม่มีเวลาพยาบาลให้ยา นับเป็น “Ward ถูกตัดออก” ไม่นับเป็นข้อมูลสูญหาย)
- แถวที่ถูกตัดออก **ยังถูกบันทึกไว้** เพื่อนับจำนวน แต่ KPI ทุกตัว (Dashboard / Report / Export) คำนวณจากแถว “ใช้ได้” เท่านั้น
- **ลำดับ Import:** อัปโหลด → ตรวจ mapping → ดูผลคัดกรอง (Preview) → **เลือกยาที่ไม่นำมาคิด KPI** → บันทึก — ข้อมูลเข้า Dashboard / Monthly Report พร้อมกับยาที่ตัดแล้วเท่านั้น (ยาที่เคยตัดไว้ของเดือนนั้นถูกติ๊กไว้ให้ล่วงหน้า)
- ตัดยาเพิ่ม/นำกลับมาคิดภายหลังได้ที่เมนู **Data Filter** (รายเดือนหรือทุกเดือน) มีผลทันที
- Monthly Report แสดง **ข้อมูลทั้งหมด / ใช้ได้ / ตัดออกตามเหตุผล** รายเดือน และตาราง **ข้อมูลที่ไม่มีเวลาพยาบาลให้ยาแยกตาม Ward**; Dashboard แสดง “ข้อมูลสูญหาย” ในกล่องรายการที่ต้องติดตาม (ไม่มีเวลาจ่ายยา / ไม่มีเวลาพยาบาล / นานเกินกำหนด)
- แก้เกณฑ์ (จำนวนชั่วโมง / ward ที่ตัด) แล้วระบบตรวจข้อมูลเดิมใน DB ใหม่ทันที ไม่ต้อง import ซ้ำ
- แถวท้ายรายงาน (“ผู้พิมพ์ … .rpt”) ถูกข้ามอัตโนมัติ; เวลาของขั้นตอนอื่นที่ผิดรูปแบบ (เช่นปี 1773) ถือว่าไม่มีข้อมูลและ flag ไว้ ไม่ทำให้ทั้งแถวหาย

### อัปเกรดจากเวอร์ชันก่อนหน้า
```bash
npm run migrate    # เพิ่มตาราง/คอลัมน์ใหม่ (002_data_filter.sql) และตรวจข้อมูลเดิมใน DB ด้วยกฎใหม่หนึ่งครั้ง
```
ข้อมูลที่ import ไว้แล้วจะถูกตรวจด้วยกฎเดียวกัน (ยกเว้นการเติมเวลาตรวจยาจากเวลาจ่ายยา ซึ่งมีผลกับ import ใหม่เท่านั้น)

## กฎการคำนวณ
| Step | จาก → ถึง |
|---|---|
| Doctor → Pharmacy | เวลาแพทย์สั่ง → เภสัชจ่ายยา |
| Order → Pharmacist Prepare | แพทย์สั่ง → ผช.เภสัชจัดยา |
| Prepare → Verify | ผช.จัดยา → เภสัชตรวจยา |
| Verify → Dispense | เภสัชตรวจยา → เภสัชจ่ายยา |
| Doctor → Nurse | แพทย์สั่ง → พยาบาลให้ยา |
| Total Process Time | แพทย์สั่ง → พยาบาลให้ยา |
| IPD Receive Time | เภสัชจ่ายยา → บันทึกรับยา IPD |

- **ไม่มี timestamp** ที่ต้องใช้ → ไม่คำนวณ step นั้น (นับเป็น “ไม่ครบ timestamp” ไม่นับผ่าน/ไม่ผ่าน)
- **ข้อมูลผิดปกติ (flag)**: timestamp ย้อนหลัง/duration ติดลบ (ไม่นำไปคำนวณ) และ duration เกิน 24 ชม. (ยังนับ แต่ flag เพื่อตรวจสอบ)
- **เทียบ target แบบ Excel เดิม**: ตัดวินาทีทิ้งเป็นนาทีเต็มก่อนเทียบ (30:59 = 30 นาที → ผ่าน ≤30) — ปิดได้ต่อ KPI ในหน้า KPI Settings
- Average แสดง `mm:ss` (ปัดวินาที), Median และ P90 คำนวณจากวินาทีจริง
- เดือนที่ไม่มีข้อมูลแสดง `-` ไม่มี `#DIV/0!`

### ผลทดสอบกับ `Jun_2026.xls` (ชีต `Sheet1 (4)`)
| KPI | Orders | ผ่าน | ไม่ผ่าน | % | Avg |
|---|---|---|---|---|---|
| PTTC (≤30) | 1,277 | 959 | 318 | 75.10% | 25:01 |
| Pharmacy (≤15) | 1,277 | 1,253 | 24 | 98.12% | 04:33 |

ตรงกับตาราง Excel เดิม

## Import
- ไฟล์หลายชีต: ระบบเลือกชีตที่หัวตารางตรงมากที่สุดให้ แต่เลือกเองได้ (ไฟล์ `Jun_2026.xls` มี 4 ชีต เนื้อหาซ้อนกัน — เลือกชีตเดียวต่อการ import และอย่า import หลายชีตของช่วงเวลาเดียวกันซ้ำ)
- **Duplicate key** = `VN/AN + PN + Item code + เวลาสั่งยา` → import ไฟล์เดิมซ้ำจะถูกข้ามทั้งหมด
- แถวที่ key ซ้ำกัน “ภายในไฟล์เดียวกัน” ถือเป็นรายการยาซ้ำจริงและนับทุกแถว (ตรงกับ Excel เดิม)
- โหมดเมื่อซ้ำกับข้อมูลเดิม: **ข้าม** (ค่าเริ่มต้น) หรือ **เขียนทับ** (ต้องติ๊กยืนยันก่อนทุกครั้ง)
- มี Import History และปุ่ม “ลบ batch” (rollback)
- แถวที่ไม่มี item_code / เวลาสั่ง / วันเวลาผิดรูปแบบ → นับเป็น error และถูกข้าม

## หน้าจอ
| หน้า | ทำอะไร |
|---|---|
| Dashboard | KPI cards, Trend รายวัน/รายเดือน, % ผ่านเทียบเป้า, Avg รายเดือนเทียบ Target, Process time รายขั้นตอน, Distribution (≤15 / 16–30 / >30), All vs Subgroup, Ward breakdown, Top 10 ช้าสุด, Export CSV/Excel — เลือก Year / Month / Subgroup / Ward / KPI ได้ |
| Monthly Report | ตาราง Jan–Dec + Year Total/Avg แยกตาม KPI (Total, ผ่าน, ไม่ผ่าน, KPI %, Avg, Median, P90, Target) + Export |
| Import Excel | upload → mapping → preview → import → history |
| Data Filter | ตั้งเกณฑ์คัดกรองข้อมูลดิบ (ชั่วโมงสูงสุด, ward ที่ตัด) และเลือกยาที่ไม่นำมาคำนวณ KPI รายเดือน |
| Subgroups | นำเข้าบัญชียา, เพิ่ม/แก้/ปิด subgroup, เพิ่ม-ลบยาในกลุ่มด้วย ItemCode |
| KPI Settings | เพิ่ม/แก้/ลบ KPI: ชื่อ, ขั้นตอน, เงื่อนไข (`<= < >= >`), target, หน่วย, % เป้าหมาย, subgroup |

### เพิ่ม Subgroup ใหม่
Subgroups → **+ เพิ่ม Subgroup** แล้วเลือกวิธี map ยา
- ใส่ชื่อคอลัมน์ในบัญชียา (เช่น `Antibiotic`) ที่ช่อง “คอลัมน์ในบัญชียา” → ครั้งต่อไปที่นำเข้าบัญชียา ระบบ map ให้อัตโนมัติ (ค่าว่าง / `-` / `not HAD` = ไม่ใช่สมาชิก)
- หรือวาง ItemCode เองทีละหลายรายการ (รายการที่เพิ่มเองไม่ถูกลบเมื่อนำเข้าบัญชียาใหม่)

## โครงสร้างโปรเจกต์
```
backend/
  sql/001_init.sql            schema + ข้อมูลตั้งต้น
  src/migrate.js              ตัวรัน migration
  src/services/kpiService.js  คำนวณ duration + สถิติ KPI (SQL percentile)
  src/services/importService.js  แปลง/ตรวจ/บันทึก Excel
  src/services/reportService.js  dashboard & report
  src/services/exportService.js  CSV/Excel
  src/routes/                 analytics, importer, admin (KPI / subgroup / drugs)
frontend/src/pages/           Dashboard, Report, Import, Subgroups, KpiAdmin
```

## API หลัก
`GET /api/meta` · `GET /api/dashboard?year&month&subgroup&ward&kpi` · `GET /api/report?year&subgroup&ward`
`GET /api/export?type=dashboard|report|orders&format=csv|xlsx&...` (`type=orders&all=1` รวมแถวที่ถูกตัดออกพร้อมเหตุผล)
`GET /api/data-quality?year&month&subgroup&ward` · `GET|PUT /api/filter/settings` · `GET /api/filter/drugs` · `GET|PUT /api/filter/drug-exclusions`
`POST /api/import/upload` → `/preview` → `/commit` · `GET /api/import/history` · `DELETE /api/import/:id`
`/api/kpis` (CRUD) · `/api/subgroups` (CRUD + `/:id/items`) · `POST /api/drugs/import`

## หมายเหตุด้าน Security
- ไม่มี password / connection string ใน source code — อ่านจาก `backend/.env` เท่านั้น
- `MASK_PATIENT=true` (ค่าเริ่มต้น): เก็บชื่อเป็นตัวอักษรแรก + `*****`, HN และ VN/AN เก็บเฉพาะ 3 ตัวท้าย — ค่าที่ใช้ตรวจ duplicate เป็น hash จากค่าจริง และไม่ถูกเก็บ
- ระบบนี้ไม่มี login — ใช้ใน demo เท่านั้น ก่อนนำไปใช้จริงต้องเพิ่ม authentication
- ไฟล์ที่อัปโหลดอยู่ใน memory ชั่วคราว 30 นาทีระหว่าง preview → import ไม่ถูกเขียนลงดิสก์
