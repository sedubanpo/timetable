'use strict';
// Server-only DI adapter; no credential loading, deployment export or Origin-based bypass.
const blockedEmployment=new Set(['INACTIVE','RETIRED','RESIGNED','TERMINATED','LEAVE','ON_LEAVE','퇴사','퇴직','휴직']);
function denied(){throw Object.assign(Error('FORBIDDEN'),{code:'FORBIDDEN'});}
function createAuthorizer({verifyIdToken,readAccount}){
  return async (session,{reviewBatch=false}={})=>{
    const token=typeof session?.authorization==='string'?session.authorization.match(/^Bearer (\S+)$/)?.[1]:null;
    if(!token)denied();
    let decoded;try{decoded=await verifyIdToken(token,true);}catch{denied();}
    if(!decoded?.uid)denied();
    const {user={},access={},scope={}}=await readAccount(decoded.uid);
    if(user.status!=='ACTIVE'||user.active===false||user.isActive===false||user.disabled===true||blockedEmployment.has(user.employmentStatus)||scope.enabled!==true||scope.campusId!=='banpo'||access.apps?.deskPortal!==true||access.apps?.liveTimetable===false)denied();
    const admin=user.role==='ADMIN';
    const staff=['STAFF','DESK'].includes(user.role) && access.apps?.liveTimetable===true;
    if(!admin && !(reviewBatch && staff))denied();
    return {uid:decoded.uid,role:user.role,active:true,academyId:'banpo',canSendTimetable:admin};
  };
}
function firestoreAccountReader(db){return async uid=>{
  const docs=await Promise.all(['users','userAppAccess','intranetStaffScopes'].map(c=>db.collection(c).doc(uid).get()));
  return {user:docs[0].data(),access:docs[1].data(),scope:docs[2].data()};
};}
module.exports={createAuthorizer,firestoreAccountReader};
