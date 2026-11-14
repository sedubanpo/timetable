(function(root){
'use strict';
const errors={SOURCE_CHANGED:'수업이 변경되었습니다. 연락처 화면을 다시 열어 확인해 주세요.',CONTACT_CHANGED:'등록 연락처가 변경되었습니다. 다시 조회해 주세요.',REVIEW_CONFLICT:'다른 근무자가 연락처를 수정했습니다. 다시 조회해 주세요.',MAPPING_CONFLICT:'학생 연결이 변경되었습니다. 다시 조회해 주세요.',ENTRY_ALREADY_ASSIGNED:'다른 학생에게 연결된 수업입니다. 학생 연결부터 확인해 주세요.',STUDENT_SCHOOL_MISMATCH:'원장과 시간표의 학교·학년이 다릅니다. 학생 연결에서 먼저 확인해 주세요.',CONTACT_REQUIRED:'등록 번호가 없습니다. 학생 또는 학부모 임시 번호를 입력해 주세요.',INVALID_PHONE:'임시 번호는 010으로 시작하는 휴대전화 번호 11자리로 입력해 주세요.',DIRECTORY_CONTACT_EXISTS:'등록된 번호가 있는 관계는 임시 번호로 바꿀 수 없습니다.',RESULT_UNCERTAIN:'저장 응답이 늦습니다. 다시 조회해 저장 결과를 확인해 주세요.',TIMEOUT:'조회 응답이 늦습니다. 잠시 후 다시 조회해 주세요.',NO_NOTICE_LESSONS:'선택한 날짜에 안내할 수업이 없습니다.'};
function mount({host,api,context,onReady}){
 let generation=0;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
 const reset=()=>{generation++;};
 async function open(){
  const g=++generation,ctx=context(),current=()=>g===generation&&JSON.stringify(ctx)===JSON.stringify(context());
  host.replaceChildren(el('h3',ctx.name+' · 등록·임시 연락처'));
  const status=el('p','등록 관리의 연락처를 확인하고 있습니다…');status.setAttribute('role','status');host.append(status);
  try{const data=await api('noticeContactOptions',ctx);if(current())draw(data,ctx,current);}catch(e){if(current()){status.textContent=errors[e.code]||'연락처를 조회하지 못했습니다. 다시 조회해 주세요.';host.append(button('다시 조회',open));}}
 }
 function draw(data,ctx,current){
  host.replaceChildren(el('h3',data.name+' · 등록·임시 연락처'));
  const form=el('form');form.className='notice-contact-form';
  form.append(el('p',data.date+' 수업 안내에 사용할 연락처입니다. 등록 관리의 번호를 우선 사용하며, 없는 번호만 임시로 입력할 수 있습니다.'));
  const lesson=el('details');lesson.append(el('summary','이 날짜의 수업 확인'));
  const ul=el('ul');data.lessons.forEach(text=>ul.append(el('li',text)));lesson.append(ul);form.append(lesson);
  const label=el('label','학생 확인'),select=el('select');select.setAttribute('aria-label','연락처를 사용할 학생');
  select.append(new Option('학생을 선택하세요',''));
  for(const c of data.candidates){const option=new Option([c.name,c.school+c.grade,c.guest?'원장 미등록 · 이 날짜만 사용':c.inactive?'중지 · 임시 참여':'등록 학생',!c.matches?'학교·학년 불일치':''].filter(Boolean).join(' · '),c.id);option.disabled=!c.matches;select.append(option);}
  label.append(select);form.append(label);
  const choices=el('div'),confirmLabel=el('label'),confirm=el('input');confirm.type='checkbox';
  confirmLabel.append(confirm,document.createTextNode('이 학생의 수업과 수신자 관계를 확인했습니다.'));
  const status=el('p');status.setAttribute('role','status');
  const save=el('button','이 날짜의 연락처 저장');save.type='submit';save.className='notice-contact-save';
  const retry=button('등록 연락처 다시 조회',open);
  form.append(choices,el('p','임시 연락처는 이 수업일에만 적용됩니다. 등록 관리의 번호와 중지 상태는 유지됩니다.'),confirmLabel,status,save,retry);
  const fields=new Map();let selected;
  function render(){
   selected=data.candidates.find(c=>c.id===select.value);fields.clear();choices.replaceChildren();confirm.checked=false;save.disabled=!selected;
   if(!selected)return;
   if(selected.guest)choices.append(el('p','등록 원장을 찾지 못했습니다. 시간표의 이름·학교·학년으로 이 날짜의 안내 대상을 저장합니다.'));
   for(const c of selected.choices){
    const row=el('div');row.className='notice-contact-row';row.append(el('strong',c.relation));
    const value=el('div');row.append(value);
    value.append(el('p',c.available?(c.temporary?'임시 번호 · ':'등록 번호 · ')+c.masked:c.reason));
    if(c.canEnter){
     const inputLabel=el('label',c.relation+' 임시 연락처'),input=el('input');input.type='tel';input.inputMode='tel';input.autocomplete='off';input.maxLength=20;input.placeholder='010-0000-0000';inputLabel.append(input);value.append(inputLabel);
     const keep=el('input');keep.type='checkbox';keep.checked=!!c.temporary;
     if(c.temporary){const l=el('label');l.append(keep,document.createTextNode('기존 임시 번호 유지'));value.append(l);input.oninput=()=>{if(input.value.trim())keep.checked=false;};}
     fields.set(c.id,{input,keep,temporary:c.temporary});
    }else if(!c.available)value.append(el('p','등록 관리에서 연락처 충돌 또는 형식을 수정해 주세요.'));
    choices.append(row);
   }
  }
  select.onchange=render;
  const matches=data.candidates.filter(c=>c.matches);if(matches.length===1)select.value=matches[0].id;render();
  form.onsubmit=async event=>{
   event.preventDefault();if(!current()||save.disabled||!selected)return;
   if(!confirm.checked){status.textContent='학생과 수신자 관계를 확인한 뒤 체크해 주세요.';confirm.focus();return;}
   const temporary={},keepTemporary=[];
   for(const [id,f] of fields){if(f.temporary&&f.keep.checked&&!f.input.value.trim())keepTemporary.push(id);else temporary[id]=f.input.value;}
   const controls=[...form.querySelectorAll('input,select,button')],disabled=controls.map(n=>n.disabled);controls.forEach(n=>n.disabled=true);form.setAttribute('aria-busy','true');status.textContent='연락처를 저장하고 있습니다…';
   try{
    const result=await api('saveNoticeContacts',{...ctx,studentId:selected.id,sourceFingerprint:data.sourceFingerprint,contactVersion:selected.contactVersion,expectedRevision:selected.expectedRevision,temporary,keepTemporary,confirmed:true});
    if(!current())return;
    host.replaceChildren(el('h3',data.name+' · 연락처 저장 완료'),el('p',data.date+' 수업 안내에 적용했습니다. 수업 비고 등 다른 확인 사항은 그대로 유지됩니다. 아직 알림톡을 보내지 않았습니다.'),button('발송 준비 확인',()=>{if(current())onReady(result);}));
   }catch(e){if(current())status.textContent=errors[e.code]||'저장하지 못했습니다. 입력한 번호를 유지했으니 확인 후 다시 시도해 주세요.';}
   finally{if(current()){controls.forEach((n,i)=>n.disabled=disabled[i]);form.removeAttribute('aria-busy');}}
  };
  host.append(form);
 }
 return {open,reset};
}
root.TimetableNoticeContactsUI={mount};
})(globalThis);
