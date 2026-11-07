'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{parseSnapshot,createMappedDay}=require('../snapshot-functions/alimtalk-grid'),{hash}=require('../snapshot-functions/alimtalk-service');
global.fetch=()=>{throw Error('OUTBOUND_FORBIDDEN');};
const now=Date.parse('2026-11-07T03:00:00Z');
function fixture(){const grid={},owners={};for(let h=8;h<=23;h++){grid[h]=[[]];owners[h]=[[]];}grid[16]=[['1:1 수학 가상T','가학생 가상중2 정규']];return {schema:1,date:'2026-11-07',sheet:'11/7(토)',capturedAt:now,data:{headers:['2관 3강의실'],version:'v1',grid},owners,rooms:{rooms:['2관 3강의실'],rows:[]}};}
test('actual string grid produces explicit source references and exact room metadata',()=>{const s=parseSnapshot(fixture(),now);assert(s.complete);assert.equal(s.entries[0].lesson.building,'2관');assert.equal(s.entries[0].lesson.room,'3강의실');assert.equal(s.entries[0].lesson.type,'1:1');assert.equal(s.entries[0].lesson.teacher,'가상');});
test('unsupported room/student strings held; missing headers not guessed',()=>{const x=fixture();x.data.headers=['unknown'];assert(parseSnapshot(x,now).complete);assert.deepEqual(parseSnapshot(x,now).entries[0].lesson.reviewReasons,['강의실 표기 확인 필요']);const y=fixture();y.data.grid[16][0]=['공지사항'];assert(!parseSnapshot(y,now).complete);const z=fixture();z.data.grid[16][0]=['가학생 가상중2 정규'];assert.equal(parseSnapshot(z,now).entries[0].lesson.teacher,'');});
test('cancelled source remains mapped with exclusion status; generated gaps not invented',()=>{const x=fixture();x.data.grid[16][0][1]='가학생 가상중2 당일취소';const s=parseSnapshot(x,now);assert.equal(s.entries.length,1);assert.equal(s.entries[0].lesson.status,'당일취소');});
test('mapped day needs complete source coverage and matching revisions',async()=>{const s=parseSnapshot(fixture(),now),e=s.entries[0],a={[hash(e.id)]:{studentId:'s1',fingerprint:e.fingerprint,revision:'m1'}},m={academyId:'banpo',date:s.date,studentId:'s1',sourceRevision:s.revision,revision:'m1',verifiedBy:'admin',entries:[{id:e.id,fingerprint:e.fingerprint}]};const load=createMappedDay({loadSource:async()=>s,readDayAssignments:async()=>a,readMapping:async()=>m});const day=await load({academyId:'banpo'},s.date,['s1']);assert.equal(day.students[0].lessons[0].studentId,'s1');a[hash(e.id)].fingerprint='changed';await assert.rejects(load({academyId:'banpo'},s.date,['s1']),{code:'SOURCE_MAPPING_INCOMPLETE'});});
test('note-based partial-hour schedule is held rather than silently sent as full-hour',()=>{const s=fixture();s.data.grid[16][0][1]='가학생 가상중2 정규 16:30 등원';const parsed=parseSnapshot(s,now);assert.equal(parsed.complete,true);assert.equal(parsed.entries.length,1);assert.deepEqual(parsed.entries[0].lesson.reviewReasons,['시간 메모 확인 필요']);});

