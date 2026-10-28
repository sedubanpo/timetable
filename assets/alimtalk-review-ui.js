(function(root){
'use strict';
function mount({host,api,context}){
 let generation=0,busy=false,source=null,candidate=null,mapping=null,contacts=null,savedState=null;
 const el=(t,s)=>{const n=document.createElement(t);if(s!==undefined)n.textContent=s;return n;};
 const field=(label,type='text')=>{const l=el('label',label),i=el('input');i.type=type;l.append(i);return [l,i];};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;return b;};
 const reset=()=>{generation++;busy=false;source=candidate=mapping=contacts=null,savedState=null;host.replaceChildren();};
 async function run(fn){if(busy)return;busy=true;const g=++generation,key=JSON.stringify(context());host.querySelectorAll('button').forEach(b=>b.disabled=true);let timer;
 try{await Promise.race([fn(()=>g===generation&&key===JSON.stringify(context())),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('요청 시간 초과 — 저장 결과를 확인한 뒤 다시 진행하세요.')),8000);})]);}
 catch(e){if(g===generation&&key===JSON.stringify(context())){const p=el('p',e.code||e.message||'확인 실패');p.setAttribute('role','alert');host.append(p,button('연결 기록 다시 확인',()=>open()));}}
 finally{clearTimeout(timer);if(g===generation){generation++;busy=false;host.querySelectorAll('button').forEach(b=>b.disabled=false);}}}
 async function open(){reset();return run(async current=>{const s=await api('inspect',context());if(!current())return;source=s;draw();});}
 function draw(){host.replaceChildren(el('h3','학생 연결 · 연락 가능 확인'),el('p','원본 수업을 선택하고 학생 ID를 확인하세요. 같은 이름이라는 이유로 자동 연결하지 않습니다.'));
 const list=el('fieldset');list.append(el('legend',source.date+' 원본 시간표'));const ids=[];
 for(const entry of source.entries){const [l,c]=field(entry.label+' · '+entry.summary,'checkbox');c.onchange=()=>{if(c.checked)ids.push(entry.id);else ids.splice(ids.indexOf(entry.id),1);};list.append(l);}host.append(list);
 const [searchLabel,query]=field('학생 이름 또는 ID');host.append(searchLabel);
 const result=el('div'),confirmArea=el('div');
 host.append(button('학생 후보 검색',()=>run(async current=>{const r=await api('candidates',{query:query.value});if(!current())return;candidate=null;confirmArea.replaceChildren();result.replaceChildren();for(const c of r.candidates){const b=button([c.name,c.school,c.grade,c.status,'ID: '+c.id].filter(Boolean).join(' · '),()=>{run(async valid=>{const state=await api('reviewState',{...context(),studentId:c.id});if(!valid())return;candidate=c;savedState=state;confirmArea.replaceChildren(el('p','선택 학생: '+c.name+' · '+c.id+(state.mappingRevision?' · 기존 연결 기록 있음':'')));});});result.append(b);}if(!r.candidates.length)result.append(el('p','검색 결과 없음'));})),result,confirmArea);
 const [confirmLabel,confirmed]=field('선택한 원본 수업이 이 학생의 수업임을 확인했습니다.','checkbox');host.append(confirmLabel);
 host.append(button('학생 연결 저장',()=>run(async current=>{if(!candidate||!ids.length||!confirmed.checked)throw Error('원본 수업·학생·확인을 모두 선택하세요.');const r=await api('saveMapping',{...context(),sourceRevision:source.revision,entryIds:ids.slice(),studentId:candidate.id,confirmed:true,expectedRevision:savedState?.mappingRevision||null});if(!current())return;mapping=r;await showContacts(current);})));}
 async function showContacts(current){const r=await api('contactChoices',{...context(),studentId:mapping.studentId});if(!current())return;contacts=r;host.replaceChildren(el('h3',r.name+' · 연락 가능 확인'),el('p','원본 문의의 연락 금지 여부를 포함해 실제 확인한 관계만 선택하세요. 기존 연락 금지 기록을 해제하는 기능이 아닙니다.'));const relations=[];
 for(const c of r.choices){const [l,i]=field(c.relation+' · '+c.masked+(c.available?'':' · 확인 필요'),'checkbox');i.disabled=!c.available;i.onchange=()=>{if(i.checked)relations.push(c.id);else relations.splice(relations.indexOf(c.id),1);};host.append(l);}
 const [campusLabel,campus]=field('이 학생의 반포관 수업임을 확인했습니다.','checkbox'),[contactLabel,contact]=field('선택한 수신자에게 연락 가능한지 확인했습니다.','checkbox'),[noteLabel,note]=field('확인 근거 (개인 연락처는 입력하지 마세요)');note.maxLength=500;host.append(campusLabel,contactLabel,noteLabel);
 host.append(button('연락 확인 기록 저장',()=>run(async valid=>{if(!relations.length||!campus.checked||!contact.checked||!note.value.trim())throw Error('수신자와 확인 항목·근거를 입력하세요.');const saved=await api('saveClearance',{...context(),studentId:mapping.studentId,mappingRevision:contacts.mappingRevision,contactVersion:contacts.contactVersion,relations:relations.slice(),campusConfirmed:true,contactConfirmed:true,note:note.value,expectedRevision:savedState?.clearanceRevision||null});if(!valid())return;host.replaceChildren(el('h3','확인 기록 저장됨'),el('p','이제 알림톡 미리보기에서 전체 본문과 수신자를 다시 확인하세요. 아직 메시지를 보내지 않았습니다.'),el('p','기록 버전: '+saved.revision));})));}
 return {open,reset};
}
root.TimetableAlimtalkReviewUI={mount};
})(globalThis);
