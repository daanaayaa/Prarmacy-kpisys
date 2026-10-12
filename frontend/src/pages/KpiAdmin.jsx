import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useMeta } from '../App.jsx';
import { Badge, ErrorBox, Field, Loading, Panel } from '../components/ui.jsx';
import PageHead from '../components/PageHead.jsx';
import { targetLabel } from '../lib/format.js';

const blank = { name: '', description: '', step: 'order_nurse', operator: '<=', target: 30, unit: 'minutes', floor_to_minute: true, pass_rate_goal: 90, subgroup_id: '', is_primary: false, active: true, sort_order: 100 };

export default function KpiAdmin() {
  const { refresh } = useMeta();
  const [data, setData] = useState(null);
  const [subs, setSubs] = useState([]);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState(null);

  const load = () => Promise.all([api('/kpis'), api('/subgroups')]).then(([k, s]) => { setData(k); setSubs(s); }).catch(setError);
  useEffect(() => { load(); }, []);

  const save = async () => {
    setError(null);
    try {
      if (edit.id) await api(`/kpis/${edit.id}`, { method: 'PUT', body: edit });
      else await api('/kpis', { method: 'POST', body: edit });
      setEdit(null); await load(); refresh();
    } catch (e) { setError(e); }
  };
  const del = async (k) => {
    if (!confirm(`ลบ KPI "${k.name}" ?`)) return;
    await api(`/kpis/${k.id}`, { method: 'DELETE' }); await load(); refresh();
  };
  if (!data) return <Loading />;
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const stepLabel = (key) => data.steps.find((s) => s.key === key)?.label || key;

  return (
    <>
      <PageHead title="KPI Settings" subtitle="กำหนดชื่อ KPI, ขั้นตอนที่ใช้คำนวณ, target, หน่วย, เงื่อนไขผ่าน/ไม่ผ่าน และ subgroup — แก้ได้โดยไม่ต้องแก้ code">
        <button className="btn btn-primary" onClick={() => setEdit({ ...blank })}>+ เพิ่ม KPI</button>
      </PageHead>
      <ErrorBox error={error} />

      <Panel>
        <div className="-m-4 overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr><th className="th">KPI</th><th className="th">ขั้นตอนที่ใช้</th><th className="th">เงื่อนไขผ่าน</th><th className="th">เป้า % ผ่าน</th><th className="th">Subgroup</th><th className="th">สถานะ</th><th className="th" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.kpis.map((k) => (
                <tr key={k.id} className={k.active ? '' : 'text-slate-400'}>
                  <td className="td"><div className="font-medium">{k.name}</div><div className="text-xs text-slate-400">{k.description}</div></td>
                  <td className="td">{stepLabel(k.step)}</td>
                  <td className="td tabular-nums">{targetLabel(k)}{k.unit === 'minutes' && !k.floor_to_minute && <span className="ml-1 text-xs text-slate-400">(ไม่ตัดวินาที)</span>}</td>
                  <td className="td tabular-nums">{k.pass_rate_goal != null ? `${k.pass_rate_goal}%` : '-'}</td>
                  <td className="td">{k.subgroup_name || 'All'}</td>
                  <td className="td space-x-1">{k.is_primary && <Badge tone="blue">หลัก</Badge>}{k.active ? <Badge tone="green">ใช้งาน</Badge> : <Badge>ปิด</Badge>}</td>
                  <td className="td space-x-2 text-right whitespace-nowrap">
                    <button className="btn" onClick={() => setEdit({ ...k, subgroup_id: k.subgroup_id || '' })}>แก้ไข</button>
                    <button className="btn btn-danger" onClick={() => del(k)}>ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="text-xs text-slate-500">
        หมายเหตุ: เมื่อหน่วยเป็น “นาที” และเปิด “ตัดวินาทีทิ้ง” ระบบจะเทียบค่าเป็นนาทีเต็ม (เช่น 30:59 ถือเป็น 30 นาที → ผ่านเกณฑ์ ≤ 30) เหมือนสูตร Excel เดิม ·
        ถ้าเลือก Subgroup ใน KPI จะคำนวณเฉพาะยากลุ่มนั้นเสมอ (ซ้อนกับ filter ในหน้า Dashboard)
      </p>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setEdit(null)}>
          <div className="max-h-full w-full max-w-xl overflow-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold">{edit.id ? 'แก้ไข KPI' : 'เพิ่ม KPI'}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Field label="ชื่อ KPI"><input className="input" value={edit.name} onChange={set('name')} /></Field></div>
              <div className="col-span-2"><Field label="คำอธิบาย"><input className="input" value={edit.description || ''} onChange={set('description')} /></Field></div>
              <div className="col-span-2">
                <Field label="ขั้นตอนที่ใช้คำนวณ">
                  <select className="input" value={edit.step} onChange={set('step')}>{data.steps.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                </Field>
              </div>
              <Field label="เงื่อนไขผ่าน">
                <select className="input" value={edit.operator} onChange={set('operator')}>{['<=', '<', '>=', '>'].map((o) => <option key={o}>{o}</option>)}</select>
              </Field>
              <Field label="Target"><input type="number" step="any" className="input" value={edit.target} onChange={set('target')} /></Field>
              <Field label="หน่วย">
                <select className="input" value={edit.unit} onChange={set('unit')}><option value="minutes">นาที</option><option value="seconds">วินาที</option></select>
              </Field>
              <Field label="เป้าหมาย % ผ่าน KPI"><input type="number" step="any" className="input" value={edit.pass_rate_goal ?? ''} onChange={set('pass_rate_goal')} /></Field>
              <div className="col-span-2">
                <Field label="Subgroup (ว่าง = ยาทุกรายการ)">
                  <select className="input" value={edit.subgroup_id} onChange={set('subgroup_id')}><option value="">All Drugs</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                </Field>
              </div>
              <Field label="ลำดับแสดง"><input type="number" className="input" value={edit.sort_order} onChange={set('sort_order')} /></Field>
              <div className="flex flex-col justify-end gap-1.5 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={edit.floor_to_minute} onChange={set('floor_to_minute')} /> ตัดวินาทีทิ้งก่อนเทียบ target</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={edit.is_primary} onChange={set('is_primary')} /> KPI หลัก (ค่าเริ่มต้น Dashboard)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={edit.active} onChange={set('active')} /> เปิดใช้งาน</label>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn" onClick={() => setEdit(null)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={save}>บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
