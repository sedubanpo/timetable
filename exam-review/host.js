(function(root){
 'use strict';
 let host=null,cache=new Map(),cacheSession='',sequence=0;
 const errorCopy='점검 자료를 불러오지 못했습니다. 로그인 상태와 연결을 확인한 뒤 자료 다시 조회를 눌러 주세요.';
 async function request(url,body,session,callable=true){
  const auth=await getLiveFirebaseAuth();if(!auth.currentUser||session!==getScheduleSessionKey())throw Error('SESSION_CHANGED');
  const token=await auth.currentUser.getIdToken(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try{const response=await fetch('https://asia-northeast3-fir-lms-prod.cloudfunctions.net/'+url,{method:'POST',signal:controller.signal,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(callable?{data:body}:body)});const result=await response.json();if(session!==getScheduleSessionKey())throw Error('SESSION_CHANGED');if(!response.ok||result.error||(!callable&&!result.ok))throw Error('SOURCE_UNAVAILABLE');return callable?result.result||result.data:result;}finally{clearTimeout(timer);}
 }
 function timeout(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('TIMEOUT')),35000))]).finally(()=>clearTimeout(timer));}
 async function load(h,date,days,force){
  const key=h.session+'|'+date+'|'+days,cached=cache.get(key);if(!force&&cached&&Date.now()-cached.time<120000)return cached.data;
  const end=ExamReadiness.plus(date,days),sources={board:{state:'loading'},history:{state:'loading'},handoffs:{state:'loading'},operating:{state:'loading'}};
  const boardPromise=request('timetableExamReviewApi',{date,end},h.session).then(x=>{sources.board.state='ready';return x;});
  const historyPromise=request('lessonLogApi',{action:'examPreparationLessons',date},h.session).then(x=>{if(x.complete!==true)throw Error('SOURCE_INCOMPLETE');sources.history.state='ready';return x;}).catch(()=>{sources.history.state='unavailable';return null;});
  const handoffPromise=request('timetableHandoffApi',{action:'review',date,endDate:end},h.session,false).then(x=>{if(x.complete!==true)throw Error('SOURCE_INCOMPLETE');sources.handoffs.state='ready';return x;}).catch(()=>{sources.handoffs.state='unavailable';return null;});
  const board=await boardPromise;if(!h.active())throw Error('SESSION_CHANGED');
  const operating=[],failed=[];const last=board.exams.length?ExamReadiness.plus(board.exams.map(e=>e.date).sort().at(-1),-1):date,dates=[];
  for(let d=date;d<=last;d=ExamReadiness.plus(d,1))dates.push(d);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,dates.length)},async()=>{while(cursor<dates.length){const day=dates[cursor++];if(!h.active())throw Error('SESSION_CHANGED');
   const parsed=new Date(day+'T12:00:00'),names=getNavigableSheetNames().filter(name=>/^\d{1,2}\/\d{1,2}/.test(name)&&formatReviewDate(parseTeacherLogTargetDate(name,parsed))===day),sheet=getPreferredSheetNameForDate(names);
   if(!sheet){failed.push(day);continue;}
   try{const grid=await timeout(getTeacherRoomSheetData(sheet,true));if(!h.active())throw Error('SESSION_CHANGED');operating.push({date:day,snapshot:h.snapshot(grid)});}catch(error){if(!h.active())throw error;failed.push(day);}
  }}));
  sources.operating={state:failed.length?'unavailable':'ready',missingDates:failed.sort()};
  const [history,handoffs]=await Promise.all([historyPromise,handoffPromise]);if(!h.active())throw Error('SESSION_CHANGED');
  const data=ExamReviewData.normalize(board,history,handoffs,operating,sources);if(data.complete){cache.set(key,{time:Date.now(),data});if(cache.size>4)cache.delete(cache.keys().next().value);}return data;
 }
 function formatReviewDate(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
 root.connectTimetableExamReview=function(frame,date,snapshot,guard){
  if(!frame||host?.frame===frame)return;const session=getScheduleSessionKey();if(cacheSession!==session){cache.clear();cacheSession=session;}
  host={frame,date,snapshot,session,active:()=>frame.isConnected&&guard()&&session===getScheduleSessionKey()&&authState.loggedIn&&!authState.isLookup&&authState.isMaster};
  host.visible=()=>!frame.closest?.('[data-review-panel]')||frame.closest('[data-review-panel]').classList.contains('active');
  frame.addEventListener('load',()=>{if(host?.frame===frame&&host.active()&&host.visible())frame.contentWindow.postMessage({channel:'timetable-exam-review',type:'init',date:host.date},location.origin);});
 };
 root.startTimetableExamReview=function(){if(host&&host.active()&&host.visible())host.frame.contentWindow.postMessage({channel:'timetable-exam-review',type:'init',date:host.date},location.origin);};
 window.addEventListener('message',async event=>{
  const h=host,m=event.data;if(!h||event.origin!==location.origin||event.source!==h.frame.contentWindow||!m||m.channel!=='timetable-exam-review')return;
  if(!h.active()){h.frame.contentWindow.postMessage({channel:'timetable-exam-review',id:m.id,error:'실무자 로그인과 시간표 점검 권한을 확인해 주세요.'},location.origin);return;}
  if(m.type==='ready'){if(h.visible())root.startTimetableExamReview();return;}
  if(m.type!=='load'||!Number.isSafeInteger(m.id)||!/^20\d{2}-\d{2}-\d{2}$/.test(m.date)||![7,14].includes(m.days))return;
  h.date=m.date;const own=++sequence;try{const result=await load(h,m.date,m.days,m.force===true);if(own===sequence&&host===h&&h.active())h.frame.contentWindow.postMessage({channel:'timetable-exam-review',id:m.id,result},location.origin);}catch(error){if(own===sequence&&host===h&&h.active())h.frame.contentWindow.postMessage({channel:'timetable-exam-review',id:m.id,error:errorCopy},location.origin);}
 });
})(window);
