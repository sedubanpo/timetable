      // Independent Firebase endpoint: reading a saved copy never calls Apps Script.
      var snapshotView = null, snapshotSaveBusy = false;
      var SNAPSHOT_API_URL = 'https://asia-northeast3-fir-lms-prod.cloudfunctions.net/timetableSnapshotApi';
      function snapshotRequest(action, sheet, teacher) {
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
            body:JSON.stringify({action:action,sheet:sheet,teacher:teacher||'',lookupToken:identity.lookupToken||''})});
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
        if (!authState.loggedIn || authState.isLookup) return;
        Promise.all([getLiveFirebaseAuth(),getLiveFirebaseFirestore()]).then(function(values){
          var user=values[0].currentUser;
          if (!user) return;
          return values[1].collection('users').doc(user.uid).get({source:'server'}).then(function(doc){
            if (session!==getScheduleSessionKey() || values[0].currentUser!==user) return;
            var data=doc.exists?doc.data():{};
            button.hidden=!(data.role==='ADMIN' && data.status==='ACTIVE');
          });
        }).catch(function(){});
      }
      function saveScheduleSnapshot() {
        if (snapshotSaveBusy || !currentSheetName) return;
        var button=document.getElementById('snapshotSaveBtn'), sheet=currentSheetName, session=getScheduleSessionKey();
        snapshotSaveBusy=true;button.disabled=true;button.setAttribute('aria-busy','true');
        setSnapshotNotice(null,'원본을 다시 읽어 저장하고 있습니다.');
        return snapshotRequest('save',sheet).then(function(result){
          if (session!==getScheduleSessionKey() || sheet!==currentSheetName) return;
          if (!result.saved || !result.saved.some(function(item){return item.sheet===sheet;})) throw new Error('SAVE_FAILED');
          if (snapshotView) setSnapshotNotice(snapshotView.savedAt);
          else setSnapshotNotice(null,'스냅샷 저장 완료 · 다음 조회 지연 시 이 저장본을 사용할 수 있습니다.');
        }).catch(function(error){
          if (session!==getScheduleSessionKey() || sheet!==currentSheetName) return;
          setSnapshotNotice(null,(snapshotView?'저장본 표시 중 · ':'')+(error.message==='SAVE_IN_PROGRESS'?'다른 저장 작업이 진행 중입니다. 잠시 후 다시 시도해 주세요.':'저장하지 못했습니다. 기존 저장본은 유지됩니다. 잠시 후 다시 시도해 주세요.'));
        }).finally(function(){snapshotSaveBusy=false;button.disabled=false;button.removeAttribute('aria-busy');});
      }
      function withScheduleSnapshot(live, sheet, teacher, accept, roomView) {
        var finished=false, pending=null;
        function fallback(){
          if (pending) return pending;
          pending=snapshotRequest(roomView?'rooms':'read',sheet,teacher).then(function(result){
            if (finished) return false;
            if (!result.data || !Number.isFinite(result.savedAt) || Date.now()-result.savedAt>86400000 || result.savedAt>Date.now()+60000 || result.sheet!==sheet) return false;
            accept(result);return true;
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
