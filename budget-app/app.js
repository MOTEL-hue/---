'use strict';
/* תקציב המשפחה — אפליקציה אחת, עובדת גם בלי אינטרנט. הנתונים נשמרים במכשיר ומסתנכרנים לשרת (אם הוגדר). */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('he-IL') + ' ₪';
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- שנים: עברית / לועזית ---------- */
const GEM = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
function hebLabel(y) { // 5787 -> תשפ"ז
  let n = y % 1000, s = '';
  for (const [v, l] of GEM) while (n >= v && !(n === 15 || n === 16)) { s += l; n -= v; }
  if (n === 15) s += 'טו'; if (n === 16) s += 'טז';
  return s.length > 1 ? s.slice(0, -1) + '"' + s.slice(-1) : s + "'";
}
function hebNum(label) { // תשפ"ה -> 5785
  const L = String(label).trim(); if (!/^ת[א-ת"'״׳]*$/.test(L)) return 0;
  let t = 0; for (const ch of L) { const g = GEM.find(x => x[1] === ch); if (g) t += g[0]; }
  return 5000 + t;
}
const hebYearOf = d => +new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric' }).formatToParts(new Date(d + 'T12:00:00')).find(p => p.type === 'year').value;
const hebMonthOf = d => new Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long' }).format(new Date(d + 'T12:00:00'));
const hebDateStr = d => new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00'));
const yearOf = d => S.settings.calendar === 'heb' ? hebYearOf(d) : +d.slice(0, 4);
const yearLabel = y => S.settings.calendar === 'heb' ? hebLabel(y) : String(y);
const HEB_MONTHS = ['תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול'];

/* ---------- מצב ושמירה ---------- */
const COLL = ['plan', 'yearly', 'debts', 'accounts', 'tx', 'bizs', 'orders', 'bizExp', 'invoices', 'reminders'];
const KEY = 'budget.state.v1';
let S = load();
function blank() {
  const d = {}; COLL.forEach(c => d[c] = []);
  return { v: 1, settings: { family: '', calendar: 'heb', tithe: 10, users: [], sync: { url: '', key: '', email: '' }, last: 0 }, data: d };
}
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.data) { COLL.forEach(c => s.data[c] ||= []); return s; } } catch (e) { } return blank(); }
let saveT; function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('אין מקום לשמור במכשיר'); } scheduleSync(); }, 150); }
const live = c => S.data[c].filter(x => !x.del);
function put(c, item) { const a = S.data[c]; item.u = Date.now(); const i = a.findIndex(x => x.id === item.id); if (i < 0) a.push(item); else a[i] = item; save(); }
function remove(c, id) { const x = S.data[c].find(x => x.id === id); if (x) { x.del = true; x.u = Date.now(); save(); } }

/* ---------- סנכרון (Supabase) — מיזוג לפי פריט, האחרון מנצח ---------- */
let syncT, syncing = false, TOK = null;
function scheduleSync() { clearTimeout(syncT); syncT = setTimeout(sync, 2500); }
function merge(local, remote) {
  COLL.forEach(c => { const m = new Map(); [...(local[c] || []), ...(remote[c] || [])].forEach(x => { const o = m.get(x.id); if (!o || (x.u || 0) > (o.u || 0)) m.set(x.id, x); }); local[c] = [...m.values()]; });
}
/* כניסה לחשבון בענן (Supabase Auth). הנתונים נשמרים לפי המשתמש ורק הוא קורא אותם (RLS). */
async function cloudLogin(email, pass, signup) {
  const { url, key } = S.settings.sync;
  const r = await fetch(`${url}/auth/v1/${signup ? 'signup' : 'token?grant_type=password'}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
  const j = await r.json(); if (!r.ok || !j.access_token) throw new Error(j.msg || j.error_description || 'נכשל');
  TOK = j.access_token; try { sessionStorage.setItem('budget.tok', TOK); } catch (e) { } return TOK;
}
async function sync(manual) {
  const { url, key } = S.settings.sync; if (!url || !key || !navigator.onLine || syncing) { if (manual) toast('חסרות הגדרות סנכרון או אין אינטרנט'); return; }
  if (!TOK) try { TOK = sessionStorage.getItem('budget.tok'); } catch (e) { }
  if (!TOK) { if (manual) toast('צריך להתחבר לענן'); return; }
  syncing = true; const H = { apikey: key, Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' };
  try {
    const r = await fetch(`${url}/rest/v1/snapshots?select=data`, { headers: H });
    if (r.status === 401) { TOK = null; try { sessionStorage.removeItem('budget.tok'); } catch (e) { } throw 0; }
    if (!r.ok) throw 0; const rows = await r.json();
    if (rows[0]?.data) { merge(S.data, rows[0].data); const ru = rows[0].data.settings?.users; if (ru?.length) { const have = new Set(S.settings.users.map(u => u.name)); ru.forEach(u => { if (!have.has(u.name)) S.settings.users.push(u); }); } }
    const body = { data: { ...S.data, settings: { users: S.settings.users } }, updated_at: new Date().toISOString() };
    const p = await fetch(`${url}/rest/v1/snapshots?on_conflict=user_id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(body) });
    if (!p.ok) throw 0; S.settings.last = Date.now(); localStorage.setItem(KEY, JSON.stringify(S)); if (manual) toast('הסנכרון הצליח'); render();
  } catch (e) { if (manual) toast('הסנכרון נכשל. בדוק כתובת, מפתח והתחברות'); }
  syncing = false;
}
addEventListener('online', () => sync());

