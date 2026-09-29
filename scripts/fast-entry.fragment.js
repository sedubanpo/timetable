      // Startup metadata contains date names only, never student rows or reusable credentials.
      var timetableStartup = null, timetableStartupSequence = 0, timetableLoginSequence = 0;
      function authenticateTimetableFast(loginId, password, idToken) {
        if (!idToken) return callServer('authenticateTeacher',[loginId,password,idToken]);
        var controller=new AbortController(), timer=setTimeout(function(){controller.abort();},6000);
        return fetch(SNAPSHOT_API_URL,{method:'POST',signal:controller.signal,cache:'no-store',
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+idToken},body:JSON.stringify({action:'bootstrap'})
        }).then(function(response){
          if(response.status===401 || response.status===403) {
            var denied=new Error('계정 상태 또는 시간표 접근 권한을 확인해 주세요.');denied.code='ACCESS_DENIED';throw denied;
          }
          if(!response.ok)throw new Error('BOOTSTRAP_UNAVAILABLE');
          return response.json();
        }).then(function(result){
          if(!result.ok || !result.identity || !result.identity.firebaseUid)throw new Error('BOOTSTRAP_UNAVAILABLE');
          return Object.assign({},result.identity,{startupSheets:result.sheets||[],startupSavedSheets:result.savedSheets||[],startupCatalogSavedAt:result.catalogSavedAt||0});
        }).catch(function(error){
          if(error.code==='ACCESS_DENIED')throw error;
          // Compatibility path for unavailable/not-yet-deployed fast API; never on a denial.
          return callServer('authenticateTeacher',[loginId,password,idToken]);
        }).finally(function(){clearTimeout(timer);});
      }
      function rememberTimetableBootstrap(res) {
        closeSnapshotHistory();
        clientCache={};lastSuccessfulSchedule=null;snapshotView=null;scheduleLoadSequence++;
        timetableStartup={loginId:res.loginId,sheets:Array.isArray(res.startupSheets)?res.startupSheets.slice():[],catalogSavedAt:Number(res.startupCatalogSavedAt)||0};
      }
      function setCalendarLoadStatus(text, retry) {
        var status=document.getElementById('calendarLoadStatus'),button=document.getElementById('calendarRetryBtn');
        if(status)status.textContent=text||'';
        if(button)button.hidden=!retry;
      }
      function applyStartupSheetNames(names) {
        if(!Array.isArray(names) || !names.length || names.some(function(n){return typeof n!=='string' || n.indexOf('ERROR')===0;}))return false;
        availableSheets=names.slice();sheetNamesLoaded=true;sheetMap=buildSheetMapFromNames(availableSheets);
        saveSheetNamesCache(names);populateMainSheetSelector(currentSheetName);renderCalendar();calendarSync();
        return true;
      }
      function startAppAfterAuth(forceCatalog) {
        var sequence=++timetableStartupSequence, session=getScheduleSessionKey(), liveApplied=false;
        document.getElementById('introPage').style.display='flex';
        document.getElementById('mainPage').style.display='none';
        document.getElementById('introLoading').style.display='none';
        var startup=timetableStartup && timetableStartup.loginId===authState.loginId ? timetableStartup.sheets : [];
        var initial=startup.length?startup:(sheetNamesLoaded?availableSheets:loadSheetNamesCache());
        initApp(initial);
        // A verified recent catalog is already enough to draw the calendar. Avoid
        // another Apps Script request on every login/Home; manual refresh is explicit.
        var savedAt=startup.length && timetableStartup.catalogSavedAt;
        if(!forceCatalog && savedAt && savedAt<=Date.now()+60000 && Date.now()-savedAt<7200000){
          setCalendarLoadStatus('저장된 날짜 목록입니다. 새 날짜가 없으면 목록을 새로고침하세요.',true);
          return Promise.resolve();
        }
        setCalendarLoadStatus(initial.length?'날짜를 선택하세요. 최신 날짜 목록은 확인 중입니다.':'저장된 날짜 목록을 확인하고 있습니다.');
        function current(){return authState.loggedIn && sequence===timetableStartupSequence && session===getScheduleSessionKey();}
        // Both sources update only the calendar, never navigate away from an already-open day.
        var quick=initial.length?Promise.resolve():snapshotRequest('bootstrap','').then(function(result){
          if(current() && !liveApplied && applyStartupSheetNames(result.sheets))setCalendarLoadStatus('저장된 날짜 목록 · 최신 목록 확인 중');
        }).catch(function(){});
        callServer('getSheetNames',[]).then(function(names){
          if(!current())return;
          if(!applyStartupSheetNames(names))throw new Error('EMPTY_SHEETS');
          timetableStartup={loginId:authState.loginId,sheets:names.slice(),catalogSavedAt:Date.now()};
          liveApplied=true;setCalendarLoadStatus('날짜를 선택하세요.');
          // Do not scan every sheet on entry. Availability is checked when a date is opened.
        }).catch(function(){
          quick.finally(function(){if(current())setCalendarLoadStatus(availableSheets.length?'저장된 날짜 목록입니다. 최신 목록을 다시 확인할 수 있습니다.':'날짜 목록을 불러오지 못했습니다. 다시 시도해 주세요.',true);});
        });
        return Promise.resolve();
      }
