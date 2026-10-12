export async function api(path, { method, body, form } = {}) {
  const hasBody = form !== undefined || body !== undefined;
  const opt = { method: method || (hasBody ? 'POST' : 'GET'), headers: {} };

  if (form) {
    // FormData: ห้ามตั้ง Content-Type เอง เบราว์เซอร์จะใส่ boundary ให้
    opt.body = form;
  } else if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, opt);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => {
    if (v !== '' && v != null && v !== 'all') p.set(k, v);
  });
  return p.toString();
};