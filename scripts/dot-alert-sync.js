/* Event subscriptions: no SSE, data polling, global Firestore settings or persistence changes. */
(function(root){
 function createDotAlertSync({uid,db,authorize,onState,onFailure,document:doc=root.document,navigator:nav=root.navigator,BroadcastChannel:Channel=root.BroadcastChannel,setTimeout:later=root.setTimeout.bind(root),clearTimeout:cancel=root.clearTimeout.bind(root)}){
  let dead=false,epoch=0,controller,authController,release,stops=[],guard,leader=false,channel,checking=false,pendingCheck=false;
  let snapshot={items:[],states:{},syncedAt:0,connection:'연결 중'},alertsReady=false,statesReady=false;
  const name='dot-timetable-alerts:'+uid;
  if(Channel){try{channel=new Channel(name);}catch{} }
  if(channel){channel.onmessage=e=>{const m=e.data;if(dead||doc.hidden||m?.uid!==uid)return;if(m.type==='request'&&leader&&alertsReady&&statesReady)channel.postMessage({uid,type:'snapshot',snapshot});if(m.type==='snapshot'&&!leader&&m.snapshot)onState(m.snapshot);if(m.type==='denied'&&!leader)fail(Error('권한 확인 필요'));};}
  function leave(){epoch++;controller?.abort();controller=null;authController?.abort();authController=null;release?.();release=null;stops.splice(0).forEach(stop=>stop());cancel(guard);guard=null;leader=false;}
  function fail(error){leave();onFailure(error);}
  function emit(){if(!alertsReady||!statesReady)return;onState(snapshot);channel?.postMessage({uid,type:'snapshot',snapshot});}
  async function authorized(){const request=new AbortController();authController=request;try{return await authorize(request.signal);}finally{if(authController===request)authController=null;}}
  async function check(g){if(dead||g!==epoch||doc.hidden)return;if(checking){pendingCheck=true;return;}checking=true;try{const result=await authorized();if(result.uid!==uid)throw Error('SESSION_CHANGED');if(dead||g!==epoch)return;guard=later(()=>check(g),30000);}catch(error){if(g!==epoch||dead)return;channel?.postMessage({uid,type:'denied'});fail(error);}finally{checking=false;if(pendingCheck){pendingCheck=false;if(!dead&&g===epoch&&!doc.hidden){cancel(guard);guard=later(()=>check(g),0);}}}}
  function listen(g){if(dead||g!==epoch||doc.hidden)return;leader=true;alertsReady=false;statesReady=false;
   const error=e=>{if(g!==epoch||dead)return;channel?.postMessage({uid,type:'denied'});fail(e);};
   const accept=(kind,s)=>{if(dead||g!==epoch||doc.hidden)return;if(kind==='alerts'){snapshot={...snapshot,items:s.docs.map(d=>({id:d.id,...d.data()}))};alertsReady=true;}else{snapshot={...snapshot,states:Object.fromEntries(s.docs.map(d=>[d.id,d.data()]))};statesReady=true;}snapshot.connection=s.metadata?.fromCache?'저장된 알림 · 연결 확인 중':'연결됨';if(!s.metadata?.fromCache)snapshot.syncedAt=Date.now();emit();};
   stops.push(db.collection('liveTimetableDotAlerts_sedubanpo').orderBy('receivedAt','desc').limit(200).onSnapshot({includeMetadataChanges:true},s=>accept('alerts',s),error));
   stops.push(db.collection('liveTimetableDotUserState').doc(uid).collection('items').limit(200).onSnapshot({includeMetadataChanges:true},s=>accept('states',s),error));
   // Existing self-document permissions: account changes trigger an immediate
   // server check; Firebase token revocation is still checked every 30 seconds.
   for(const collection of ['users','userProfiles','userAppAccess']){let initial=true,previous;stops.push(db.collection(collection).doc(uid).onSnapshot(s=>{if(dead||g!==epoch||doc.hidden)return;const current=JSON.stringify(s.exists?s.data():null);if(initial){initial=false;previous=current;return;}if(current!==previous){previous=current;cancel(guard);guard=later(()=>check(g),0);}},error));}
   guard=later(()=>check(g),30000);
  }
  async function join(){leave();if(dead||doc.hidden)return;const g=epoch;try{const result=await authorized();if(dead||g!==epoch||doc.hidden)return;if(result.uid!==uid)throw Error('SESSION_CHANGED');if(nav?.locks&&channel){controller=new AbortController();nav.locks.request(name,{signal:controller.signal},async()=>{if(dead||g!==epoch||doc.hidden)return;listen(g);await new Promise(resolve=>release=resolve);}).catch(error=>{if(g!==epoch||dead||error.name==='AbortError')return;if(['SecurityError','NotSupportedError'].includes(error.name))listen(g);else fail(error);});channel.postMessage({uid,type:'request'});}else listen(g);}catch(error){if(g===epoch&&!dead)fail(error);}}
  const visibility=()=>{if(doc.hidden){leave();onState({...snapshot,connection:'숨김 탭 · 구독 일시정지'});}else join();};
  return {start(){doc.addEventListener('visibilitychange',visibility);join();},stop(){if(dead)return;dead=true;leave();doc.removeEventListener('visibilitychange',visibility);channel?.close();channel=null;}};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={createDotAlertSync};else root.createDotAlertSync=createDotAlertSync;
})(typeof window==='undefined'?globalThis:window);
