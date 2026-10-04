const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
async function verify(file){
 const html=fs.readFileSync(file,'utf8');const start=html.indexOf('      var scheduleExportPending =');const end=html.indexOf('      function writeScheduleToExcel(',start);
 const button={disabled:false,innerHTML:'시수 저장'};let session='a',teacher='',resolve,requests=[],writes=[],alerts=[];
 const ctx={Promise,Array,Error,XLSX:{},currentSheetName:'10/4(일)',lastData:{snapshot:true},document:{querySelectorAll:()=>[button]},getScheduleSessionKey:()=>session,getActiveTeacherName:()=>teacher,alert:v=>alerts.push(v),callServer:(method,args)=>{requests.push([method,args]);return new Promise(r=>resolve=r);},writeScheduleToExcel:(data,sheet)=>writes.push({data,sheet})};vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
 const tick=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};const data={headers:['1강의실'],grid:{10:[[]]}};
 let first=ctx.exportScheduleToExcel();assert.equal(first,ctx.exportScheduleToExcel());await tick();assert.equal(requests.length,1);assert.equal(requests[0][0],'getFixedGridData');assert.equal(requests[0][1][1],true);assert(button.disabled);resolve(data);await first;assert.equal(writes[0].data,data);assert.equal(ctx.lastData.snapshot,true);assert.equal(button.disabled,false);
 for(const response of [{error:'failed'},{__snapshotHandled:true},null,{headers:[],grid:[]}]){first=ctx.exportScheduleToExcel();await tick();resolve(response);await first;assert.equal(writes.length,1);assert(!button.disabled);}
 first=ctx.exportScheduleToExcel();await tick();ctx.currentSheetName='10/5(월)';resolve(data);await first;assert.equal(writes.length,1);
 first=ctx.exportScheduleToExcel();await tick();session='b';resolve(data);await first;assert.equal(writes.length,1);
 teacher='검증강사';first=ctx.exportScheduleToExcel();await tick();assert.equal(requests.at(-1)[0],'getTeacherGridData');assert.deepEqual(Array.from(requests.at(-1)[1]),['10/5(월)','검증강사',true]);resolve(data);await first;assert.equal(writes.length,2);
 ctx.callServer=()=>Promise.reject(Error('offline'));await ctx.exportScheduleToExcel();assert.equal(writes.length,2);assert(!button.disabled);assert(alerts.at(-1).includes('저장하지 않았습니다'));
 const subjectStart=html.indexOf('      function getSubjectName('),subjectEnd=html.indexOf('      function getSubjectEmoji(',subjectStart);vm.runInContext(html.slice(subjectStart,subjectEnd),ctx);
 const reviewStart=html.indexOf('function getReviewSubjectLabel('),reviewEnd=html.indexOf('function getStudentIdentity(',reviewStart);vm.runInContext(html.slice(reviewStart,reviewEnd),ctx);
 for(const subject of ['생윤','윤사','사문','정법','생명과학','수II'])assert.equal(ctx.getReviewSubjectLabel('개별 '+subject+' 검증강사T'),subject);
 console.log('PASS '+file+': fresh-only export, double click, failed/snapshot/malformed reads, date/session isolation, teacher scope, subject parity');
}
(async()=>{await verify('Index.html');await verify('docs/index.html');})().catch(e=>{console.error(e);process.exitCode=1;});
