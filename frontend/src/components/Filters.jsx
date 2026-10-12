import { Field } from './ui.jsx';
import { MONTHS } from '../lib/format.js';

export default function Filters({ meta, value, onChange, showMonth = true, showKpi = false }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Year">
        <select className="input" value={value.year} onChange={set('year')}>
          {meta.years.length === 0 && <option value="">-</option>}
          {meta.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </Field>
      {showMonth && (
        <Field label="Month">
          <select className="input" value={value.month} onChange={set('month')}>
            <option value="">ทั้งปี</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Field>
      )}
      <Field label="Subgroup">
        <select className="input" value={value.subgroup} onChange={set('subgroup')}>
          <option value="all">All Drugs</option>
          {meta.subgroups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Ward / Location">
        <select className="input max-w-[220px]" value={value.ward} onChange={set('ward')}>
          <option value="all">ทุก Ward</option>
          {meta.wards.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
      </Field>
      {showKpi && (
        <Field label="KPI">
          <select className="input" value={value.kpi} onChange={set('kpi')}>
            {meta.kpis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}