test('cancelled entries keep identity coverage but time/room notes do not prevent exclusion',()=>{const s=fixture();s.data.headers=['휴강 명단'];s.data.grid[16][0][1]='가학생 가상중2 정규 16:30 등원';const p=parseSnapshot(s,now);assert(p.complete);assert.equal(p.entries.length,1);assert.equal(p.entries[0].lesson.status,'휴강');assert.deepEqual(p.entries[0].lesson.reviewReasons,[]);const R=require('../snapshot-functions/alimtalk-contract');const result=R.normalize([{...p.entries[0].lesson,studentId:'s1'}],'s1',s.date);assert.equal(result.excluded[0].reason,'휴강');assert.equal(result.lessons.length,0);});
test('mapped held occurrence is retained and blocks its student without poisoning other students',async()=>{const s=fixture();s.data.grid[17]=[['1:1 수학 가상T','나학생 가상중2 정규 17:30 등원']];const p=parseSnapshot(s,now),assignments={},mappings={};p.entries.forEach((e,i)=>{const id='s'+i,revision='m'+i;assignments[hash(e.id)]={studentId:id,fingerprint:e.fingerprint,revision};mappings[id]={academyId:'banpo',date:s.date,studentId:id,sourceRevision:p.revision,revision,verifiedBy:'admin',entries:[{id:e.id,fingerprint:e.fingerprint}]};});const load=createMappedDay({loadSource:async()=>p,readDayAssignments:async()=>assignments,readMapping:async(a,d,id)=>mappings[id]});const day=await load({academyId:'banpo'},s.date,['s0','s1']);const R=require('../snapshot-functions/alimtalk-contract');assert.equal(R.normalize(day.students[0].lessons,'s0',s.date).reasons.length,0);assert(R.normalize(day.students[1].lessons,'s1',s.date).reasons.includes('시간 메모 확인 필요'));delete assignments[hash(p.entries[1].id)];await assert.rejects(load({academyId:'banpo'},s.date,['s0']),{code:'SOURCE_MAPPING_INCOMPLETE'});});
test('regular hours and supplemental half hour stay separate in the actual message variables',()=>{
 const s=fixture(),rules=require('../snapshot-functions/alimtalk-contract');
 s.data.grid[16]=[[]];
 for(const h of [13,14,15])s.data.grid[h]=[['개별 사탐 검증T','가학생 가상고3 '+(h===15?'보충 11/7(토) 확정, 3:00-3:30, 5일 미진행 된 개별 30분에 대한 보충':'정규 11/7(토) 확정')]];
 const compose=()=>rules.compose({id:'s',name:'가학생',mappingVerified:true},s.date,parseSnapshot(s,now).entries.map(e=>({...e.lesson,studentId:'s'})));
 const result=compose();assert.deepEqual(result.reasons,[]);assert.deepEqual(result.lessons.map(l=>[l.start,l.end,l.status]),[[780,900,'정규'],[900,930,'보충']]);
 assert.match(result.variables['#{수업목록}'],/① 사탐 정규 13:00–15:00\n검증T · 개별 2시간[\s\S]*② 사탐 보충 15:00–15:30\n검증T · 개별 30분/);
 for(const note of ['3:00-3:30, 3:30-4:00','9:00-9:30','3:00-3:30, 16:00 등원','3:15-3:45']){
  s.data.grid[15][0][1]='가학생 가상고3 보충 '+note;assert(compose().reasons.includes('시간 메모 확인 필요'),note);
 }
});
test('study cafe accepts the makeup cutoff and preserves the preceding regular lessons',()=>{
 const s=fixture(),R=require('../assets/alimtalk-contract');
 s.data.headers=['스터디카페'];
 for(const h of [12,13,14,15,16]){
   const status=h===16?'결석보강 11/7(토), 16:30까지 보강':'정규';
   s.data.grid[h]=[['1:1 '+(h<14?'수학':'과학')+' 검증T','가학생 가상초5 '+status]];
 }
 const c=R.compose({id:'s',name:'가학생',mappingVerified:true},s.date,parseSnapshot(s,now).entries.map(e=>({...e.lesson,studentId:'s'})));
 assert.deepEqual(c.reasons,[]);
 assert.deepEqual(c.lessons.map(l=>[l.subject,l.status,l.start,l.end,l.building,l.room]),[
   ['수학','정규',720,840,'본관','스터디카페'],['과학','정규',840,960,'본관','스터디카페'],['과학','결석보강',960,990,'본관','스터디카페']
 ]);
 assert.match(c.text,/과학 결석보강 16:00–16:30/);
});
test('source subtypes and day-specific shorthand survive both message formatting and card time resolution',()=>{
 const R=require('../assets/alimtalk-contract');
 for(const [from,to,raw,label] of [
   [13,15,'당취보충 11/7(토) 수업은 11/6(금) 2시간 당취에 대한 당취보충','당취보충'],
   [18,21,'신규생 11/7(토)부터 합류, 오늘만 18-21시. 이후로 시간 수정.','신규생 · 오늘만'],
   [19,22,'첫수업 11/7(토) 첫수업. 오늘만 19-22시, 다음주부터 조정','첫수업 · 오늘만']
 ]){
   const s=fixture();s.data.grid[16]=[[]];
   for(let h=from;h<to;h++)s.data.grid[h]=[['개별 과학 검증T','가학생 가상중3 '+raw]];
   const c=R.compose({id:'s',name:'가학생',mappingVerified:true},s.date,parseSnapshot(s,now).entries.map(e=>({...e.lesson,studentId:'s'})));
   assert.deepEqual(c.reasons,[]);assert.equal(c.lessons.length,1);
   assert(c.text.includes('과학 '+label+' '+from+':00–'+to+':00'));
   const card=R.cardTimeRange(from,to,raw);assert.equal(card.start,from);assert.equal(card.end,to);assert.equal(card.todayOnly,label.includes('오늘만'));
 }
});

