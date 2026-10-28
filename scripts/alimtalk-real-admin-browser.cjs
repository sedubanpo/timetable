'use strict';
// Reuse the production-HTML harness. Only the local synthetic delivery adapter
// is connected; its CSP and transport guards block all non-local outbound.
const fs=require('fs');
let harness=fs.readFileSync('scripts/alimtalk-card-demo.cjs','utf8');
harness=harness.replace('let mapping=null,clearance=null;',`let mapping=null,clearance=null;
const realSource={academyId:'banpo',date:f.day.date,complete:true,revision:'source-1',entries:[{id:'cell-1',fingerprint:'f1',sourceName:f.student.name,sourceSchool:'가상중2',lesson:f.lesson}]};
const realMapping={academyId:'banpo',date:f.day.date,studentId:f.student.id,sourceRevision:'source-1',revision:'m1',identityRevision:'i1',verifiedBy:'synthetic-admin',entries:[{id:'cell-1',fingerprint:'f1'}]};
const realTestDelivery=require('../snapshot-functions/alimtalk-real-admin-test').createRealAdminTest({...f.deps,testPhone:'01000000001,01000000002',loadSource:async()=>realSource,resolveStudent:async()=>({id:f.student.id,name:f.student.name,school:'가상중',grade:'2',identityRevision:'i1'}),reviewStore:{mapping:async()=>realMapping,dayAssignments:async()=>({[require('../snapshot-functions/alimtalk-service').hash('cell-1')]:{studentId:f.student.id,revision:'m1',fingerprint:'f1'}})}});
`);
harness=harness.replace('openStudentImageModal();const n=',"openStudentImageModal();cardAlimtalkSelections[cardAlimtalkKey()]='synthetic-1';const n=");
harness=harness.replace("const testAction={testPreview:","const actual=action.startsWith('realTest')?realTestDelivery:testDelivery;const testAction={realTestPreview:'preview',realTestSend:'send',realTestResults:'results',realTestReconcile:'reconcile',testPreview:");
harness=harness.replaceAll('testDelivery.reconcile(s,i.id)','actual.reconcile(s,i.id)').replaceAll('testDelivery[testAction]','actual[testAction]').replace("action==='testPreview'?","['testPreview','realTestPreview'].includes(action)?");
new Function('require',harness)(require);
