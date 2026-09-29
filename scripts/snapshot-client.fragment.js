      // Independent Firebase endpoint: reading a saved copy never calls Apps Script.
      var snapshotView = null, snapshotSaveBusy = false;
      var SNAPSHOT_API_URL = 'https://asia-northeast3-fir-lms-prod.cloudfunctions.net/timetableSnapshotApi';
      function snapshotRequest(action, sheet, teacher, receipt) {
        var session = getScheduleSessionKey();
        var controller = new AbortController();
        var timer = setTimeout(function(){controller.abort();}, action === 'save' ? 95000 : 12000);
        return Promise.resolve().then(function() {
          if (!authState.loggedIn) throw new Error('UNAUTHORIZED');
          if (authState.isLookup) {
            if (!authState.snapshotLookupToken) throw new Error('LOOKUP_RELOGIN_REQUIRED');
            return { lookupToken:authState.snapshotLookupToken };
          }
          return getLiveFirebaseAuth().then(function(auth) {
            if (!auth.currentUser) throw new Error('UNAUTHORIZED');
            return auth.currentUser.getIdToken().then(function(token){return {token:token};});
          });
        }).then(function(identity) {
          if (controller.signal.aborted || session !== getScheduleSessionKey()) throw new Error('SESSION_CHANGED');
          return fetch(SNAPSHOT_API_URL, {method:'POST',signal:controller.signal,cache:'no-store',
            headers:Object.assign({'Content-Type':'application/json'},identity.token?{Authorization:'Bearer '+identity.token}:{}),
            body:JSON.stringify({action:action,sheet:sheet,teacher:teacher||'',lookupToken:identity.lookupToken||'',receipt:receipt||null})});
        }).then(function(response){return response.json();}).then(function(result){
          if (session !== getScheduleSessionKey()) throw new Error('SESSION_CHANGED');
          if (!result || !result.ok) throw new Error(result && result.error || 'SNAPSHOT_UNAVAILABLE');
          return result;
        }).finally(function(){clearTimeout(timer);});
      }
      function setSnapshotNotice(savedAt, message) {
        var bar = document.getElementById('snapshotNotice');
        if (!bar) return;
        var backupAt = savedAt || (snapshotView && snapshotView.savedAt);
        var liveReady = typeof lastSuccessfulSchedule !== 'undefined' && lastSuccessfulSchedule && lastSuccessfulSchedule.sheet === currentSheetName && lastSuccessfulSchedule.session === getScheduleSessionKey();
        bar.hidden = !backupAt && !message && !liveReady;
        var label = document.getElementById('snapshotSourceLabel');
        if (label) label.textContent = backupAt ? '백업 시간표' : (liveReady ? '실시간 시간표' : '시간표 확인 중');
        bar.setAttribute('data-source', backupAt ? 'backup' : 'live');
        var retry = document.getElementById('snapshotRetryBtn');
        if (retry) retry.hidden = !backupAt;
        savedAt = backupAt;
        var stamp = savedAt ? new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(savedAt)) : '';
        document.getElementById('snapshotNoticeText').textContent = message || (savedAt ? (stamp + ' 저장 · 최신 변경 내용은 반영되지 않았을 수 있습니다.' + (Date.now()-savedAt>7200000 ? ' · 저장 후 2시간이 지났습니다.' : '')) : '원본 조회 기준 · 자동 갱신');
      }
      function updateSnapshotSaveAccess() {
        var button=document.getElementById('snapshotSaveBtn'), session=getScheduleSessionKey();
        if (!button) return;
        button.hidden=true;
        var historyButton=document.getElementById("snapshotHistoryBtn");
        if(historyButton) historyButton.hidden=true;
        if (!authState.loggedIn || authState.isLookup) return;
        Promise.all([getLiveFirebaseAuth(),getLiveFirebaseFirestore()]).then(function(values){
          var user=values[0].currentUser;
          if (!user) return;
          return values[1].collection('users').doc(user.uid).get({source:'server'}).then(function(doc){
            if (session!==getScheduleSessionKey() || values[0].currentUser!==user) return;
            var data=doc.exists?doc.data():{};
            button.hidden=!(data.role==='ADMIN' && data.status==='ACTIVE');
            if(historyButton) historyButton.hidden=button.hidden;
          });
        }).catch(function(){});
      }
      function saveScheduleSnapshot() {
        if (snapshotSaveBusy || !currentSheetName) return;
        var button=document.getElementById('snapshotSaveBtn'), sheet=currentSheetName, session=getScheduleSessionKey();
        snapshotSaveBusy=true;button.disabled=true;button.setAttribute('aria-busy','true');
        var successful=typeof lastSuccessfulSchedule!=='undefined' && lastSuccessfulSchedule;
        var receipt=!snapshotView && successful && successful.sheet===sheet && successful.session===session && successful.data && successful.data.snapshotReceipt;
        if(receipt && (!Number.isFinite(receipt.capturedAt) || Date.now()-receipt.capturedAt>7200000 || receipt.capturedAt>Date.now()+60000)) receipt=null;
        setSnapshotNotice(null,receipt?'조회한 시간표를 저장하고 있습니다.':'원본을 다시 읽어 저장하고 있습니다.');
        return snapshotRequest('save',sheet,'',receipt).then(function(result){
          if (session!==getScheduleSessionKey() || sheet!==currentSheetName) return;
          if (!result.saved || !result.saved.some(function(item){return item.sheet===sheet;})) throw new Error('SAVE_FAILED');
          if (snapshotView) setSnapshotNotice(snapshotView.savedAt);
          else setSnapshotNotice(null,result.outcome==='already-newer'?'같거나 더 최신인 저장본이 이미 있습니다. 저장 이력을 확인해 주세요.':(receipt?'조회한 시간표 저장 완료 · ':'스냅샷 저장 완료 · ')+'조회 지연 시 이 저장본을 사용할 수 있습니다.');
        }).catch(function(error){
          if (session!==getScheduleSessionKey() || sheet!==currentSheetName) return;
          var messages={SAVE_IN_PROGRESS:'다른 저장 작업이 진행 중입니다. 잠시 후 저장 이력을 확인해 주세요.',SOURCE_RATE_LIMIT:'원본 요청이 제한되어 저장하지 못했습니다. 반복 저장을 멈추고 잠시 후 다시 시도해 주세요.',RECEIPT_EXPIRED:'조회한 지 2시간이 지났습니다. 시간표를 새로고침한 뒤 저장해 주세요.',INVALID_RECEIPT:'조회 데이터 검증에 실패했습니다. 시간표를 새로고침한 뒤 저장해 주세요.',UNAUTHORIZED:'로그인이 만료되었습니다. 다시 로그인해 주세요.',FORBIDDEN:'스냅샷을 저장할 관리자 권한이 없습니다.',AbortError:'저장 결과를 확인하지 못했습니다. 다시 저장하기 전에 저장 이력을 확인해 주세요.'};
          setSnapshotNotice(null,(messages[error.name]||messages[error.message]||'저장하지 못했습니다. 잠시 후 저장 이력을 확인하고 다시 시도해 주세요.')+' 기존 저장본은 유지됩니다.');
        }).finally(function(){snapshotSaveBusy=false;button.disabled=false;button.removeAttribute('aria-busy');});
      }
      var snapshotHistorySequence=0, snapshotHistoryFocus=null;
      function snapshotHistoryTime(value) {
        return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
      }
      function closeSnapshotHistory() {
        snapshotHistorySequence++;
        var dialog=document.getElementById('snapshotHistoryDialog');
        if(!dialog || !dialog.open) return;
        dialog.close();
        var body=document.getElementById('snapshotHistoryBody');if(body) body.replaceChildren();
        if(snapshotHistoryFocus && snapshotHistoryFocus.isConnected) snapshotHistoryFocus.focus();
      }
      function openSnapshotHistory() {
        if(!authState.loggedIn || !currentSheetName) return;
        var dialog=document.getElementById('snapshotHistoryDialog'),body=document.getElementById('snapshotHistoryBody'),status=document.getElementById('snapshotHistoryStatus');
        var request=++snapshotHistorySequence,sheet=currentSheetName,session=getScheduleSessionKey();
        if(!dialog.open){snapshotHistoryFocus=document.activeElement;dialog.showModal();}
        document.getElementById('snapshotHistoryTitle').textContent=sheet+' 스냅샷 저장 이력';
        dialog.oncancel=function(event){event.preventDefault();closeSnapshotHistory();};
        body.replaceChildren();status.textContent='저장 이력을 불러오는 중입니다.';
        var retry=document.getElementById('snapshotHistoryRefresh');retry.disabled=true;
        function current(){return request===snapshotHistorySequence && dialog.open && session===getScheduleSessionKey() && sheet===currentSheetName;}
        return snapshotRequest('history',sheet).then(function(result){
          if(!current()) return;
          var items=result.items||[];
          status.textContent=items.length?'최근 '+items.length+'건 · 한국시간':(result.legacySavedAt?'기존 저장본: '+snapshotHistoryTime(result.legacySavedAt)+' · 이력 기능 도입 전 기록은 변경 건과 입력자를 확인할 수 없습니다.':'아직 저장 이력이 없습니다.');
          items.forEach(function(item){
            var row=document.createElement('tr');
            var values=[snapshotHistoryTime(item.savedAt),item.date,item.changes===null?'최초 저장':(item.changes===0?'변경 없음':item.changes+'건'),item.actor];
            values.forEach(function(value,index){var cell=document.createElement('td');cell.setAttribute('data-label',['저장 시각','시간표 날짜','변경 건','입력자'][index]);cell.textContent=value;row.appendChild(cell);});
            var detail=document.createElement('small');detail.textContent='조회 기준 '+snapshotHistoryTime(item.capturedAt);row.firstChild.appendChild(detail);
            body.appendChild(row);
          });
        }).catch(function(error){
          if(!current()) return;
          body.replaceChildren();status.textContent=/AUTH|FORBIDDEN/.test(error.message)?'관리자 로그인을 확인해 주세요.':'저장 이력을 불러오지 못했습니다. 다시 조회해 주세요.';
        }).finally(function(){if(request===snapshotHistorySequence)retry.disabled=false;});
      }
      function withScheduleSnapshot(live, sheet, teacher, accept, roomView) {
        var finished=false, pending=null;
        function fallback(){
          if (pending) return pending;
          pending=snapshotRequest(roomView?'rooms':'read',sheet,teacher).then(function(result){
            if (finished) return false;
            if (!result.data || !Number.isFinite(result.savedAt) || Date.now()-result.savedAt>86400000 || result.savedAt>Date.now()+60000 || result.sheet!==sheet) return false;
            return accept(result)!==false;
          }).catch(function(){return false;});
          return pending;
        }
        // Start with the saved copy immediately while the live request is already in flight.
        var timer=setTimeout(fallback,0);
        return live.then(function(value){finished=true;return value;},function(error){
          if (/AUTH|FORBIDDEN|BLOCKED|권한|로그인/i.test(String(error && error.message))) {finished=true;throw error;}
          return fallback().then(function(used){finished=true;if(used)return {__snapshotHandled:true};throw error;});
        }).finally(function(){clearTimeout(timer);finished=true;});
      }
