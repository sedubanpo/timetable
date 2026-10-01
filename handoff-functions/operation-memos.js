'use strict';

// Server-only, fixed project/table. Neither a browser URL nor a browser key is accepted.
const BASE = 'https://jtdhvkotlvznedqixsvv.supabase.co/rest/v1/';
const FIELDS = 'id,date_key,sheet_name,student_name,target_school,target_grade,type,message,severity,active,created_at,updated_at,created_by';
const INPUT = ['date_key','sheet_name','student_name','target_school','target_grade','type','message','severity'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(code) { throw Object.assign(new Error(code), {code}); }
function date(value) {
  if (typeof value !== 'string' || !/^20\d\d-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) fail('INVALID_DATA');
  return value;
}
function text(value, max) { if (typeof value !== 'string' || value.length > max) fail('INVALID_DATA'); return value.trim(); }
function validate(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(k=>!INPUT.includes(k))) fail('INVALID_DATA');
  const row = {date_key:date(value.date_key),sheet_name:text(value.sheet_name,100),student_name:text(value.student_name,100),target_school:text(value.target_school,100),target_grade:text(value.target_grade,20),type:text(value.type,20),message:text(value.message,3000),severity:text(value.severity,20)};
  if (!['common','student','school'].includes(row.type) || !['info','warning','danger'].includes(row.severity) || !row.student_name) fail('INVALID_DATA');
  if (row.type==='common' && !row.message || row.type==='school' && (!row.target_school || !row.target_grade)) fail('INVALID_DATA');
  if (row.type!=='school' && (row.target_school || row.target_grade)) fail('INVALID_DATA');
  return row;
}
function isPrivilegedKey(key) {
  if (typeof key !== 'string' || !key) return false;
  if (key.startsWith('sb_secret_')) return true;
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch { return false; }
}
function createStore({key, fetchImpl=fetch}) {
  if (!isPrivilegedKey(key)) fail('SERVER_NOT_CONFIGURED');
  async function request(query, method='GET', body, prefer) {
    const headers = {apikey:key,Accept:'application/json','Content-Type':'application/json'};
    // New secret keys are not JWTs; only legacy service-role JWTs use Bearer.
    if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer '+key;
    if (prefer) headers.Prefer = prefer;
    let response;
    try { response = await fetchImpl(BASE+query,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)}); } catch { fail('UNAVAILABLE'); }
    if (!response.ok) fail('UNAVAILABLE'); // Never return upstream body/headers/URL/key.
    if (response.status===204) return [];
    let rows; try { rows = await response.json(); } catch { fail('UNAVAILABLE'); }
    if (!Array.isArray(rows)) fail('UNAVAILABLE');
    return rows;
  }
  const find = (id, day) => request('operation_memos?select='+FIELDS+'&id=eq.'+id+'&date_key=eq.'+day+'&limit=1');
  return {
    list:day=>request('operation_memos?select='+FIELDS+'&date_key=eq.'+day+'&active=eq.true&order=updated_at.desc&limit=1000'),
    async create(id, payload, who) {
      const expected = {...payload,created_by:who.uid,active:true};
      const now = new Date().toISOString();
      const inserted = await request('operation_memos?select='+FIELDS+'&on_conflict=id','POST',{id,...expected,created_at:now,updated_at:now},'resolution=ignore-duplicates,return=representation');
      const row = inserted[0] || (await find(id,payload.date_key))[0];
      if (!row || Object.keys(expected).some(k=>row[k]!==expected[k])) fail('CONFLICT');
      return [row];
    },
    async update(id, payload) {
      if (!(await find(id,payload.date_key)).length) fail('NOT_FOUND');
      const rows = await request('operation_memos?select='+FIELDS+'&id=eq.'+id+'&date_key=eq.'+payload.date_key,'PATCH',{...payload,active:true,updated_at:new Date().toISOString()},'return=representation');
      if (!rows.length) fail('NOT_FOUND');
      return rows;
    },
    remove:(id,day)=>request('operation_memos?id=eq.'+id+'&date_key=eq.'+day,'DELETE',undefined,'return=minimal')
  };
}
async function handle(store, who, body) {
  if (!who || !who.admin || !who.uid) fail('FORBIDDEN');
  if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['action','date','id','data'].includes(k))) fail('INVALID_DATA');
  const day=date(body.date);
  if (body.action==='list') return {items:await store.list(day)};
  if (!['create','update','delete'].includes(body.action)) fail('INVALID_ACTION');
  if (typeof body.id!=='string' || !UUID.test(body.id)) fail('INVALID_DATA');
  if (body.action==='delete') { await store.remove(body.id,day); return {items:[]}; }
  const data=validate(body.data);
  if (data.date_key!==day) fail('INVALID_DATA');
  return {items:await store[body.action](body.id,data,who)};
}
module.exports={createStore,handle,validate,isPrivilegedKey};
