# בונה את גרסת האתר הפרטי ב-claude.ai (קובץ HTML אחד, הנתונים נשמרים במסד של הדף)
import re,sys
MODE=sys.argv[1] if len(sys.argv)>1 else 'artifact'
OUT=sys.argv[2] if len(sys.argv)>2 else '..'
src=open('../app.js',encoding='utf-8').read(); css=open('../style.css',encoding='utf-8').read()
STATE_SITE='''/* ---------- מצב ושמירה (השרת של האתר הראשי) ---------- */
const COLL = ['plan', 'yearly', 'debts', 'accounts', 'tx', 'bizs', 'orders', 'bizExp', 'invoices', 'reminders'];
const S = { settings: { family: '', calendar: 'heb', tithe: 10 }, data: Object.fromEntries(COLL.map(c => [c, []])) };
let ready = false, pending = [], flushT = 0, flushing = false;
const API = window.BUDGET_API;
const csrf = () => (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || window.BUDGET_CSRF || '';
const live = c => S.data[c].filter(x => !x.del);
function dbErr(e) { toast(e && (e.code === 403 || e.code === 401) ? 'אין הרשאה לשמור. התחבר מחדש.' : 'השמירה נכשלה, נסה שוב'); }
async function flush() {
  if (flushing || !pending.length) return; flushing = true;
  const ops = pending.splice(0, 400);
  try {
    const r = await fetch(API + 'batch', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf() }, body: JSON.stringify({ ops }) });
    if (!r.ok) throw { code: r.status };
  } catch (e) { pending.unshift(...ops); dbErr(e); flushing = false; return; }
  flushing = false; if (pending.length) flush();
}
function queue(op) { pending.push(op); clearTimeout(flushT); flushT = setTimeout(flush, 200); }
function put(c, item) {
  item = { ...item, u: Date.now() }; const a = S.data[c], i = a.findIndex(x => x.id === item.id); if (i < 0) a.push(item); else a[i] = item;
  queue({ c, id: item.id, data: item });
}
function remove(c, id) { S.data[c] = S.data[c].filter(x => x.id !== id); queue({ c, id, del: true }); }
function save() { queue({ c: 'settings', id: 'main', data: { ...S.settings } }); }
async function pull() {
  const r = await fetch(API + 'all', { credentials: 'same-origin' });
  if (r.status === 401 || r.status === 403) { location.reload(); return; }
  if (!r.ok) throw { code: r.status }; const j = await r.json();
  COLL.forEach(c => S.data[c] = j[c] || []); if (j.settings && j.settings.main) Object.assign(S.settings, j.settings.main);
  ready = true; render();
}
'''
INIT_SITE='''(async function init() {
  render();
  try { await pull(); } catch (e) { ready = true; render(); toast('אין חיבור לשרת'); }
  setInterval(() => { if (!document.querySelector('.modal') && !pending.length && !flushing && document.visibilityState === 'visible') pull().catch(() => { }); }, 60000);
})();
'''
def cut(s,a,b,new):
    i=s.index(a); j=s.index(b,i); return s[:i]+new+s[j:]
