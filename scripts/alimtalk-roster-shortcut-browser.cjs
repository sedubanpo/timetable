const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),assert=require('node:assert/strict');
// Entire production modal layout, only synthetic records; all network requests blocked.
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
 const page=await b.newPage({viewport:{width,height}});await page.route('**/*',r=>r.abort());
 await page.setContent(fs.readFileSync('Index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
 for(const f of ['alimtalk-contract.js','alimtalk-batch-ui.js','alimtalk-roster.js'])await page.addScriptTag({path:'assets/'+f});
 await page.evaluate(()=>{
 document.querySelectorAll('style').forEach(n=>document.head.append(n));const modal=document.getElementById('studentImageModal');document.body.replaceChildren(modal);document.body.className='';modal.style.display='flex';modal.dataset.cardMode='message';document.querySelectorAll('[data-card-channel=image]').forEach(n=>n.hidden=true);
 Object.assign(window,{studentCardMode:'message',cardAudience:'student',currentSheetName:'11/12(목)',attendanceDateKey:()=> '2026-11-12',getScheduleSessionKey:()=> 'offline',timetableLoginSequence:1,studentImageScheduleMap:{검증대기:[],검증실패:[],검증미확정:[],검증완료:[]},selectedStudentForImage:'검증실패',isStudentImageModalOpen:()=>true,
 refreshStudentImageListSelectionState:()=>{},selectStudentImageItem:(n)=>{selectedStudentForImage=n;},resetCardAlimtalk:()=>{cardBulkUI?.reset();},filterStudentImageList:()=>{},reloadCardRoster:()=>{}});
 cardRosterScope=rosterKey();cardRosterRows=[{name:'검증대기',studentId:'wait',state:'unsent'},{name:'검증실패',studentId:'failed',state:'unsent',failed:true},{name:'검증미확정',studentId:'pending',state:'pending'},{name:'검증완료',studentId:'done',state:'sent'}];
 window.calls=[];window.cardAlimtalkApi=async(action,input)=>{
 calls.push(action);if(action==='batchPreview')return {date:'2026-11-12',rows:cardRosterRows,items:[{studentId:'failed',name:'검증실패',ticket:'fake',relation:'학생',masked:'010-****-0000',retry:true,text:'[가상 수업 안내]\n검증실패 학생\n11/12(목) 수학 17:00–19:00\n검증용 본문입니다.'}],previewId:'fake',batchSize:40};
 if(action==='batchHistory')return {results:[{id:'fake-result',studentId:'pending',name:'검증미확정',state:'UNKNOWN',createdAt:1,masked:'010-****-0000',relation:'학생'}]};throw Error('SEND_FORBIDDEN');};
 drawAlimtalkRoster(document.getElementById('studentImageList'),'');
 });
 await page.screenshot({path:'/tmp/timetable-ux-review/'+label+'-shortcut-list.png'});
 await page.getByRole('button',{name:'검증실패 학생 본인 재발송',exact:true}).click();
 await page.getByText('실패 건 재시도',{exact:false}).waitFor();
 assert(await page.locator('#cardAlimtalkPanel .send-action').isDisabled());
 await page.screenshot({path:'/tmp/timetable-ux-review/'+label+'-shortcut-review.png'});
 await page.getByRole('button',{name:'← 학생 목록',exact:true}).click();
 await page.getByRole('button',{name:'검증미확정 학생 본인 결과 확인',exact:true}).click();
 await page.getByRole('button',{name:'미확정 1건 결과 갱신'}).waitFor();assert.equal(await page.locator('#cardAlimtalkPanel .send-action').count(),0);
 await page.screenshot({path:'/tmp/timetable-ux-review/'+label+'-shortcut-pending.png'});
 assert.deepEqual(await page.evaluate(()=>calls),['batchPreview','batchHistory']);
 const overflow=await page.locator('#cardAlimtalkPanel').evaluate(n=>n.scrollWidth-n.clientWidth);assert(overflow<=1,String(overflow));
 console.log(label,'shortcuts, scoped review, return, pending result and no sends verified');await page.close();
}
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
