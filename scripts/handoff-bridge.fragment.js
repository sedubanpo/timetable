      // Only this isolated frame can invoke the Firebase-only handoff endpoint.
      var handoffDialog=null,handoffFrame=null,handoffSession='',handoffWatch=null,handoffReturnFocus=null;
      var HANDOFF_ORIGIN='https://sedubanpo.github.io';
      function openTimetableHandoff(){
        if(!authState.loggedIn||authState.isLookup){alert('로그인한 선생님과 관리자만 시간표를 전달할 수 있습니다.');return;}
        if(handoffDialog&&handoffDialog.open)return;
        handoffSession=getScheduleSessionKey();handoffReturnFocus=document.activeElement;
        handoffDialog=document.createElement('dialog');handoffDialog.setAttribute('aria-label','시간표 전달');
        handoffDialog.style.cssText='padding:0;border:0;border-radius:10px;width:min(1400px,98vw);max-width:98vw;height:94dvh;max-height:94dvh;background:#fff;';
        handoffFrame=document.createElement('iframe');handoffFrame.title='시간표 전달';handoffFrame.style.cssText='width:100%;height:100%;border:0;display:block';
        handoffFrame.src=HANDOFF_ORIGIN+'/timetable/handoff.html?v=20261001-1';
        handoffDialog.appendChild(handoffFrame);document.body.appendChild(handoffDialog);
        handoffDialog.addEventListener('cancel',function(e){e.preventDefault();if(handoffFrame)handoffFrame.contentWindow.postMessage({channel:'timetable-handoff',type:'close'},HANDOFF_ORIGIN);});
        handoffDialog.showModal();
        handoffWatch=setInterval(function(){if(handoffSession!==getScheduleSessionKey()||!authState.loggedIn)disposeTimetableHandoff();},300);
      }
      function disposeTimetableHandoff(){clearInterval(handoffWatch);handoffWatch=null;if(handoffDialog){handoffDialog.close();handoffDialog.remove();}handoffFrame=null;handoffDialog=null;if(handoffReturnFocus&&handoffReturnFocus.isConnected)handoffReturnFocus.focus();}
      window.addEventListener('message',async function(event){
        if(!handoffFrame||event.source!==handoffFrame.contentWindow||event.origin!==HANDOFF_ORIGIN)return;
        var m=event.data;if(!m||m.channel!=='timetable-handoff')return;
        if(handoffSession!==getScheduleSessionKey()||!authState.loggedIn||authState.isLookup){disposeTimetableHandoff();return;}
        if(m.type==='ready'){handoffFrame.contentWindow.postMessage({channel:'timetable-handoff',type:'init'},HANDOFF_ORIGIN);return;}
        if(m.type==='closed'){disposeTimetableHandoff();return;}
        if(typeof m.id!=='string'||m.id.length>30||!m.body||typeof m.body!=='object')return;
        var frame=handoffFrame,session=handoffSession,controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},20000);
        try{var auth=await getLiveFirebaseAuth();if(!auth.currentUser)throw Error('UNAUTHORIZED');var token=await auth.currentUser.getIdToken();if(session!==getScheduleSessionKey())throw Error('SESSION_CHANGED');
          var response=await fetch('https://asia-northeast3-fir-lms-prod.cloudfunctions.net/timetableHandoffApi',{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(m.body)});
          var result=await response.json();if(!result.ok)throw Error(result.error||'UNAVAILABLE');if(session!==getScheduleSessionKey())throw Error('SESSION_CHANGED');
          if(frame===handoffFrame)frame.contentWindow.postMessage({channel:'timetable-handoff',id:m.id,result:result},HANDOFF_ORIGIN);
        }catch(error){if(frame===handoffFrame)frame.contentWindow.postMessage({channel:'timetable-handoff',id:m.id,error:['FORBIDDEN','UNAUTHORIZED','CONFLICT','INVALID_DATA','UNFINISHED_INPUT','SESSION_CHANGED'].includes(error.message)?error.message:'UNAVAILABLE'},HANDOFF_ORIGIN);}
        finally{clearTimeout(timeout);}
      });