test('arrival records preserve a contiguous regular schedule; uncertain lesson starts remain held',()=>{
 const R=require('../assets/alimtalk-contract');
 for(const status of ['정규','지각']){
  const s=fixture();s.data.grid[16]=[[]];
  s.data.grid[10]=[['개별 국어 검증T','가학생 가상중3 '+status+' 지각, 10:11 도착']];
  s.data.grid[11]=[['개별 국어 검증T','가학생 가상중3 정규']];
  const c=R.compose({id:'s',name:'가학생',mappingVerified:true},s.date,parseSnapshot(s,now).entries.map(e=>({...e.lesson,studentId:'s'})));
  assert.deepEqual(c.reasons,[]);assert.equal(c.lessons.length,1);assert.match(c.text,/국어 정규 10:00–12:00/);
 }
 assert.equal(R.readTimeNote('지각, 10시 또는 11시 시작','정규').held,true);
 assert.equal(R.readTimeNote('지각, 10:20 도착예정','정규').held,false);
});

test('held arrival/start note keeps the full grid lesson visible without permitting send',()=>{
 const R=require('../snapshot-functions/alimtalk-contract'),s=fixture();s.data.grid[16]=[[]];
 for(let h=10;h<13;h++)s.data.grid[h]=[['개별 수학 검증T','가학생 가상고2 정규'+(h===10?' 지각, 10시 또는 11시 시작':'')]];
 const c=R.compose({id:'s',name:'가학생',mappingVerified:true},s.date,parseSnapshot(s,now).entries.map(e=>({...e.lesson,studentId:'s'})));
 assert.deepEqual(c.reasons,['시간 메모 확인 필요']);assert.equal(c.lessons.length,1);assert.match(c.text,/수학 정규 10:00–13:00/);
});

test('only timing instructions for the lesson date affect a server preview',()=>{
 const R=require('../snapshot-functions/alimtalk-contract'),s=fixture();
 s.data.grid[16]=[[]];
 for(let h=10;h<13;h++)s.data.grid[h]=[['개별 수학 검증T','가학생 가상고2 정규 10/31(토), 지각, 10시 또는 11시 시작']];
 const compose=()=>R.compose({id:'s',name:'가학생',mappingVerified:true},s.date,parseSnapshot(s,now).entries.map(e=>({...e.lesson,studentId:'s'})));
 assert.deepEqual(compose().reasons,[]);assert.match(compose().text,/수학 정규 10:00–13:00/);
 s.data.grid[10][0][1]+='\n11/7(토) 10:30–13:00';
 assert.deepEqual(compose().reasons,[]);assert.match(compose().text,/정규 10:30–13:00/);
 s.data.grid[10][0][1]='가학생 가상고2 정규 11/7(토), 10시 또는 11시 시작';
 assert.deepEqual(compose().reasons,['시간 메모 확인 필요']);
});
test('retaker aliases are academic fields, not a match on words in a note',()=>{
 const R=require('../snapshot-functions/alimtalk-contract'),s=fixture();
 for(const label of ['고3@','재수','재수1','재수2','재수생','교육청','교육청3']){
  s.data.grid[16][0][1]='가학생 '+label+' 정규';
  const e=parseSnapshot(s,now).entries[0];assert.equal(e.sourceSchool,'재수생');assert.deepEqual(e.lesson.reviewReasons,[]);
 }
 for(const [school,grade] of [['재수','1'],['고','3@'],['교육청','3']])assert.equal(R.directorySchoolKey(school,grade),'재수생');
 s.data.grid[16][0][1]='가학생 가상고3 정규 교육청 모의고사';assert.equal(parseSnapshot(s,now).entries[0].sourceSchool,'가상고3');
 s.data.grid[16][0][1]='가학생 정규 교육청 모의고사';assert.equal(parseSnapshot(s,now).entries[0].sourceSchool,'');
 assert.equal(R.directorySchoolKey('가상고','3'),'가상고3');
});

test('standalone self study heading is not a student and does not block the date',()=>{
 for(const label of ['자습','자기주도','자기주도학습']){
  const s=fixture();s.data.grid[15]=[[label]];const p=parseSnapshot(s,now);
  assert(p.complete);assert.equal(p.entries.length,1);assert.equal(p.entries[0].sourceName,'가학생');
 }
 const s=fixture();s.data.grid[15]=[['자기주도 확인필요']];assert.equal(parseSnapshot(s,now).complete,false);
});
