// นิยามขั้นตอน Process Time (from/to = timestamp ใน table orders, col = คอลัมน์ duration หน่วยวินาที)
export const STEPS = [
  { key: 'order_dispense',  col: 'd_order_dispense',  from: 't_order',    to: 't_dispense', label: 'Doctor → Pharmacy',          short: 'สั่งยา → เภสัชจ่าย' },
  { key: 'order_prepare',   col: 'd_order_prepare',   from: 't_order',    to: 't_prepare',  label: 'Order → Pharmacist Prepare', short: 'สั่งยา → ผช.จัดยา' },
  { key: 'prepare_verify',  col: 'd_prepare_verify',  from: 't_prepare',  to: 't_verify',   label: 'Prepare → Verify',           short: 'จัดยา → ตรวจยา' },
  { key: 'verify_dispense', col: 'd_verify_dispense', from: 't_verify',   to: 't_dispense', label: 'Verify → Dispense',          short: 'ตรวจยา → จ่ายยา' },
  { key: 'order_nurse',     col: 'd_order_nurse',     from: 't_order',    to: 't_nurse',    label: 'Doctor → Nurse',             short: 'สั่งยา → พยาบาลให้ยา' },
  { key: 'total',           col: 'd_total',           from: 't_order',    to: 't_nurse',    label: 'Total Process Time',         short: 'Total (order → nurse)' },
  { key: 'dispense_ipd',    col: 'd_dispense_ipd',    from: 't_dispense', to: 't_ipd',      label: 'IPD Receive Time',           short: 'จ่ายยา → IPD รับยา' },
];
export const STEP_BY_KEY = Object.fromEntries(STEPS.map((s) => [s.key, s]));
export const OPS = { '<=': '<=', '<': '<', '>=': '>=', '>': '>' };