STATE='''/* ---------- מצב ושמירה (מסד הנתונים של הדף) ---------- */
const COLL = ['plan', 'yearly', 'debts', 'accounts', 'tx', 'bizs', 'orders', 'bizExp', 'invoices', 'reminders'];
const S = { settings: { family: '', calendar: 'heb', tithe: 10 }, data: Object.fromEntries(COLL.map(c => [c, []])) };
let DB = null, ready = false;
const live = c => S.data[c].filter(x => !x.del);
function dbErr(e) { toast(e && e.code === 'invalid_argument' ? 'אין הרשאה לשמור (צפייה בלבד?)' : 'השמירה נכשלה, נסה שוב'); }
function put(c, item) {
  item = { ...item, u: Date.now() }; const a = S.data[c], i = a.findIndex(x => x.id === item.id); if (i < 0) a.push(item); else a[i] = item;
  DB?.doc(`${c}/${item.id}`).set(item).catch(dbErr);
}
function remove(c, id) { S.data[c] = S.data[c].filter(x => x.id !== id); DB?.doc(`${c}/${id}`).delete().catch(dbErr); }
function save() { DB?.doc('settings/main').set({ ...S.settings }).catch(dbErr); }
'''
s=cut(src,"/* ---------- מצב ושמירה","/* ---------- משתמשים והרשאות",STATE if MODE=='artifact' else STATE_SITE)
s=cut(s,"/* ---------- משתמשים והרשאות","/* ---------- הגדרת שדות","let ME = { name: '', role: 'admin' };\nconst canEdit = () => ME.role !== 'view';\nfunction ask(msg, yes) { const m = modal(`<h2>${esc(msg)}</h2><div class=\"row\"><button class=\"b red\" id=\"y\">כן</button><button class=\"b sec\" id=\"n\">לא</button></div>`); m.querySelector('#n').onclick = () => m.remove(); m.querySelector('#y').onclick = () => { m.remove(); yes(); }; }\n\n")
s=s.replace("const it = item || { id: uid(), ...extra };","const it = item ? { ...item } : { id: uid(), ...extra };")
s=s.replace("m.querySelector('#del').onclick = () => { if (confirm('למחוק?')) { remove(coll, it.id); m.remove(); render(); } };","m.querySelector('#del').onclick = () => ask('למחוק?', () => { remove(coll, it.id); m.remove(); render(); });")
s=cut(s,"V.more = () => {","/* ---------- ייבוא",'''V.more = () => {
  const st = S.settings;
  return `<div class="card"><h2>תזכורות</h2>${table('reminders', [['title', 'מה'], ['date', 'מתי', '', r => { const n = nextDue(r); return n ? hebDateStr(n) + ' · ' + n.split('-').reverse().join('/') : ''; }], ['repeat', 'חזרה', '', r => ({ none: 'פעם', monthly: 'חודשי', yearly: 'שנתי' }[r.repeat || 'none'])]], live('reminders'))}${addBtn('reminders', 'תזכורת')}</div>
  <div class="card"><h2>הגדרות</h2><label for="s-fam">שם המשפחה</label><input id="s-fam" value="${esc(st.family)}">
  <label for="s-cal">ספירת שנים</label><select id="s-cal"><option value="heb" ${st.calendar === 'heb' ? 'selected' : ''}>עברית (תשפ"ז)</option><option value="greg" ${st.calendar === 'greg' ? 'selected' : ''}>לועזית (2026)</option></select>
  <label for="s-tithe">אחוז מעשר</label><input id="s-tithe" type="number" value="${st.tithe}"><div class="row" style="margin-top:10px"><button class="b" id="s-save">שמירה</button></div></div>
  ${canEdit() ? `<div class="card"><h2>ייבוא נתונים</h2><label class="btn" style="margin:0">בחירת קובץ<input type="file" id="imp" accept=".json" hidden></label><p class="mut">ייבוא מוסיף לנתונים הקיימים ולא מוחק. הנתונים נשמרים בחשבון שלך בלבד.</p></div>` : ''}`;
};

''')
s=s.replace("  if (j.data && j.settings) { // גיבוי מלא\n    merge(S.data, j.data); return 'שוחזר גיבוי';\n  }\n","")
s=s.replace("const add = (c, o) => { const it = { id: uid(), ...o }; it.u = Date.now(); S.data[c].push(it); };","const add = (c, o) => put(c, { id: uid(), ...o });")
s=s.replace("const b = { id: uid(), name: 'ציור בחול', u: Date.now() }; S.data.bizs.push(b);","const b = { id: uid(), name: 'ציור בחול' }; put('bizs', b);")
s=cut(s,"function printInv(id) {","/* ---------- הזנה מהירה",'''function printInv(id) {
  const i0 = live('invoices').find(x => x.id === id), b = live('bizs').find(x => x.id === i0.biz) || {}; let i = i0;
  if (!i.num) { i = { ...i, num: Math.max(0, ...live('invoices').filter(x => x.biz === i.biz && x.kind === i.kind).map(x => +x.num || 0)) + 1 }; put('invoices', i); }
  const txt = `${i.kind} מס' ${i.num}\\n${b.name || ''} ${b.taxid ? 'עוסק מס\\' ' + b.taxid : ''}\\nתאריך: ${i.date.split('-').reverse().join('/')}\\nלכבוד: ${i.client}\\n${i.desc}\\nסה"כ: ${fmt(i.amount)}`;
  const m = modal(`<div style="background:#fff;color:#000;padding:16px;border-radius:10px"><h2>${esc(i.kind)} מס' ${i.num}</h2><p><b>${esc(b.name || '')}</b><br>${esc(b.taxid ? 'עוסק מס\\' ' + b.taxid : '')} ${esc(b.phone || '')}<br>${esc(b.address || '')}</p><p>תאריך: ${i.date.split('-').reverse().join('/')}<br>לכבוד: <b>${esc(i.client)}</b></p><table style="color:#000"><tr><th>תיאור</th><th>סכום</th></tr><tr><td>${esc(i.desc)}</td><td>${fmt(i.amount)}</td></tr><tr class="tot" style="color:#000"><td>סה"כ</td><td>${fmt(i.amount)}</td></tr></table></div><div class="row" style="margin-top:12px"><button class="b" id="cp">העתקת הטקסט</button><button class="b sec" id="cl">סגירה</button></div>`);
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelector('#cp').onclick = () => navigator.clipboard.writeText(txt).then(() => toast('הועתק'), () => toast('אפשר לצלם מסך'));
}

''')
s=s.replace("const a = live('accounts').find(x => x.id === t.acct); if (a) { a.balance = (+a.balance || 0) + (type === 'income' ? amt : -amt); put('accounts', a); }","const a = live('accounts').find(x => x.id === t.acct); if (a) put('accounts', { ...a, balance: (+a.balance || 0) + (type === 'income' ? amt : -amt) });")
s=cut(s,"/* ---------- מסך כניסה","/* ---------- ציור","")
s=s.replace("  if (!ME) return loginView();\n","")
s=s.replace("  const ys = years(); if (!curYear","  if (!ready) { $('#app').innerHTML = '<main><p class=\"mut\">טוען…</p></main>'; return; }\n  const ys = years(); if (!curYear")
s=cut(s,"  $('#logout')","  $('#s-save')","")
s=re.sub(r"  \$\('#y-save'\).*?\n  const cl = .*?\n  \$\('#y-in'\).*?\n  \$\('#adduser'\).*?\}\);\n  R\.querySelectorAll\('\[data-deluser'\].*?\n  \$\('#exp'\).*?\n","",s,flags=re.S)
s=cut(s,"function start() {","\n(function init()",'')
s=cut(s,"(function init() {","\n\x00" if False else "\x00" if False else s[-3:],"") if False else s
i=s.index("(function init() {"); s=s[:i]+(INIT_SITE if MODE=='site' else '''(async function init() {
  render();
  let db = null, user = null;
  try { db = await claude.use('db'); user = await claude.use('user'); } catch (e) { }
  if (!db) { $('#app').innerHTML = '<main><div class="alert r">אי אפשר לפתוח את מסד הנתונים. התחבר ל-claude.ai ופתח שוב.</div></main>'; return; }
  DB = db; try { if (user && !(await user.canEdit())) ME.role = 'view'; } catch (e) { }
  let t = 0, got = new Set(); const need = COLL.length + 1;
  const kick = () => { clearTimeout(t); t = setTimeout(() => { ready = true; render(); }, 60); };
  const mark = k => { got.add(k); if (got.size >= need) ready = true; kick(); };
  COLL.forEach(c => db.collection(c).onSnapshot(sn => { S.data[c] = sn.docs.map(d => d.data()); mark(c); }, dbErr));
  db.doc('settings/main').onSnapshot(sn => { if (sn.exists) Object.assign(S.settings, sn.data()); mark('settings'); }, dbErr);
  setTimeout(() => { if (!ready) { ready = true; render(); } }, 4000);
})();
''')
s=re.sub(r"  R\.querySelectorAll\('\[data-deluser'\\]'?.*?\n",'',s)
s=re.sub(r"[^\n]*data-deluser[^\n]*\n",'',s)
# הסרת אחסון מקומי ו-service worker
s=s.replace("<h1>${esc(S.settings.family || 'תקציב המשפחה')}</h1>","<h1>${esc(S.settings.family || 'תקציב המשפחה')}</h1>${window.BUDGET_EXIT ? `<a href=\"${esc(window.BUDGET_EXIT[0])}\" style=\"color:#fff\">${esc(window.BUDGET_EXIT[1])}</a>` : ''}")
assert 'localStorage' not in s and 'sessionStorage' not in s, [m.start() for m in re.finditer('localStorage|sessionStorage',s)]
# עיצוב: אותו עיצוב עם ערכות נושא
css=re.sub(r"@media\(prefers-color-scheme:dark\)\{:root\{(.*?)\}\}",lambda m:"@media(prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){%s;color-scheme:dark}}\n:root[data-theme=\"dark\"]{%s;color-scheme:dark}"%(m.group(1),m.group(1)),css,flags=re.S)
css+="\nheader{top:env(safe-area-inset-top,0px)}\nbody{padding-inline:0}nav{padding-bottom:env(safe-area-inset-bottom,0px)}\n.card{overflow-wrap:anywhere}\n"
if MODE=='artifact':
    html=f'<title>תקציב המשפחה</title>\n<style>\n{css}\n</style>\n<div id="app"></div>\n<script>\n{s}\n</script>\n'
    open(OUT+'/artifact.html','w',encoding='utf-8').write(html); print(len(html))
else:
    open(OUT+'/budget.js','w',encoding='utf-8').write(s); open(OUT+'/budget.css','w',encoding='utf-8').write(css); print('site',len(s),len(css))
