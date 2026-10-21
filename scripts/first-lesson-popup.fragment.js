      // First-lesson details are opt-in reads; the automatic notice contains timetable data only.
      var firstLessonUI = { sequence:0, controller:null, timer:null, noticeTimer:null, dismissed:'', context:'', trigger:null, opener:null };
      function canShowFirstLesson() {
        return !!(authState.loggedIn && !authState.isLookup && !isLookupViewActive() && (authState.isMaster || authState.teacherName));
      }
      function firstLessonContext() { return JSON.stringify([getScheduleSessionKey(),currentSheetName,authState.teacherName,!!authState.isMaster]); }
      function firstLessonButton(name,school,status,subject,teacher) {
        if(!canShowFirstLesson() || !/^(신규생|첫수업)$/.test(normalizeStatusLabel(status||'')))return '';
        clearTimeout(firstLessonUI.noticeTimer);
        firstLessonUI.noticeTimer=setTimeout(updateFirstLessonNotice,100);
        return '<button type="button" class="first-lesson-trigger" data-first-lesson-name="'+escapeHtml(name)+'" data-first-lesson-school="'+escapeHtml(school||'')+'" data-first-lesson-subject="'+escapeHtml(subject||'')+'" data-first-lesson-teacher="'+escapeHtml(teacher||'')+'" aria-haspopup="dialog" aria-label="'+escapeHtml(name)+' 첫수업 정보 보기">첫수업 정보</button>';
      }
      function ensureFirstLessonUI() {
        if(document.getElementById('firstLessonDialog'))return;
        var notice=document.createElement('section');notice.id='firstLessonNotice';notice.hidden=true;notice.setAttribute('aria-label','신규생·첫수업 안내');
        document.querySelector('#mainPage .top-bar').after(notice);
        var dialog=document.createElement('dialog');dialog.id='firstLessonDialog';dialog.setAttribute('aria-labelledby','firstLessonTitle');
        dialog.innerHTML='<header><div><h2 id="firstLessonTitle">첫수업 정보</h2><p id="firstLessonStudent"></p></div><button type="button" class="first-lesson-close" aria-label="첫수업 정보 닫기">닫기</button></header><div id="firstLessonBody" tabindex="0" role="region" aria-label="첫수업 기록" aria-live="polite"></div><footer><span>S-LMS · 일반 학생 기록</span><button type="button" id="firstLessonRetry">다시 조회</button></footer>';
        document.body.append(dialog);
        dialog.querySelector('.first-lesson-close').onclick=closeFirstLesson;
        dialog.addEventListener('cancel',function(e){e.preventDefault();closeFirstLesson();});
        dialog.addEventListener('click',function(e){if(e.target===dialog){var b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeFirstLesson();}});
        document.getElementById('firstLessonRetry').onclick=function(){if(firstLessonUI.trigger)openFirstLesson(firstLessonUI.trigger,firstLessonUI.opener);};
      }
      function scheduleFirstLessonNotice() {clearTimeout(firstLessonUI.noticeTimer);firstLessonUI.noticeTimer=setTimeout(updateFirstLessonNotice,100);}
      function updateFirstLessonNotice() {
        if(!canShowFirstLesson()){invalidateFirstLesson();return;}
        ensureFirstLessonUI();var notice=document.getElementById('firstLessonNotice'),context=firstLessonContext();
        if(firstLessonUI.context!==context){closeFirstLesson();firstLessonUI.context=context;firstLessonUI.dismissed='';}
        var targets=[],seen=new Set(),lessonLabels=new Map();
        document.querySelectorAll('#mainPage [data-first-lesson-name]').forEach(function(b){
          if(b.closest('#firstLessonNotice')||!b.getClientRects().length)return;
          var key=JSON.stringify([b.dataset.firstLessonName,b.dataset.firstLessonSchool]);
          var label=[b.dataset.firstLessonSubject,b.dataset.firstLessonTeacher].filter(Boolean).join(' · ');
          if(!lessonLabels.has(key))lessonLabels.set(key,new Set());if(label)lessonLabels.get(key).add(label);
          if(!seen.has(key)){seen.add(key);targets.push(b);}
        });
        if(!targets.length||firstLessonUI.dismissed===context){notice.hidden=true;return;}
        // Keep detail retry and focus targets current when responsive redraws replace buttons.
        var activeTrigger=firstLessonUI.trigger,noticeOpener=!!(firstLessonUI.opener&&notice.contains(firstLessonUI.opener));
        var activeKey=activeTrigger?JSON.stringify([activeTrigger.dataset.firstLessonName,activeTrigger.dataset.firstLessonSchool]):'';
        notice.replaceChildren();var heading=document.createElement('strong');heading.textContent='신규생·첫수업 '+targets.length+'명';
        var list=document.createElement('div');list.className='first-lesson-notice-list';
        targets.forEach(function(target){var b=document.createElement('button');b.type='button';var name=document.createElement('span');name.className='first-lesson-notice-name';name.textContent=target.dataset.firstLessonName;b.append(name);
          var meta=document.createElement('span');meta.className='first-lesson-notice-meta';meta.textContent=Array.from(lessonLabels.get(JSON.stringify([target.dataset.firstLessonName,target.dataset.firstLessonSchool]))||[]).join(' / ');if(meta.textContent)b.append(meta);b.onclick=function(){openFirstLesson(target,b);};list.append(b);
          if(document.getElementById('firstLessonDialog').open&&activeKey===JSON.stringify([target.dataset.firstLessonName,target.dataset.firstLessonSchool])){
            firstLessonUI.trigger=target;
            if(noticeOpener)firstLessonUI.opener=b;
            else if(firstLessonUI.opener&&!firstLessonUI.opener.isConnected)firstLessonUI.opener=target;
          }
        });
        var dismiss=document.createElement('button');dismiss.type='button';dismiss.className='first-lesson-dismiss';dismiss.textContent='접기';dismiss.setAttribute('aria-label','자동 안내 접기');dismiss.onclick=function(){firstLessonUI.dismissed=context;notice.hidden=true;};
        notice.append(heading,list,dismiss);notice.hidden=false;
      }
      function closeFirstLesson(restoreFocus) {
        firstLessonUI.sequence++;clearTimeout(firstLessonUI.timer);
        if(firstLessonUI.controller)firstLessonUI.controller.abort();firstLessonUI.controller=null;
        var dialog=document.getElementById('firstLessonDialog'),wasOpen=!!(dialog&&dialog.open);if(wasOpen)dialog.close();
        var body=document.getElementById('firstLessonBody');if(body)body.textContent='';
        if(wasOpen&&restoreFocus!==false&&firstLessonUI.opener&&firstLessonUI.opener.isConnected)firstLessonUI.opener.focus({preventScroll:true});
      }
      function invalidateFirstLesson() {
        closeFirstLesson();firstLessonUI.dismissed='';firstLessonUI.context='';clearTimeout(firstLessonUI.noticeTimer);
        var n=document.getElementById('firstLessonNotice');if(n)n.hidden=true;
      }
      async function openFirstLesson(button,opener) {
        if(!canShowFirstLesson()||!button.isConnected)return;
        ensureFirstLessonUI();closeFirstLesson(false);firstLessonUI.trigger=button;firstLessonUI.opener=opener||button;
        var requestTimer;var context=firstLessonContext(),seq=firstLessonUI.sequence,controller=new AbortController();firstLessonUI.controller=controller;
        var dialog=document.getElementById('firstLessonDialog'),body=document.getElementById('firstLessonBody'),retry=document.getElementById('firstLessonRetry');
        var name=button.dataset.firstLessonName,school=button.dataset.firstLessonSchool||'';
        document.getElementById('firstLessonStudent').textContent=name+(school?' · '+school:'');body.textContent='첫수업 정보를 확인하고 있습니다.';retry.disabled=true;
        dialog.showModal();dialog.querySelector('.first-lesson-close').focus();
        function current(){return seq===firstLessonUI.sequence&&context===firstLessonContext()&&canShowFirstLesson()&&!controller.signal.aborted&&dialog.open;}
        function check(){if(!current())throw Error('STALE');}
        async function work(){
          await authorizeReviewRead();check();var auth=await getLiveFirebaseAuth(),user=auth.currentUser;if(!user)throw Error('HTTP_401');var token=await user.getIdToken();check();
          async function query(collection,field,value,limit){
            check();if(auth.currentUser!==user)throw Error('HTTP_401');
            var response=await fetch('https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(LIVE_FIREBASE_CONFIG.projectId)+'/databases/(default)/documents:runQuery',{method:'POST',signal:controller.signal,cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:collection}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:value}}},limit:limit}})});
            if(!response.ok)throw Error('HTTP_'+response.status);var payload=await response.json();check();if(auth.currentUser!==user)throw Error('HTTP_401');
            if(!Array.isArray(payload)||payload.some(function(r){return r.error;}))throw Error('INVALID_RESPONSE');
            return payload.filter(function(r){return r.document;}).map(function(r){return parseFirestoreRestDocument(r.document);});
          }
          // Exact name queries only: never scan students or log collections, never select a namesake arbitrarily.
          var pairs=await Promise.all([query('students','studentName',name,3),query('students','name',name,3)]);
          if(pairs.some(function(a){return a.length>=3;}))throw Error('AMBIGUOUS');
          var ids=new Map();pairs.flat().forEach(function(r){ids.set(r.studentId||r.__id,r);});var students=Array.from(ids.values());
          if(school){var key=normalizeScheduleStudentSchool(school).replace(/\d+$/,'');students=students.filter(function(r){return normalizeScheduleStudentSchool(r.school||'').replace(/\d+$/,'')===key;});}
          if(students.length!==1)throw Error(students.length?'AMBIGUOUS':'NO_STUDENT');
          var student=students[0];if(getEnrollmentStatusLabel(student))throw Error('INACTIVE_STUDENT');
          var records=await query('studentLogs','studentId',String(student.studentId||student.__id),101);
          if(records.length>100)throw Error('LIMIT');
          return records.filter(function(r){var tags=Array.isArray(r.tags)?r.tags:String(r.tagsText||'').split(',');return tags.some(function(t){return String(t).replace(/\s/g,'')==='첫수업정보';});}).sort(function(a,b){return String(b.createdAt||b.updatedAt||'').localeCompare(String(a.createdAt||a.updatedAt||''));});
        }
        try{
          var records=await Promise.race([work(),new Promise(function(_,reject){controller.signal.addEventListener('abort',function(){reject(Error('CANCELLED'));},{once:true});requestTimer=setTimeout(function(){reject(Error('TIMEOUT'));controller.abort();},8500);firstLessonUI.timer=requestTimer;})]);check();body.replaceChildren();
          if(!records.length)body.textContent='등록된 첫수업 정보가 없습니다. S-LMS에서 첫수업 정보를 입력해 주세요.';
          records.forEach(function(r){var article=document.createElement('article'),meta=document.createElement('p'),content=document.createElement('div');meta.className='first-lesson-meta';meta.textContent=[r.createdByName,String(r.createdAt||r.updatedAt||'').slice(0,10)].filter(Boolean).join(' · ');content.className='first-lesson-content';content.textContent=String(r.content||'내용 없음');article.append(meta,content);body.append(article);});
        }catch(error){
          if(seq!==firstLessonUI.sequence||context!==firstLessonContext()||!dialog.open)return;
          var code=error.message||'';
          body.textContent=/401/.test(code)?'로그인이 만료되었습니다. 다시 로그인해 주세요.':/403/.test(code)?'이 학생의 첫수업 정보를 열람할 권한이 없습니다. 관리자에게 확인해 주세요.':code==='AMBIGUOUS'?'동명이인 정보가 있어 학생을 확정할 수 없습니다. S-LMS에서 학생을 확인해 주세요.':code==='NO_STUDENT'?'일치하는 학생 정보를 찾지 못했습니다. 이름과 학교를 S-LMS에서 확인해 주세요.':code==='INACTIVE_STUDENT'?'학생의 등록 상태를 확인해야 합니다. S-LMS에서 확인해 주세요.':code==='LIMIT'?'학생 기록이 많아 일부만 표시하지 않았습니다. S-LMS에서 전체 기록을 확인해 주세요.':code==='TIMEOUT'?'응답이 지연되었습니다. 다시 조회해 주세요.':'첫수업 정보를 불러오지 못했습니다. 다시 조회해 주세요.';
        }finally{clearTimeout(requestTimer);if(seq===firstLessonUI.sequence){retry.disabled=false;firstLessonUI.controller=null;}}
      }
      document.addEventListener('click',function(e){var b=e.target.closest('[data-first-lesson-name]');if(b){e.preventDefault();e.stopPropagation();openFirstLesson(b);}});
      window.addEventListener('pagehide',invalidateFirstLesson);
