      // Each source owns its successful cache and request. Consumers never own shared cancellation.
      function createReviewReadManager(options) {
        options=options||{};
        var generation=0, cache=new Map(), pending=new Map(), now=options.now||Date.now;
        function error(code){return Object.assign(new Error(code),{code:code});}
        function cancelPending(){generation++;pending.forEach(function(entry){entry.cancel();});pending.clear();}
        function invalidate(){cache.clear();cancelPending();}
        function read(key,loader,settings){
          settings=settings||{};
          var active=pending.get(key), stamp=generation;
          if(active&&(!settings.force||active.forced))return active.promise;
          if(active){active.cancel();pending.delete(key);cache.delete(key);}
          var saved=cache.get(key);
          if(!settings.force&&saved&&now()>=saved.at&&now()-saved.at<300000)return Promise.resolve(saved.value);
          var controller=new AbortController(), entry={generation:stamp,forced:!!settings.force}, timer, rejectCancel;
          function current(){return generation===stamp&&pending.get(key)===entry&&!controller.signal.aborted;}
          var cancelled=new Promise(function(_,reject){rejectCancel=reject;});
          entry.cancel=function(){controller.abort();rejectCancel(error('INVALIDATED'));};
          pending.set(key,entry);
          timer=setTimeout(function(){controller.abort();rejectCancel(error('TIMEOUT'));},Math.min(settings.deadline||8500,8500));
          var work=Promise.resolve().then(function(){if(!current())throw error('INVALIDATED');return loader(controller.signal,current);});
          entry.promise=Promise.race([work,cancelled]).then(function(value){
            if(!current())throw error('INVALIDATED');
            if(settings.cache!==false)cache.set(key,{value:value,at:now()});
            return value;
          }).finally(function(){clearTimeout(timer);if(pending.get(key)===entry)pending.delete(key);});
          return entry.promise;
        }
        return {read:read,invalidate:invalidate,cancelPending:cancelPending,generation:function(){return generation;}};
      }
      var reviewReadManager=createReviewReadManager(), reviewReadEpoch=0, reviewReadUser=null, reviewIdentitySignature=null, reviewViewFlight=null;
      window.addEventListener('pagehide',function(){invalidateReviewReads('LEAVE');});

      function invalidateReviewReads(reason) {
        if(reason==='LEAVE')reviewReadManager.cancelPending();else{reviewReadEpoch++;reviewReadManager.invalidate();}
        if(reason==='AUTH'||reason==='401'||reason==='403')reviewIdentitySignature=null;
        window.seduReviewContextCache={};
        if(typeof reviewModalSequence==='number')reviewModalSequence++;
        var modal=document.getElementById('reviewModal');
        if(modal&&modal.style.display!=='none'){
          var host=document.getElementById('reviewResultList');
          if(host){
            var message=reason==='401'?'인증 만료(401) · 다시 로그인해 주세요.':reason==='403'?'접근 거부(403) · 현재 계정 권한을 확인해 주세요.':reason==='AUTH'?'인증·권한 상태가 변경되어 점검 결과를 폐기했습니다. 다시 로그인하거나 권한을 확인해 주세요.':'자료가 변경되어 이전 점검 결과를 폐기했습니다. 점검을 다시 실행해 주세요.';
            if(reason==='DATA')host.querySelectorAll('[data-review-panel]').forEach(function(panel){if(panel.getAttribute('data-review-panel')!=='exam')panel.textContent=message;});
            else host.textContent=message;
          }
        }
      }
      async function authorizeReviewRead() {
        var epoch=reviewReadEpoch, session=getScheduleSessionKey();
        if(!authState.loggedIn||authState.isLookup)throw new Error('UNAUTHORIZED');
        return reviewReadManager.read('authority:'+session,async function(signal,current){
          var auth=await getLiveFirebaseAuth(),user=auth.currentUser;
          if(!user)throw new Error('UNAUTHORIZED');
          if(reviewReadUser&&reviewReadUser!==user)throw new Error('SESSION_CHANGED');
          reviewReadUser=user;
          var token=await user.getIdToken();
          if(!current()||epoch!==reviewReadEpoch||session!==getScheduleSessionKey()||auth.currentUser!==user)throw new Error('SESSION_CHANGED');
          // Existing read-only identity contract; never use attendance/memo mutations as an auth probe.
          var response=await fetch('https://asia-northeast3-fir-lms-prod.cloudfunctions.net/timetableHandoffApi',{method:'POST',signal:signal,cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'identity'})});
          if(response.status===401||response.status===403)throw new Error(String(response.status));
          var body=await response.json();
          if(!response.ok||!body.ok||!body.identity||body.identity.uid!==user.uid)throw new Error('AUTH_UNAVAILABLE');
          if(!current()||auth.currentUser!==user||epoch!==reviewReadEpoch||session!==getScheduleSessionKey())throw new Error('SESSION_CHANGED');
          var signature=JSON.stringify([user.uid,body.identity.admin,body.identity.name||'']);
          if(reviewIdentitySignature&&reviewIdentitySignature!==signature)throw new Error('FORBIDDEN');
          reviewIdentitySignature=signature;
          if(!current()||auth.currentUser!==user||epoch!==reviewReadEpoch||session!==getScheduleSessionKey())throw new Error('SESSION_CHANGED');
          return {token:token,key:JSON.stringify([user.uid,session,epoch,body.identity.admin]),epoch:epoch};
        },{cache:false}).catch(function(error){
          if(epoch===reviewReadEpoch&&error.message!=='INVALIDATED'){reviewReadUser=null;invalidateReviewReads(/401|UNAUTHORIZED/.test(error.message)?'401':/403|FORBIDDEN/.test(error.message)?'403':'AUTH');}
          throw error;
        });
      }
      function reviewReadState(error){
        var code=String(error&&error.message||error);
        return /401|UNAUTHORIZED/.test(code)?'unauthorized':/403|FORBIDDEN|permission-denied/.test(code)?'forbidden':/LIMIT_EXCEEDED/.test(code)?'limit':/TIMEOUT/.test(code)?'timeout':/INVALIDATED|SESSION_CHANGED|AbortError/.test(code)?'cancelled':'unavailable';
      }


