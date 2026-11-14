'use strict';
// Dependency-injected, server-only adapter. No SDK initialization or outbound transport.
const {createHash}=require('node:crypto');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const valid=id=>typeof id==='string'&&id.length>0&&id.length<=128&&!id.includes('/');
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function contacts(doc){
  return [['student','학생',['studentContact','studentPhone','phone']],['father','부',['fatherContact','fatherPhone']],['mother','모',['motherContact','motherPhone']]].map(([id,relation,keys])=>{
    const raw=keys.map(k=>doc[k]).filter(v=>v!==undefined&&v!==null&&v!=='');
    const values=raw.map(v=>typeof v==='string'?v.replace(/[\s()-]/g,''):'INVALID');
    const unique=[...new Set(values)];
    const verified=unique.length===1&&/^010\d{8}$/.test(unique[0]);
    return {id,relation,verified,phone:verified?unique[0]:'',reason:!unique.length?'번호 없음':verified?'':'연락처 충돌 또는 형식 확인 필요'};
  });
}
function createStudentAdapter({readStudent,findMappings,allowInactiveNotices=false}){
  return async function resolve(id,signal){
    if(!valid(id))fail('INVALID_STUDENT_ID');
    const seen=new Set();let current=id,doc;
    for(let depth=0;depth<8;depth++){
      if(signal?.aborted)fail('ABORTED');
      if(seen.has(current))fail('IDENTITY_CYCLE');seen.add(current);
      doc=await readStudent(current,signal);
      const mappings=await findMappings(current,signal);
      if(!Array.isArray(mappings)||mappings.length>20)fail('IDENTITY_MAPPING_LIMIT');
      const refs=new Set();
      for(const m of mappings){
        if(m.status!=='ACTIVE'||!valid(m.canonicalStudentId)||!Array.isArray(m.aliasStudentIds)||!(m.canonicalStudentId===current||m.aliasStudentIds.includes(current)))fail('IDENTITY_MAPPING_INVALID');
        refs.add(m.canonicalStudentId);
      }
      for(const v of [doc?.canonicalStudentId,doc?.mergedInto])if(v){if(!valid(v))fail('IDENTITY_MAPPING_INVALID');refs.add(v);}
      if(refs.size>1)fail('IDENTITY_CONFLICT');
      const next=[...refs][0];
      if(next&&next!==current){current=next;continue;}
      if(!doc)fail('STUDENT_NOT_FOUND');
      if(doc.isDeleted===true||doc.deletedAt||doc.disabled===true)fail('STUDENT_NOT_ACTIVE');
      if(doc.isAlias===true||doc.identityStatus==='ALIAS'||doc.mergedInto)fail('IDENTITY_UNRESOLVED');
      const inactive=!['ACTIVE','RETURNED'].includes(doc.status)||doc.active===false||doc.isActive===false;
      if(inactive&&!(allowInactiveNotices&&['INACTIVE','STOPPED','PAUSED','SUSPENDED','중지','휴원','퇴원','ACTIVE','RETURNED'].includes(doc.status)))fail('STUDENT_NOT_ACTIVE');
      if(doc.campusId&&doc.campusId!=='banpo')fail('STUDENT_NOT_ACTIVE');
      if(typeof doc.name!=='string'||!doc.name.trim())fail('STUDENT_NAME_REQUIRED');
      if(signal?.aborted)fail('ABORTED');
      return {id:current,...(inactive?{registrationInactive:true}:{}),...(doc.timetableSaturdayArrivalChoice===true?{timetableSaturdayArrivalChoice:true}:{}),name:doc.name.trim(),school:doc.school||'',grade:doc.grade||'',recipients:contacts(doc),identityRevision:digest([current,[...seen],doc.canonicalStudentId||'',doc.studentIdAliases||[],doc.status,doc.name,doc.school||'',doc.grade||'',...(doc.active===false||doc.isActive===false?['inactive-flags',doc.active===false,doc.isActive===false]:[])])};
    }
    fail('IDENTITY_DEPTH_LIMIT');
  };
}
// Bounded reads only. No full students or mapping scans; overflow is not a complete result.
function firestoreStudentReader(db){
  return {
    readStudent:async id=>(await db.collection('students').doc(id).get()).data()||null,
    findMappings:async id=>{
      const c=db.collection('studentIdentityMappings');
      const snaps=await Promise.all([c.where('canonicalStudentId','==',id).limit(21).get(),c.where('aliasStudentIds','array-contains',id).limit(21).get()]);
      if(snaps.some(s=>s.size>20))fail('IDENTITY_MAPPING_LIMIT');
      return [...new Map(snaps.flatMap(s=>s.docs.map(d=>[d.id,d.data()]))).values()];
    }
  };
}
// loadMappedDay must verify fresh source completeness and persisted operator mapping.
// It cannot be a browser-submitted grid or the name/school candidate resolver.
function withStudentDirectory({loadMappedDay,resolveStudent,readClearance,readNoticeContacts,now=Date.now,audience='guardian'}){
  return async(actor,date,ids,signal)=>{
    const day=await loadMappedDay(actor,date,ids,signal);
    const students=[];
    for(const id of ids){
      const matches=(day.students||[]).filter(s=>s.id===id);
      if(matches.length!==1){students.push({id,name:'',mappingVerified:false,lessons:[],recipients:[],holdReasons:['학생 원본 매핑 불명확']});continue;}
      const mapped=matches[0];
      let student;
      try{
        if(mapped.mappingVerified!==true||!mapped.mappingRevision)fail('SOURCE_MAPPING_UNVERIFIED');
        student=await resolveStudent(id,signal);
        // A merge requires operator re-confirmation and historical dedupe reconciliation.
        // Do not silently change the key used by previews and delivery records.
        if(student.id!==id)fail('CANONICAL_RECONFIRM_REQUIRED');
        if(mapped.identityRevision && mapped.identityRevision!==student.identityRevision)fail('IDENTITY_CHANGED');
      }catch(e){
        if(signal?.aborted||e.code==='ABORTED')throw e;
        students.push({...mapped,mappingVerified:false,recipients:[],holdReasons:[e.code||'STUDENT_DIRECTORY_UNAVAILABLE']});
        continue;
      }
      try{
        if(typeof readClearance!=='function')fail('CONTACT_CLEARANCE_REQUIRED');
        const clearance=await readClearance(actor,id,date,signal);
        const notice=typeof readNoticeContacts==='function'?await readNoticeContacts(actor,id,date):null;
        const {validRecord,applyNoticeContacts}=require('./alimtalk-notice-contacts');
        const approved=validRecord(notice,actor,date,student,now());
        if(student.noticeDate&&student.noticeDate!==date)fail('TEMPORARY_ATTENDANCE_REQUIRED');
        if(student.registrationInactive&&!approved)fail('TEMPORARY_ATTENDANCE_REQUIRED');
        if(approved){student=applyNoticeContacts(student,notice);mapped.mappingRevision=digest([mapped.mappingRevision,notice.revision]);}
        // From this lesson date, the directory supplies the default recipients.
        // A saved daily selection still takes precedence (including restrictions).
        if((clearance===null||approved) && date>='2026-11-07'){
          const mother=student.recipients.find(r=>r.id==='mother');
          const father=student.recipients.find(r=>r.id==='father');
          const guardian=mother?.verified ? mother : father;
          const recipient=audience==='student' ? student.recipients.find(r=>r.id==='student') : guardian;
          const recipients=recipient?.verified ? [recipient] : [];
          let recipientIssue='';
          if(!recipients.length){
            if(audience==='student' && recipient?.reason==='번호 없음'){
              recipientIssue=guardian?.verified ? '본인 번호 없음 · 학부모만 안내' : '본인 번호 없음';
            }else{
              recipientIssue=audience==='student' ? '본인 번호 확인 필요' : '학부모 번호 확인 필요';
            }
          }
          students.push({...mapped,...student,recipients,recipientIssue,
            mappingRevision:digest([mapped.mappingRevision,student.identityRevision,audience,recipients.map(r=>[r.id,r.phone])])});
          continue;
        }
        if(!clearance||clearance.academyId!==actor.academyId||clearance.studentId!==id||clearance.date!==date||clearance.mappingRevision!==mapped.mappingRevision||clearance.identityRevision!==student.identityRevision||!clearance.revision||!clearance.checkedBy||!Number.isFinite(clearance.checkedAt)||clearance.checkedAt>now()||clearance.campusConfirmed!==true)fail('CONTACT_CLEARANCE_REQUIRED');
        student.recipients=student.recipients.filter(r=>audience==='student'?r.id==='student':r.id==='father'||r.id==='mother').map(r=>({...r,verified:r.verified&&clearance.recipients?.[r.id]?.allowed===true&&clearance.recipients[r.id].phoneHash===digest(r.phone)})).filter(r=>r.verified);
        students.push({...mapped,...student,mappingRevision:digest([mapped.mappingRevision,student.identityRevision,clearance.revision])});
      }catch(e){
        if(signal?.aborted||e.code==='ABORTED')throw e;
        students.push({...mapped,name:student.name,recipients:[],holdReasons:[e.code==='TEMPORARY_ATTENDANCE_REQUIRED'?e.code:'CONTACT_CLEARANCE_REQUIRED']});
      }
    }
    return {...day,students};
  };
}
module.exports={contactHash:digest,contacts,createStudentAdapter,firestoreStudentReader,withStudentDirectory};
