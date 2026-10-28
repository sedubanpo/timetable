'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('/tmp/timetable-alimtalk-test-tools/node_modules/jsdom');
for(const file of ['Index.html','docs/index.html'])test(file+' tabs preserve draft and never invoke delivery',()=>{
 const html=fs.readFileSync(file,'utf8'),dom=new JSDOM(html),d=dom.window.document;
 let resets=0;const c={document:d,TimetableAlimtalk:require('../assets/alimtalk-contract'),selectedStudentForImage:'가상학생',currentSheetName:'10/29(목)',attendanceDateKey:()=> '2026-10-29',resetCardAlimtalk:()=>resets++,buildStudentCardViewModel:()=>({timelineRows:[{start:16,end:17,title:'수학(가상T)',room:'6',classType:'1:1'},{start:17,end:18,isBreak:true}]}),getStudentCardRoomMeta:()=>({building:'본관',room:'6강의실'}),fetch:()=>{throw Error('OUTBOUND_FORBIDDEN')}};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf("      var studentCardMode='image';"),html.indexOf('      var cardAlimtalkTest=null')),c);
 d.getElementById('studentImageSearch').value='가상';d.getElementById('cardUnsentReason')?.setAttribute('data-proof','preserved');
 c.setStudentCardMode('message');assert.equal(d.getElementById('cardMessageTab').getAttribute('aria-selected'),'true');assert.match(d.getElementById('cardMessageReferenceBody').textContent,/① 수학 16:00–17:00/);assert.doesNotMatch(d.getElementById('cardMessageReferenceBody').textContent,/자기주도/);assert.equal(resets,0);
 c.setStudentCardMode('image');assert.equal(d.getElementById('studentImageSearch').value,'가상');assert.equal(resets,1);assert.equal(d.getElementById('cardMessageReference').hidden,true);
 c.selectedStudentForImage='';c.setStudentCardMode('message');assert.match(d.getElementById('cardMessageReferenceBody').textContent,/학생을 선택/);
 dom.window.close();
});
