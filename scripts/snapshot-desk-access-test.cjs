const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 for(const file of ['Index.html','docs/index.html']){
  const source=fs.readFileSync(file,'utf8');
  const fn=source.slice(source.indexOf('      function updateSnapshotSaveAccess()'),source.indexOf('      function saveScheduleSnapshot()'));
  for(const role of ['ADMIN','STAFF','DESK','TEACHER','INSTRUCTOR'])for(const status of ['ACTIVE','DISABLED']){
   const elements={snapshotSaveBtn:{},snapshotHistoryBtn:{}},user={uid:'u'};
   const context={document:{getElementById:id=>elements[id]},authState:{loggedIn:true,isLookup:false},getScheduleSessionKey:()=>1,getLiveFirebaseAuth:async()=>({currentUser:user}),getLiveFirebaseFirestore:async()=>({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({role,status})})})})})};
   vm.createContext(context);vm.runInContext(fn,context);context.updateSnapshotSaveAccess();
   for(let i=0;i<20;i++)await Promise.resolve();
   const hidden=!(status==='ACTIVE'&&['ADMIN','STAFF','DESK'].includes(role));
   assert.equal(elements.snapshotSaveBtn.hidden,hidden,`${file} ${role} ${status}`);
   assert.equal(elements.snapshotHistoryBtn.hidden,hidden);
   context.authState.isLookup=true;context.updateSnapshotSaveAccess();assert.equal(elements.snapshotSaveBtn.hidden,true);
  }
 }
 console.log('PASS both pages: active admin/staff/desk controls; teachers, disabled and lookup accounts excluded');
})().catch(e=>{console.error(e);process.exitCode=1;});
