(function(root){
  'use strict';
  const R=root.TimetableAlimtalk;
  function mount({host,api,context,deadline=10000}){
    let preview=null,selection=[],generation=0,busy=false,requestContext='';
    function current(g){if(g!==generation)return false;if(requestContext!==JSON.stringify(context())){reset();shell();host.append(el('p','학생·날짜·로그인 상태가 변경됐습니다. 다시 미리보기해 주세요.'));return false;}return true;}
    const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
    const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
    function reset(){generation++;preview=null;selection=[];busy=false;host.replaceChildren();}
    function shell(){host.replaceChildren();host.append(el('h3','알림톡 안내'));const note=el('p','수동 전달 표시와 알림톡 결과는 별도로 관리됩니다. 수신자를 선택한 뒤 전체 본문을 확인해 주세요.');host.append(note);}
    function error(e){const messages={TIMEOUT:'요청 시간이 초과되었습니다. 재발송 전에 발송 결과를 확인하세요.',AUTH_CONNECTION_FAILED:'로그인 연결을 불러오지 못했습니다.',TOKEN_UNAVAILABLE:'로그인 인증을 확인하지 못했습니다. 로그인 상태를 확인해 주세요.',NETWORK_UNAVAILABLE:'알림톡 서버에 연결하지 못했습니다. 네트워크 또는 브라우저 차단을 확인하세요.',INVALID_RESPONSE:'서버 응답을 해석하지 못했습니다.',UNAUTHORIZED:'관리자 로그인이 필요합니다.',SESSION_CHANGED:'학생·날짜·로그인 상태가 변경됐습니다.'};const code=e&&typeof e.code==='string'&&/^[A-Z_]{1,60}$/.test(e.code)?e.code:'UI_ERROR';const p=el('p','확인을 완료하지 못했습니다. '+(messages[code]||'확인 코드: '+code));p.setAttribute('role','alert');host.append(p,button('미리보기 다시 확인',()=>load()),button('발송 결과 확인',()=>showResults()));}
    async function run(fn){if(busy)return;busy=true;const g=++generation;requestContext=JSON.stringify(context());host.querySelectorAll('button').forEach(b=>b.disabled=true);let timer;try{await Promise.race([fn(g),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('TIMEOUT'),{code:'TIMEOUT'})),deadline);})]);}catch(e){if(current(g))error(e);}finally{clearTimeout(timer);if(current(g)){generation++;busy=false;host.querySelectorAll('button').forEach(b=>{if(!b.dataset.locked)b.disabled=false;});}}}
    function locked(b){b.disabled=true;b.dataset.locked='true';return b;}
    function draw(p){
      shell();preview=p;if(p.testMode)host.append(el('p','관리자 테스트 전용 · '+(p.realScheduleTest?'실제 학생 일정':'가상 학생 일정')+' · '+p.testRecipient+' · 실제 학부모에게는 발송하지 않습니다.'));
      if(!p.rows?.length){host.append(el('p','확인할 학생이 없습니다.'));return;}
      for(const row of p.rows){
        const section=el('section');section.append(el('h4',(row.name||'학생 ID 미확인')+' · '+(row.date||p.date||'')));
        const receivers=el('fieldset');receivers.append(el('legend','수신자 직접 선택'));
        for(const r of row.choices||[]){const label=el('label');const check=el('input');check.type='checkbox';check.checked=(selection.find(t=>t.studentId===row.studentId)?.recipientIds||[]).includes(r.id);
          check.onchange=()=>{preview=null;let target=selection.find(t=>t.studentId===row.studentId);if(!target){target={studentId:row.studentId,recipientIds:[]};selection.push(target);}target.recipientIds=check.checked?[...new Set([...target.recipientIds,r.id])]:target.recipientIds.filter(id=>id!==r.id);send.disabled=true;send.dataset.locked='true';};
          label.append(check,document.createTextNode(' '+r.relation+' · '+r.masked));receivers.append(label);}
        if(!row.choices?.length)receivers.append(el('p','학생 ID로 연결된 수신자 확인이 필요합니다. 자동 선택하지 않습니다.'));
        section.append(receivers);
        for(const r of row.reasons||[])section.append(el('p','보류 · '+r));
        for(const r of row.excluded||[])section.append(el('p','제외 · '+r.reason));
        if(row.text){const pre=el('pre',row.text);pre.setAttribute('aria-label','실제 치환 본문');section.append(pre);}
        host.append(section);
      }
      const c=p.counts||{students:0,messages:0,numbers:0};host.append(el('p','학생 '+c.students+'명 · 메시지 '+c.messages+'건 · 수신번호 '+c.numbers+'개'));
      host.append(button('알림톡 미리보기',()=>load()));
      const send=button(p.testMode?'관리자 번호로 테스트 발송':'선택 알림톡 발송',()=>confirmSend(false));
      if(p.sendEnabled===false)host.append(el('p','실제 발송은 아직 비활성화되어 있습니다. 관리자 테스트 번호 지정 후 활성화합니다.'));
      if(p.sendEnabled===false||!p.previewId||!c.messages||p.rows.some(r=>r.reasons.length))locked(send);
      host.append(send,button('발송 결과',()=>showResults()));
    }
    async function load(){return run(async g=>{const ctx=context();if(!ctx.studentId){selection=[];draw({date:ctx.date,rows:[{name:ctx.name,date:ctx.date,reasons:['현재 시간표는 이름 기반입니다. 원본 셀과 학생 ID를 확인한 매핑이 필요합니다.','서버·연락처 연결 전에는 발송할 수 없습니다.'],excluded:[],choices:[],recipients:[]} ]});return;}
      if(!selection.length||selection[0].studentId!==ctx.studentId)selection=[{studentId:ctx.studentId,recipientIds:[]}];
      const p=await api('preview',{date:ctx.date,targets:selection});if(current(g))draw(p);
    });}
    function confirmSend(confirmChanges){
      if(!preview)return;const p=preview,c=p.counts;const box=el('div');box.className='alimtalk-confirm';box.setAttribute('role','group');box.setAttribute('aria-label','알림톡 발송 확인');
      if(p.testMode)box.append(el('p','선택한 관리자에게만 실제 알림톡을 발송합니다. '+(p.realScheduleTest?'실제 학생 일정입니다.':'가상 학생 일정입니다.')));
      box.append(el('p',c.students+'명의 하루 수업 안내 '+c.messages+'건을 '+c.numbers+'개 번호로 요청합니다. API 접수는 수신 완료나 읽음을 뜻하지 않습니다.'));
      const commit=button('확인 후 발송 요청',()=>run(async g=>{
        const r=await api('send',{previewId:p.previewId,confirmChanges});if(!current(g))return;
        if(r.changed){preview=null;shell();host.append(el('p','미리보기 이후 일정 또는 수신자 정보가 변경됐습니다. 다시 미리보기해 주세요.'));changes(r.previous?.rows,r.current?.rows);host.append(button('최신 미리보기',()=>load()));return;}
        if(r.requiresChangeConfirmation){shell();host.append(el('p','이전에 안내한 일정과 다릅니다. 변경 내용을 확인하세요.'));changes(r.changes.map(x=>({text:x.previous})),r.changes.map(x=>({text:x.current})));host.append(button('변경 내용 확인 후 재안내',()=>confirmSend(true)));return;}
        preview=null;renderResults(r.results);
      }));box.append(commit,button('취소',()=>box.remove()));host.querySelector('.alimtalk-confirm')?.remove();host.append(box);commit.focus();
    }
    function changes(before=[],after=[]){host.append(el('h4','이전 안내'));before.forEach(x=>host.append(el('pre',x.text||'')));host.append(el('h4','현재 안내'));after.forEach(x=>host.append(el('pre',x.text||'')));}
    function renderResults(rows){shell();host.append(el('h4','발송 결과'));if(!rows.length)host.append(el('p','알림톡 이력이 없습니다. 수동 전달 기록과는 별도입니다.'));
      for(const r of rows){const line=el('section');line.append(el('p',(r.date||'')+' · '+r.masked+' · '+(R.labels[r.state]||'결과 확인 필요')));
        if(r.errorCode)line.append(el('p','오류 코드: '+r.errorCode));if(r.messageId)line.append(el('p','메시지 ID: '+r.messageId));if(r.groupId)line.append(el('p','그룹 ID: '+r.groupId));
        if(r.text){const details=el('details');details.append(el('summary','전송 내용 이력'),el('pre',r.text));line.append(details);}
        if(['UNKNOWN','REQUESTING','ACCEPTED','PROCESSING'].includes(r.state))line.append(button('서버에서 결과 확인',()=>run(async g=>{const result=await api('reconcile',{id:r.id});if(current(g))renderResults([result]);})));
        host.append(line);}
      host.append(button('알림톡 미리보기',()=>load()));
    }
    async function showResults(){return run(async g=>{const ctx=context();if(!ctx.studentId){shell();host.append(el('p','학생 ID 연결 전에는 알림톡 이력을 조회할 수 없습니다.'));return;}const r=await api('results',{date:ctx.date,studentIds:[ctx.studentId]});if(current(g))renderResults(r.results);});}
    return {load,showResults,reset};
  }
  root.TimetableAlimtalkUI={mount};
})(globalThis);
