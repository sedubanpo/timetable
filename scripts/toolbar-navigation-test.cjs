const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
for(const file of ['Index.html','docs/index.html']) {
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const line=name=>source.match(new RegExp('^      function '+name+'\\(.*$','m'))[0];
  let now=new Date(2026,8,17,14,5,9), loaded=[];
  class ClockDate extends Date {constructor(...args){super(...(args.length?args:[now]));}}
  const elements={digitalClock:{innerHTML:''},mainPage:{style:{}},loginGate:{style:{}},mainSheetSelector:{value:'today'}};
  const context={Date:ClockDate,document:{getElementById:id=>elements[id]},pollingTimer:null,
    checkVisitorLookupDateRollover(){},updateTimelinePosition(){},
    getNavigableSheetNames:()=>['tomorrow','today','yesterday'],
    getCalendarSheetMap:()=>({'9-17':['today']}),getPreferredSheetNameForDate:()=> 'today',
    loadData:(...args)=>loaded.push(args),alert:()=>{},clearInterval:()=>{}};
  vm.createContext(context);vm.runInContext(['updateClock','navigateDay','goHome'].map(line).join('\n'),context);
  context.updateClock();assert(elements.digitalClock.innerHTML.includes('9/17(목)'));
  assert(elements.digitalClock.innerHTML.includes('14:05:09'));assert(!elements.digitalClock.innerHTML.includes('2026'));
  now=new Date(2027,0,1,0,0,0);context.updateClock();assert(elements.digitalClock.innerHTML.includes('1/1(금)'));
  now=new Date(2026,8,17);context.navigateDay(1);context.navigateDay(-1);context.navigateDay(0);
  assert.deepEqual(loaded.map(x=>x[0]),['yesterday','tomorrow','today']);
  assert(loaded.every(x=>x[1]===false&&x[2]===true));
  context.goHome();assert.equal(elements.mainPage.style.display,'none');assert.equal(elements.loginGate.style.display,'flex');
  const home=source.slice(source.indexOf('<div id="loginGate">'),source.indexOf('<div id="mobileLoading">'));
  const toolbar=source.slice(source.indexOf('<div id="mainPage">'),source.indexOf('<div id="operationCommonMemoStrip"'));
  assert(home.includes('id="teacherLogoutBtn"'));assert(home.includes('onclick="logoutTeacher()"'));
  assert(!toolbar.includes('id="teacherLogoutBtn"'));assert.equal((source.match(/id="teacherLogoutBtn"/g)||[]).length,1);
  assert(source.includes('.toolbar-first-row #roleBadge { display:none !important; }'));
  assert(/\.toolbar-first-row \{[^}]*flex-wrap:wrap[^}]*overflow:visible/.test(source));
  const nav=toolbar.slice(toolbar.indexOf('<div class="nav-group"'),toolbar.indexOf('<select id="mainSheetSelector"'));
  for(const label of ['어제','오늘','내일']) assert(nav.includes('aria-label="'+label+'"><span>'+label+'</span><svg'));
  console.log('PASS '+file+': short date and year rollover; yesterday/today/tomorrow targets; HOME shows gate; unique home-only logout; hidden mode badge; no toolbar scroll; label-before-icon semantics.');
}