/* ---------- משתמשים והרשאות ---------- */
const ROLES = { admin: 'מנהל (הכול)', home: 'בית בלבד (בלי עסקים וחובות)', view: 'צפייה בלבד' };
let ME = null;
async function hash(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bud:' + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const canSee = tab => ME && (ME.role === 'admin' || !['biz', 'debts', 'settings'].includes(tab) || (tab === 'settings'));
const canEdit = () => ME && ME.role !== 'view';

/* ---------- הגדרת שדות לכל טבלה ---------- */
const PLAN_KINDS = { income: 'הכנסה קבועה', fixed: 'הוצאה קבועה', variable: 'הוצאה משתנה', consumption: 'צריכה שוטפת', charity: 'מעשרות וצדקה' };
const SCHEMA = {
  plan: [{ k: 'kind', l: 'סוג', t: 'select', o: PLAN_KINDS }, { k: 'name', l: 'שם', t: 'text' }, { k: 'amount', l: 'סכום חודשי', t: 'number' }, { k: 'day', l: 'יום בחודש (לא חובה)', t: 'number' }, { k: 'tith', l: 'חייב במעשר (להכנסה)', t: 'check' }, { k: 'active', l: 'פעיל', t: 'check', d: true }],
  yearly: [{ k: 'month', l: 'חודש עברי', t: 'select', o: Object.fromEntries([...HEB_MONTHS, 'כללי'].map(m => [m, m])) }, { k: 'name', l: 'שם', t: 'text' }, { k: 'amount', l: 'סכום', t: 'number' }, { k: 'kind', l: 'סוג', t: 'select', o: { expense: 'הוצאה', income: 'הכנסה' } }, { k: 'year', l: 'שנה (ריק = כל השנים)', t: 'text' }],
  debts: [{ k: 'name', l: 'שם המלווה', t: 'text' }, { k: 'kind', l: 'סוג', t: 'text' }, { k: 'balance', l: 'יתרה', t: 'number' }, { k: 'monthly', l: 'תשלום חודשי', t: 'number' }, { k: 'left', l: 'תשלומים שנותרו', t: 'number' }, { k: 'urgency', l: 'דחיפות (1 הכי דחוף)', t: 'number' }],
  accounts: [{ k: 'name', l: 'שם החשבון', t: 'text' }, { k: 'balance', l: 'יתרה נוכחית', t: 'number' }, { k: 'min', l: 'התראה אם יורד מתחת ל', t: 'number' }, { k: 'max', l: 'התראה אם עולה מעל', t: 'number' }],
  reminders: [{ k: 'title', l: 'תזכורת', t: 'text' }, { k: 'date', l: 'תאריך', t: 'date' }, { k: 'repeat', l: 'חזרה', t: 'select', o: { none: 'פעם אחת', monthly: 'כל חודש', yearly: 'כל שנה' } }, { k: 'amount', l: 'סכום (לא חובה)', t: 'number' }],
  bizs: [{ k: 'name', l: 'שם העסק', t: 'text' }, { k: 'taxid', l: 'מספר עוסק', t: 'text' }, { k: 'phone', l: 'טלפון', t: 'text' }, { k: 'address', l: 'כתובת', t: 'text' }],
  orders: [{ k: 'client', l: 'לקוח / אירוע', t: 'text' }, { k: 'date', l: 'תאריך', t: 'date' }, { k: 'when', l: 'מועד (טקסט חופשי)', t: 'text' }, { k: 'year', l: 'שנה', t: 'text' }, { k: 'amount', l: 'תשלום מהלקוח', t: 'number' }, { k: 'cost', l: 'הוצאות על ההזמנה', t: 'number' }, { k: 'paid', l: 'שולם', t: 'check' }, { k: 'note', l: 'הערות', t: 'text' }],
  bizExp: [{ k: 'item', l: 'מוצר / הוצאה', t: 'text' }, { k: 'date', l: 'תאריך', t: 'date' }, { k: 'when', l: 'מועד (טקסט חופשי)', t: 'text' }, { k: 'year', l: 'שנה', t: 'text' }, { k: 'amount', l: 'סכום', t: 'number' }],
  invoices: [{ k: 'kind', l: 'סוג מסמך', t: 'select', o: { 'חשבון עסקה': 'חשבון עסקה', 'חשבונית': 'חשבונית', 'קבלה': 'קבלה', 'חשבונית-קבלה': 'חשבונית-קבלה' } }, { k: 'client', l: 'לקוח', t: 'text' }, { k: 'date', l: 'תאריך', t: 'date' }, { k: 'desc', l: 'תיאור', t: 'text' }, { k: 'amount', l: 'סכום', t: 'number' }],
};

/* ---------- ממשק עזר ---------- */
let tab = 'home', curBiz = null, curYear = null, curMonth = today().slice(0, 7), subTab = {};
function toast(t) { const d = document.createElement('div'); d.className = 'alert'; d.style.cssText = 'position:fixed;top:60px;inset-inline:16px;z-index:50;text-align:center'; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 2800); }
function modal(html, onMount) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div>${html}</div>`; m.onclick = e => { if (e.target === m) m.remove(); }; document.body.append(m); onMount?.(m); return m; }
function form(coll, item, after, extra = {}) {
  const f = SCHEMA[coll], it = item || { id: uid(), ...extra };
  const m = modal(`<h2>${item ? 'עריכה' : 'הוספה'}</h2>` + f.map(x => {
    const v = it[x.k] ?? (x.d === true ? true : '');
    if (x.t === 'select') return `<label>${x.l}</label><select data-k="${x.k}">${Object.entries(x.o).map(([a, b]) => `<option value="${esc(a)}" ${a == v ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
    if (x.t === 'check') return `<label><input type="checkbox" data-k="${x.k}" ${v ? 'checked' : ''}> ${x.l}</label>`;
    return `<label>${x.l}</label><input data-k="${x.k}" type="${x.t === 'number' ? 'number' : x.t}" step="any" value="${esc(v)}">`;
  }).join('') + `<div class="row" style="margin-top:14px"><button class="b" id="ok">שמירה</button><button class="b sec" id="no">ביטול</button>${item ? '<button class="b red sp" id="del" style="flex:0!important;margin-inline-start:auto">מחיקה</button>' : ''}</div>`);
  m.querySelector('#no').onclick = () => m.remove();
  if (item) m.querySelector('#del').onclick = () => { if (confirm('למחוק?')) { remove(coll, it.id); m.remove(); render(); } };
  m.querySelector('#ok').onclick = () => {
    f.forEach(x => { const e = m.querySelector(`[data-k="${x.k}"]`); it[x.k] = x.t === 'check' ? e.checked : x.t === 'number' ? (e.value === '' ? '' : +e.value) : e.value.trim(); });
    put(coll, it); m.remove(); after?.(it); render();
  };
}
function table(coll, cols, rows, o = {}) {
  const sum = o.sum; const total = sum ? rows.reduce((a, r) => a + (+r[sum] || 0), 0) : null;
  return `<div class="scroll"><table><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr>` + rows.map(r =>
    `<tr>${cols.map(c => `<td class="${c[2] || ''}">${c[3] ? c[3](r) : esc(r[c[0]] ?? '')}${c[2] === 'n' && !c[3] && r[c[0]] !== '' && r[c[0]] != null ? ' ₪' : ''}</td>`).join('')}<td>${canEdit() ? `<button class="ic" data-edit="${coll}:${r.id}">✏️</button>` : ''}</td></tr>`).join('') +
    (sum ? `<tr class="tot"><td colspan="${cols.length}">סה"כ</td><td class="n">${fmt(total)}</td></tr>` : '') + `</table></div>`;
}
const addBtn = (coll, label = 'הוספה', extra = '') => canEdit() ? `<button class="b" data-add="${coll}" ${extra}>＋ ${label}</button>` : '';

/* ---------- חישובים ---------- */
function years() {
  const s = new Set([yearOf(today())]);
  live('tx').forEach(t => s.add(yearOf(t.date)));
  [...live('orders'), ...live('bizExp'), ...live('yearly')].forEach(x => { const y = bizYear(x); if (y) s.add(y); });
  return [...s].filter(Boolean).sort((a, b) => b - a);
}
function yrNum(t) { const h = hebNum(t); return !h ? 0 : S.settings.calendar === 'heb' ? h : h - 3760; }
function bizYear(x) { return x.date ? yearOf(x.date) : yrNum(x.year); } // שנה של הזמנה/הוצאה: לפי תאריך, אחרת לפי הטקסט (למשל תשפ"ה)
const monthlyPlan = () => live('plan').filter(p => p.active !== false);
const planSum = k => monthlyPlan().filter(p => p.kind === k).reduce((a, p) => a + (+p.amount || 0), 0);
function yearSummary(y) {
  const inc = planSum('income') * 12, exp = (planSum('fixed') + planSum('variable') + planSum('consumption') + planSum('charity')) * 12;
  const yi = live('yearly').filter(x => x.kind === 'income' && (!x.year || yrNum(x.year) === y || x.year == y)).reduce((a, x) => a + (+x.amount || 0), 0);
  const ye = live('yearly').filter(x => x.kind !== 'income' && (!x.year || yrNum(x.year) === y || x.year == y)).reduce((a, x) => a + (+x.amount || 0), 0);
  const biz = bizProfit(y);
  const txs = live('tx').filter(t => yearOf(t.date) === y);
  const aI = txs.filter(t => t.type === 'income').reduce((a, t) => a + +t.amount, 0), aE = txs.filter(t => t.type !== 'income').reduce((a, t) => a + +t.amount, 0);
  return { planInc: inc + yi, planExp: exp + ye, biz, aI, aE, txs };
}
function bizProfit(y, bizId) {
  const o = live('orders').filter(x => bizYear(x) === y && (!bizId || x.biz === bizId)), e = live('bizExp').filter(x => bizYear(x) === y && (!bizId || x.biz === bizId));
  const inc = o.reduce((a, x) => a + (+x.amount || 0), 0), c = o.reduce((a, x) => a + (+x.cost || 0), 0), ex = e.reduce((a, x) => a + (+x.amount || 0), 0);
  return { inc, cost: c + ex, net: inc - c - ex, n: o.length, unpaid: o.filter(x => !x.paid).reduce((a, x) => a + (+x.amount || 0), 0) };
}
function alerts() {
  const a = [];
  live('accounts').forEach(c => {
    if (c.min !== '' && c.min != null && +c.balance < +c.min) a.push(['r', `${c.name}: היתרה ${fmt(c.balance)} נמוכה מהמינימום ${fmt(c.min)}`]);
    if (c.max !== '' && c.max != null && +c.balance > +c.max) a.push(['', `${c.name}: היתרה ${fmt(c.balance)} גבוהה מהמקסימום ${fmt(c.max)}`]);
  });
  const t = today(), soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  live('reminders').forEach(r => { const n = nextDue(r); if (n && n <= soon) a.push([n <= t ? 'r' : '', `תזכורת: ${r.title}${r.amount ? ' (' + fmt(r.amount) + ')' : ''} — ${n === t ? 'היום' : n < t ? 'עבר מועד' : hebDateStr(n) + ' · ' + n.split('-').reverse().join('/')}`]); });
  return a;
}
function nextDue(r) {
  if (!r.date) return null; if (r.repeat === 'none' || !r.repeat) return r.date;
  let d = new Date(r.date + 'T12:00:00'); const t = new Date(today() + 'T00:00:00'); let g = 0;
  while (d < t && g++ < 600) { r.repeat === 'monthly' ? d.setMonth(d.getMonth() + 1) : d.setFullYear(d.getFullYear() + 1); }
  return d.toISOString().slice(0, 10);
}

/* ---------- גרפים ---------- */
function bars(items, o = {}) { // items: [{l, vals:[..]}], series: [{n,c}]
  const mx = Math.max(1, ...items.flatMap(i => i.vals.map(Math.abs))), sr = o.series || [{ c: 'var(--pri)' }];
  return `<div>${o.series ? `<div class="row mut" style="font-size:13px">${sr.map(s => `<span><b style="color:${s.c}">■</b> ${s.n}</span>`).join('')}</div>` : ''}` + items.map(i =>
    `<div style="margin:8px 0"><div class="row"><span class="sp">${esc(i.l)}</span>${i.vals.map((v, k) => `<span class="mut" style="font-size:13px">${fmt(v)}</span>`).join(' · ')}</div>` +
    i.vals.map((v, k) => `<div class="bar" style="margin-top:2px"><i style="width:${Math.abs(v) / mx * 100}%;background:${v < 0 ? 'var(--bad)' : sr[k].c}"></i></div>`).join('') + `</div>`).join('') + `</div>`;
}

/* ---------- מסכים ---------- */
const TABS = [['home', '🏠', 'סקירה'], ['month', '📅', 'חודשי'], ['year', '🗓️', 'שנתי'], ['debts', '💳', 'חובות'], ['bank', '🏦', 'בנק'], ['biz', '🎨', 'עסקים'], ['more', '⚙️', 'עוד']];
const V = {};
V.home = () => {
  const y = curYear, s = yearSummary(y), al = alerts(), inc = s.planInc + s.biz.net, bal = inc - s.planExp;
  const debt = live('debts').reduce((a, d) => a + (+d.balance || 0), 0), pay = live('debts').reduce((a, d) => a + (+d.monthly || 0), 0);
  const tithable = monthlyPlan().filter(p => p.kind === 'income' && p.tith).reduce((a, p) => a + +p.amount, 0) * 12, titheDue = tithable * S.settings.tithe / 100, charity = planSum('charity') * 12;
  const ys = years().slice(0, 6).reverse().map(yy => { const q = yearSummary(yy); return { l: yearLabel(yy), vals: [q.aI + q.biz.net, q.aE] }; });
  return `${al.map(a => `<div class="alert ${a[0]}">${esc(a[1])}</div>`).join('')}
  <div class="grid"><div class="kpi"><small>הכנסות מתוכננות לשנה</small><strong>${fmt(inc)}</strong></div>
  <div class="kpi"><small>הוצאות מתוכננות לשנה</small><strong>${fmt(s.planExp)}</strong></div>
  <div class="kpi"><small>מאזן שנתי</small><strong class="${bal < 0 ? 'bad' : 'good'}">${fmt(bal)}</strong></div>
  <div class="kpi"><small>מאזן חודשי ממוצע</small><strong class="${bal < 0 ? 'bad' : 'good'}">${fmt(bal / 12)}</strong></div></div>
  <div class="card"><h2>בפועל השנה (לפי מה שהוזן)</h2><div class="grid"><div><small class="mut">נכנס</small><br><b class="good">${fmt(s.aI)}</b></div><div><small class="mut">יצא</small><br><b class="bad">${fmt(s.aE)}</b></div><div><small class="mut">רווח עסקי</small><br><b>${fmt(s.biz.net)}</b></div></div></div>
  <div class="card"><h2>חובות</h2>סה"כ ${fmt(debt)} · החזר חודשי ${fmt(pay)}${bal / 12 - pay < 0 ? `<div class="alert r">אחרי החזרי החובות החודשיים חסרים ${fmt(-(bal / 12 - pay))} בחודש</div>` : ''}</div>
  <div class="card"><h2>מעשר</h2>הכנסות חייבות: ${fmt(tithable)} · חיוב ${S.settings.tithe}%: ${fmt(titheDue)} · צדקה מתוכננת: ${fmt(charity)}<br><b class="${charity >= titheDue ? 'good' : 'bad'}">${charity >= titheDue ? 'עודף' : 'חסר'}: ${fmt(Math.abs(charity - titheDue))}</b></div>
  <div class="card"><h2>השוואה בין שנים (בפועל)</h2>${ys.length ? bars(ys, { series: [{ n: 'הכנסות', c: 'var(--good)' }, { n: 'הוצאות', c: 'var(--bad)' }] }) : '<span class="mut">עוד אין נתונים</span>'}</div>
  <div class="card"><h2>תחזית</h2>${forecast()}</div>`;
};
function forecast() {
  const y = curYear, s = yearSummary(y), net = (s.planInc + s.biz.net - s.planExp) / 12, ds = live('debts'), bal = ds.reduce((a, d) => a + +d.balance || 0, 0), pay = ds.reduce((a, d) => a + +d.monthly || 0, 0);
  if (!bal) return '<span class="mut">אין חובות רשומים</span>';
  const avail = net - 0; const extra = Math.max(0, avail);
  const mo = pay + extra > 0 ? Math.ceil(bal / (pay + extra)) : null;
  return `אם כל העודף החודשי (${fmt(extra)}) יופנה לחובות, יחד עם ההחזר הקיים (${fmt(pay)}): ${mo ? `חובות של ${fmt(bal)} יסתיימו בעוד ~${mo} חודשים (${(mo / 12).toFixed(1)} שנים)` : 'אין עודף להפניה'}.<br><span class="mut">הערכה פשוטה, בלי ריבית.</span>`;
}
V.month = () => {
  const y = +curMonth.slice(0, 4), months = [...Array(12)].map((_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  const txs = live('tx').filter(t => t.date.startsWith(curMonth));
  const names = [...new Set(monthlyPlan().filter(p => p.kind !== 'income').map(p => p.name))];
  const act = n => txs.filter(t => t.type !== 'income' && t.cat === n).reduce((a, t) => a + +t.amount, 0);
  const sub = subTab.month || 'expense', kinds = sub === 'income' ? ['income'] : ['fixed', 'variable', 'consumption', 'charity'];
  const rows = monthlyPlan().filter(p => kinds.includes(p.kind));
  const tI = txs.filter(t => t.type === 'income').reduce((a, t) => a + +t.amount, 0), tE = txs.filter(t => t.type !== 'income').reduce((a, t) => a + +t.amount, 0);
  const other = txs.filter(t => t.type !== 'income' && !names.includes(t.cat)).reduce((a, t) => a + +t.amount, 0);
  return `<div class="row"><select id="mpick" style="width:auto">${months.map(m => `<option value="${m}" ${m === curMonth ? 'selected' : ''}>${m.slice(5)}/${m.slice(0, 4)}</option>`).join('')}</select><span class="mut">${hebMonthOf(curMonth + '-15')} ${hebLabel(hebYearOf(curMonth + '-15'))}</span></div>
  <div class="grid" style="margin-top:8px"><div class="kpi"><small>נכנס בפועל</small><strong class="good">${fmt(tI)}</strong></div><div class="kpi"><small>יצא בפועל</small><strong class="bad">${fmt(tE)}</strong></div><div class="kpi"><small>הפרש</small><strong>${fmt(tI - tE)}</strong></div></div>
  <div class="tabs"><button class="${sub === 'expense' ? 'on' : ''}" data-sub="month:expense">הוצאות</button><button class="${sub === 'income' ? 'on' : ''}" data-sub="month:income">הכנסות</button></div>
  <div class="card"><h2>${sub === 'income' ? 'הכנסות קבועות' : 'תקציב מול בפועל'}</h2>
  <div class="scroll"><table><tr><th>סעיף</th><th>תכנון</th><th>בפועל</th><th></th><th></th></tr>${rows.map(p => {
    const a = sub === 'income' ? txs.filter(t => t.type === 'income' && t.cat === p.name).reduce((x, t) => x + +t.amount, 0) : act(p.name), pct = p.amount ? Math.min(100, a / p.amount * 100) : 0;
    return `<tr><td>${esc(p.name)}<div class="bar"><i style="width:${pct}%;background:${sub !== 'income' && a > p.amount ? 'var(--bad)' : 'var(--pri)'}"></i></div></td><td class="n">${fmt(p.amount)}</td><td class="n">${fmt(a)}</td><td></td><td>${canEdit() ? `<button class="ic" data-edit="plan:${p.id}">✏️</button>` : ''}</td></tr>`;
  }).join('')}${sub === 'expense' && other ? `<tr><td>אחר (ללא סעיף בתקציב)</td><td></td><td class="n">${fmt(other)}</td><td></td><td></td></tr>` : ''}</table></div>${addBtn('plan', 'סעיף חדש', `data-extra='${JSON.stringify({ kind: sub === 'income' ? 'income' : 'fixed' })}'`)}</div>
  <div class="card"><h2>תנועות החודש</h2>${table('tx', [['date', 'תאריך', '', r => r.date.slice(8) + '/' + r.date.slice(5, 7)], ['cat', 'סעיף'], ['note', 'הערה'], ['amount', 'סכום', 'n', r => (r.type === 'income' ? '+' : '−') + fmt(r.amount)]], txs.sort((a, b) => b.date.localeCompare(a.date)))}</div>`;
};
V.year = () => {
  const y = curYear, items = live('yearly').filter(x => !x.year || yrNum(x.year) === y || x.year == y);
  const s = yearSummary(y), by = {}; items.forEach(x => (by[x.month] ||= []).push(x));
  return `<div class="grid"><div class="kpi"><small>הוצאות שנתיות מתוכננות</small><strong>${fmt(items.filter(x => x.kind !== 'income').reduce((a, x) => a + +x.amount || 0, 0))}</strong></div><div class="kpi"><small>הכנסות שנתיות מתוכננות</small><strong>${fmt(items.filter(x => x.kind === 'income').reduce((a, x) => a + +x.amount || 0, 0))}</strong></div><div class="kpi"><small>לחסוך כל חודש לכיסוי</small><strong>${fmt(items.filter(x => x.kind !== 'income').reduce((a, x) => a + +x.amount || 0, 0) / 12)}</strong></div></div>
  ${[...HEB_MONTHS, 'כללי'].filter(m => by[m]).map(m => `<div class="card"><h2>${m}</h2>${table('yearly', [['name', 'שם'], ['amount', 'סכום', 'n', r => (r.kind === 'income' ? '+' : '') + fmt(r.amount)]], by[m])}<div class="mut">סה"כ ${fmt(by[m].reduce((a, x) => a + (x.kind === 'income' ? -1 : 1) * (+x.amount || 0), 0))}</div></div>`).join('')}
  ${addBtn('yearly', 'פריט שנתי')}`;
};
V.debts = () => {
  const d = live('debts').sort((a, b) => (a.urgency || 99) - (b.urgency || 99)), bal = d.reduce((a, x) => a + +x.balance || 0, 0), pay = d.reduce((a, x) => a + +x.monthly || 0, 0);
  return `<div class="grid"><div class="kpi"><small>סה"כ חובות</small><strong class="bad">${fmt(bal)}</strong></div><div class="kpi"><small>החזר חודשי</small><strong>${fmt(pay)}</strong></div></div>
  <div class="card">${table('debts', [['name', 'מלווה'], ['kind', 'סוג'], ['balance', 'יתרה', 'n'], ['monthly', 'חודשי', 'n'], ['left', 'נותרו'], ['urgency', 'דחיפות']], d)}${addBtn('debts', 'חוב')}</div><div class="card"><h2>תחזית</h2>${forecast()}</div>`;
};
V.bank = () => {
  const acc = live('accounts');
  return `${alerts().filter(a => a[1].includes('היתרה')).map(a => `<div class="alert ${a[0]}">${esc(a[1])}</div>`).join('')}
  <div class="card">${table('accounts', [['name', 'חשבון'], ['balance', 'יתרה', 'n', r => `<b class="${+r.balance < 0 ? 'bad' : ''}">${fmt(r.balance)}</b>`], ['min', 'מינימום', 'n'], ['max', 'מקסימום', 'n']], acc)}${addBtn('accounts', 'חשבון בנק')}</div>
  <p class="mut">התראות מוצגות בראש המסך ובמסך הסקירה. כשמזינים תנועה ובוחרים חשבון — היתרה מתעדכנת אוטומטית.</p>`;
};
V.biz = () => {
  const bz = live('bizs'); if (!curBiz || !bz.find(b => b.id === curBiz)) curBiz = bz[0]?.id;
  const y = curYear, o = live('orders').filter(x => x.biz === curBiz), e = live('bizExp').filter(x => x.biz === curBiz);
  const yo = o.filter(x => bizYear(x) === y), ye = e.filter(x => bizYear(x) === y), p = bizProfit(y, curBiz), sub = subTab.biz || 'orders';
  const all = years().slice(0, 8).reverse().map(yy => { const q = bizProfit(yy, curBiz); return { l: yearLabel(yy), vals: [q.net] }; }).filter(i => i.vals[0]);
  const unk = o.filter(x => !bizYear(x)).length + e.filter(x => !bizYear(x)).length;
  return `<div class="tabs">${bz.map(b => `<button class="${b.id === curBiz ? 'on' : ''}" data-biz="${b.id}">${esc(b.name)}</button>`).join('')}${addBtn('bizs', 'עסק חדש')}</div>
  ${!curBiz ? '<p class="mut">הוסף עסק כדי להתחיל.</p>' : `
  <div class="grid"><div class="kpi"><small>הכנסות ${yearLabel(y)}</small><strong>${fmt(p.inc)}</strong></div><div class="kpi"><small>הוצאות</small><strong>${fmt(p.cost)}</strong></div><div class="kpi"><small>רווח</small><strong class="${p.net < 0 ? 'bad' : 'good'}">${fmt(p.net)}</strong></div><div class="kpi"><small>ממוצע חודשי</small><strong>${fmt(p.net / 12)}</strong></div><div class="kpi"><small>טרם שולם</small><strong class="bad">${fmt(p.unpaid)}</strong></div></div>
  <div class="tabs">${[['orders', 'הזמנות'], ['exp', 'הוצאות'], ['inv', 'חשבוניות וקבלות'], ['cmp', 'השוואת שנים']].map(t => `<button class="${sub === t[0] ? 'on' : ''}" data-sub="biz:${t[0]}">${t[1]}</button>`).join('')}<button class="on" data-edit="bizs:${curBiz}" style="background:var(--card);color:var(--ink)">✏️ פרטי עסק</button></div>
  ${unk ? `<div class="alert">יש ${unk} רשומות בלי שנה מזוהה — הן לא נספרות בשום שנה. ערוך אותן והוסף תאריך.</div>` : ''}
  ${sub === 'orders' ? `<div class="card">${table('orders', [['client', 'לקוח'], ['when', 'מועד', '', r => esc(r.date ? r.date.split('-').reverse().join('/') : r.when)], ['amount', 'תשלום', 'n'], ['cost', 'הוצאות', 'n'], ['paid', 'שולם', '', r => r.paid ? '✓' : '<b class="bad">✗</b>'], ['inv', '', '', r => canEdit() ? `<button class="ic" data-inv="${r.id}" title="הפקת מסמך">🧾</button>` : '']], yo, { sum: 'amount' })}${addBtn('orders', 'הזמנה', `data-extra='${JSON.stringify({ biz: curBiz })}'`)}</div>` : ''}
  ${sub === 'exp' ? `<div class="card">${table('bizExp', [['item', 'הוצאה'], ['when', 'מועד', '', r => esc(r.date ? r.date.split('-').reverse().join('/') : r.when)], ['amount', 'סכום', 'n']], ye, { sum: 'amount' })}${addBtn('bizExp', 'הוצאה', `data-extra='${JSON.stringify({ biz: curBiz })}'`)}</div>` : ''}
  ${sub === 'inv' ? `<div class="card">${table('invoices', [['num', 'מספר'], ['kind', 'סוג'], ['client', 'לקוח'], ['date', 'תאריך'], ['amount', 'סכום', 'n'], ['p', '', '', r => `<button class="ic" data-print="${r.id}">🖨️</button>`]], live('invoices').filter(x => x.biz === curBiz).sort((a, b) => (b.num || 0) - (a.num || 0)))}${addBtn('invoices', 'מסמך חדש', `data-extra='${JSON.stringify({ biz: curBiz, date: today() })}'`)}<p class="mut">לחץ 🧾 ליד הזמנה להפקת מסמך. 🖨️ להדפסה או שמירה כ-PDF. חשוב: בדוק עם רואה החשבון אם נדרש מספר הקצאה או תוכנה מאושרת.</p></div>` : ''}
  ${sub === 'cmp' ? `<div class="card"><h2>רווח לפי שנה</h2>${all.length ? bars(all) : '<span class="mut">אין נתונים</span>'}</div>` : ''}`}`;
};
V.more = () => {
  const st = S.settings, sy = st.sync;
  return `<div class="card"><h2>משתמש: ${esc(ME.name)}</h2><button class="b sec" id="logout">התנתקות</button></div>
  <div class="card"><h2>תזכורות</h2>${table('reminders', [['title', 'מה'], ['date', 'מתי', '', r => { const n = nextDue(r); return n ? hebDateStr(n) + ' · ' + n.split('-').reverse().join('/') : ''; }], ['repeat', 'חזרה', '', r => ({ none: 'פעם', monthly: 'חודשי', yearly: 'שנתי' }[r.repeat || 'none'])]], live('reminders'))}${addBtn('reminders', 'תזכורת')}</div>
  <div class="card"><h2>הגדרות</h2><label>שם המשפחה</label><input id="s-fam" value="${esc(st.family)}">
  <label>ספירת שנים</label><select id="s-cal"><option value="heb" ${st.calendar === 'heb' ? 'selected' : ''}>עברית (תשפ"ז)</option><option value="greg" ${st.calendar === 'greg' ? 'selected' : ''}>לועזית (2026)</option></select>
  <label>אחוז מעשר</label><input id="s-tithe" type="number" value="${st.tithe}"><div class="row" style="margin-top:10px"><button class="b" id="s-save">שמירה</button></div></div>
  ${ME.role === 'admin' ? `<div class="card"><h2>משתמשים והרשאות</h2>${st.users.map((u, i) => `<div class="row"><span class="sp">${esc(u.name)} — ${ROLES[u.role]}</span>${u.name !== ME.name ? `<button class="ic" data-deluser="${i}">🗑️</button>` : ''}</div>`).join('')}<button class="b sec" id="adduser">＋ משתמש</button><p class="mut">הסיסמה כרגע שמורה במכשיר בלבד. עם חיבור לשרת היא תסתנכרן, אך זו הגנה בסיסית ולא הצפנה מלאה.</p></div>
  <div class="card"><h2>סנכרון לענן</h2><label>כתובת הפרויקט (Supabase)</label><input id="y-url" value="${esc(sy.url)}" placeholder="https://xxxx.supabase.co"><label>מפתח (anon)</label><input id="y-key" value="${esc(sy.key)}"><label>אימייל לחשבון הענן</label><input id="y-mail" type="email" value="${esc(sy.email || '')}"><label>סיסמה לחשבון הענן</label><input id="y-pass" type="password">
  <div class="row" style="margin-top:10px"><button class="b" id="y-in">התחברות וסנכרון</button><button class="b sec" id="y-up">חשבון חדש</button></div><p class="mut">סנכרון אחרון: ${st.last ? new Date(st.last).toLocaleString('he-IL') : 'עוד לא'}. כל מי שמתחבר עם אותו אימייל רואה אותם נתונים. הוראות הקמה בקובץ README.</p></div>` : ''}
  <div class="card"><h2>נתונים</h2><div class="row"><button class="b sec" id="exp">גיבוי לקובץ</button><label class="btn sec" style="margin:0;background:var(--pri2);color:var(--pri)">ייבוא מקובץ<input type="file" id="imp" accept=".json" hidden></label></div>
  <p class="mut">ייבוא מוסיף את הנתונים לקיימים (לא מוחק). קובץ הנתונים מהאקסל מגיע כקובץ נפרד.</p></div>`;
};

/* ---------- ייבוא ---------- */
function importAny(j) {
  if (j.data && j.settings) { // גיבוי מלא
    merge(S.data, j.data); return 'שוחזר גיבוי';
  }
  const by = (o, k) => o[k] || [];
  const add = (c, o) => { const it = { id: uid(), ...o }; it.u = Date.now(); S.data[c].push(it); };
  const m = j.monthly || {};
  Object.entries({ income: 'income', fixed: 'fixed', variable: 'variable', consumption: 'consumption', charity: 'charity' }).forEach(([k, kind]) => by(m, k).forEach(p => add('plan', { kind, name: p.name, amount: p.amount, day: p.day || '', tith: kind === 'income', active: true })));
  by(j, 'yearExpense').forEach(x => add('yearly', { kind: 'expense', month: x.month, name: x.name, amount: x.amount, year: '' }));
  by(j, 'yearIncome').forEach(x => add('yearly', { kind: 'income', month: 'כללי', name: x.name, amount: x.amount, year: '' }));
  by(j, 'debts').forEach(d => add('debts', d));
  const b = { id: uid(), name: 'ציור בחול', u: Date.now() }; S.data.bizs.push(b);
  by(j, 'orders').forEach(o => add('orders', { biz: b.id, client: o.client, when: o.when, year: o.year, amount: o.amount, cost: o.cost, paid: o.paid, note: o.note }));
  by(j, 'bizExpenses').forEach(o => add('bizExp', { biz: b.id, item: o.item, when: o.when, year: o.year, amount: o.amount }));
  return 'הנתונים יובאו';
}

/* ---------- הפקת מסמך ---------- */
function makeInvoice(orderId) {
  const o = live('orders').find(x => x.id === orderId), bz = live('bizs').find(b => b.id === curBiz);
  const m = modal(`<h2>הפקת מסמך</h2><label>סוג</label><select id="ik"><option>חשבון עסקה</option><option>חשבונית</option><option>קבלה</option><option>חשבונית-קבלה</option></select><label>לקוח</label><input id="ic" value="${esc(o.client)}"><label>סכום</label><input id="ia" type="number" value="${o.amount || ''}"><label>תיאור</label><input id="id" value="${esc(o.note || 'תוכנית ציור בחול')}"><div class="row" style="margin-top:14px"><button class="b" id="ok">הפקה</button><button class="b sec" id="no">ביטול</button></div>`);
  m.querySelector('#no').onclick = () => m.remove();
  m.querySelector('#ok').onclick = () => {
    const kind = m.querySelector('#ik').value, mx = Math.max(0, ...live('invoices').filter(i => i.biz === curBiz && i.kind === kind).map(i => +i.num || 0));
    const inv = { id: uid(), biz: curBiz, order: o.id, kind, num: mx + 1, client: m.querySelector('#ic').value, amount: +m.querySelector('#ia').value, desc: m.querySelector('#id').value, date: today() };
    put('invoices', inv); m.remove(); printInv(inv.id); render();
  };
}
function printInv(id) {
  const i = live('invoices').find(x => x.id === id), b = live('bizs').find(x => x.id === i.biz) || {};
  if (!i.num) { i.num = Math.max(0, ...live('invoices').filter(x => x.biz === i.biz && x.kind === i.kind).map(x => +x.num || 0)) + 1; put('invoices', i); }
  const w = open('', '_blank'); if (!w) return toast('הדפדפן חסם את החלון');
  w.document.write(`<html dir="rtl" lang="he"><meta charset="utf-8"><title>${esc(i.kind)} ${i.num}</title><body style="font-family:Arial;max-width:700px;margin:30px auto"><h1>${esc(i.kind)} מס' ${i.num}</h1><p><b>${esc(b.name || '')}</b><br>${esc(b.taxid ? 'עוסק מס\' ' + b.taxid : '')} ${esc(b.phone || '')}<br>${esc(b.address || '')}</p><p>תאריך: ${i.date.split('-').reverse().join('/')}<br>לכבוד: <b>${esc(i.client)}</b></p><table border="1" cellpadding="8" style="border-collapse:collapse;width:100%"><tr><th>תיאור</th><th>סכום</th></tr><tr><td>${esc(i.desc)}</td><td>${fmt(i.amount)}</td></tr><tr><td><b>סה"כ</b></td><td><b>${fmt(i.amount)}</b></td></tr></table><p style="color:#888;font-size:12px">מסמך זה הופק בתוכנה פנימית.</p><script>print()<\/script></body></html>`);
}

/* ---------- הזנה מהירה ---------- */
function quickAdd() {
  const names = [...new Set(monthlyPlan().map(p => p.name))], acc = live('accounts');
  const m = modal(`<h2>הזנה מהירה</h2><div class="tabs"><button class="on" data-t="expense">הוצאה</button><button data-t="income">הכנסה</button></div>
  <input id="q-amt" type="number" inputmode="decimal" step="any" placeholder="סכום" style="font-size:28px;text-align:center" autofocus>
  <label>סעיף</label><input id="q-cat" list="q-list" placeholder="בחר או כתוב"><datalist id="q-list">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
  <label>הערה</label><input id="q-note"><label>תאריך</label><input id="q-date" type="date" value="${today()}">
  ${acc.length ? `<label>חשבון בנק</label><select id="q-acc"><option value="">—</option>${acc.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>` : ''}
  <div class="row" style="margin-top:14px"><button class="b" id="ok">שמירה</button><button class="b sec" id="no">ביטול</button></div>`);
  let type = 'expense'; m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { type = b.dataset.t; m.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); });
  m.querySelector('#no').onclick = () => m.remove();
  m.querySelector('#ok').onclick = () => {
    const amt = +m.querySelector('#q-amt').value; if (!amt) return toast('חסר סכום');
    const t = { id: uid(), type, amount: amt, cat: m.querySelector('#q-cat').value.trim(), note: m.querySelector('#q-note').value.trim(), date: m.querySelector('#q-date').value || today(), acct: m.querySelector('#q-acc')?.value || '' };
    put('tx', t);
    if (t.acct) { const a = live('accounts').find(x => x.id === t.acct); if (a) { a.balance = (+a.balance || 0) + (type === 'income' ? amt : -amt); put('accounts', a); } }
    m.remove(); toast('נשמר'); render();
  };
  setTimeout(() => m.querySelector('#q-amt').focus(), 100);
}

/* ---------- מסך כניסה ---------- */
function loginView() {
  const first = !S.settings.users.length;
  $('#app').innerHTML = `<div class="login card"><h1>💰 תקציב המשפחה</h1>${first ? '<p>הגדרה ראשונה — צור משתמש מנהל</p><input id="l-n" placeholder="שם"><br><br>' : `<select id="l-n">${S.settings.users.map(u => `<option>${esc(u.name)}</option>`).join('')}</select><br><br>`}<input id="l-p" type="password" inputmode="numeric" placeholder="${first ? 'בחר סיסמה' : 'סיסמה'}"><br><br><button class="b" id="l-go">${first ? 'התחלה' : 'כניסה'}</button></div>`;
  $('#l-go').onclick = async () => {
    const n = $('#l-n').value.trim(), p = $('#l-p').value; if (!n || !p) return toast('חסר שם או סיסמה');
    const h = await hash(p);
    if (first) { S.settings.users.push({ name: n, hash: h, role: 'admin' }); save(); ME = S.settings.users[0]; }
    else { const u = S.settings.users.find(u => u.name === n); if (!u || u.hash !== h) return toast('סיסמה שגויה'); ME = u; }
    try { sessionStorage.setItem('budget.me', ME.name); } catch (e) { }
    start();
  };
}

/* ---------- ציור ---------- */
function render() {
  if (!ME) return loginView();
  const ys = years(); if (!curYear || !ys.includes(curYear)) curYear = ys[0];
  const vis = TABS.filter(t => ME.role === 'admin' || !['biz', 'debts'].includes(t[0]));
  if (!vis.find(t => t[0] === tab)) tab = 'home';
  $('#app').innerHTML = `<header><h1>${esc(S.settings.family || 'תקציב המשפחה')}</h1>
    <select id="yr">${ys.map(y => `<option value="${y}" ${y === curYear ? 'selected' : ''}>${yearLabel(y)}</option>`).join('')}</select>
    <button id="cal" title="עברי / לועזי">${S.settings.calendar === 'heb' ? 'עברי' : 'לועזי'}</button></header>
    <main>${V[tab]()}</main>${canEdit() ? '<button class="fab" id="fab" title="הזנה מהירה">+</button>' : ''}
    <nav>${vis.map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-tab="${t[0]}"><b>${t[1]}</b>${t[2]}</button>`).join('')}</nav>`;
  bind();
}
function bind() {
  const R = $('#app');
  R.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); scrollTo(0, 0); });
  $('#yr').onchange = e => { curYear = +e.target.value; render(); };
  $('#cal').onclick = () => { S.settings.calendar = S.settings.calendar === 'heb' ? 'greg' : 'heb'; curYear = null; save(); render(); };
  $('#fab')?.addEventListener('click', quickAdd);
  R.querySelectorAll('[data-add]').forEach(b => b.onclick = () => form(b.dataset.add, null, null, b.dataset.extra ? JSON.parse(b.dataset.extra) : {}));
  R.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const [c, id] = b.dataset.edit.split(':'); form(c, S.data[c].find(x => x.id === id)); });
  R.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.sub.split(':'); subTab[k] = v; render(); });
  R.querySelectorAll('[data-biz]').forEach(b => b.onclick = () => { curBiz = b.dataset.biz; render(); });
  R.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => makeInvoice(b.dataset.inv));
  R.querySelectorAll('[data-print]').forEach(b => b.onclick = () => printInv(b.dataset.print));
  $('#mpick')?.addEventListener('change', e => { curMonth = e.target.value; render(); });
  $('#logout')?.addEventListener('click', () => { ME = null; try { sessionStorage.removeItem('budget.me'); } catch (e) { } render(); });
  $('#s-save')?.addEventListener('click', () => { const s = S.settings; s.family = $('#s-fam').value; s.calendar = $('#s-cal').value; s.tithe = +$('#s-tithe').value || 10; curYear = null; save(); render(); toast('נשמר'); });
  const cl = signup => async () => { S.settings.sync = { url: $('#y-url').value.trim().replace(/\/$/, ''), key: $('#y-key').value.trim(), email: $('#y-mail').value.trim() }; save(); try { await cloudLogin(S.settings.sync.email, $('#y-pass').value, signup); toast(signup ? 'החשבון נוצר (ייתכן שצריך לאשר במייל)' : 'מחובר'); sync(true); } catch (e) { toast('ההתחברות נכשלה: ' + e.message); } };
  $('#y-in')?.addEventListener('click', cl(false)); $('#y-up')?.addEventListener('click', cl(true));
  $('#adduser')?.addEventListener('click', () => {
    const m = modal(`<h2>משתמש חדש</h2><label>שם</label><input id="u-n"><label>סיסמה</label><input id="u-p" type="password"><label>הרשאה</label><select id="u-r">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === 'home' ? 'selected' : ''}>${v}</option>`).join('')}</select><div class="row" style="margin-top:14px"><button class="b" id="ok">הוספה</button></div>`);
    m.querySelector('#ok').onclick = async () => { const n = m.querySelector('#u-n').value.trim(), p = m.querySelector('#u-p').value; if (!n || !p) return; S.settings.users.push({ name: n, hash: await hash(p), role: m.querySelector('#u-r').value }); save(); m.remove(); render(); };
  });
  R.querySelectorAll('[data-deluser]').forEach(b => b.onclick = () => { if (confirm('למחוק משתמש?')) { S.settings.users.splice(+b.dataset.deluser, 1); save(); render(); } });
  $('#exp')?.addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ settings: { users: [] }, data: S.data })], { type: 'application/json' })); a.download = 'גיבוי-תקציב-' + today() + '.json'; a.click(); });
  $('#imp')?.addEventListener('change', async e => { try { const r = importAny(JSON.parse(await e.target.files[0].text())); save(); toast(r); render(); } catch (x) { toast('הקובץ לא תקין'); } });
}

function start() {
  render();
  if ('Notification' in window && Notification.permission === 'default') { /* הרשאה תבוקש רק לפי בקשה */ }
  const al = alerts().filter(a => a[0] === 'r'); if (al.length && 'Notification' in window && Notification.permission === 'granted') new Notification('תקציב המשפחה', { body: al[0][1] });
  sync();
}
(function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  try { const n = sessionStorage.getItem('budget.me'); ME = S.settings.users.find(u => u.name === n) || null; } catch (e) { }
  ME ? start() : render();
})();
