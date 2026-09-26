const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('Code.gs','utf8');
function serverFunction(name){const start=source.indexOf('function '+name+'(');const end=source.indexOf('\nfunction ',start+1);return source.slice(start,end<0?undefined:end);}
const raw={headers:['1강의실','2관 1강의실','학생비밀'],grid:{13:[['개별 수학 가상T','개인정보학생 비밀고3','비고: 상담내용'],[],['자기주도 비밀학생']]},version:'private'};
let authorized=false, reads=0;
const c={SCHEDULE_START_HOUR:8,SCHEDULE_END_HOUR:23,authenticateFirebaseTeacher_(token){if(token!=='valid')throw Error('UNAUTHORIZED');authorized=true;return {teacherName:'가상'};},getFixedGridData(){assert(authorized);reads++;return raw;}};
vm.createContext(c);
for(const name of ['getSubjectName_','isTeacherHeader_','extractTeacherName_','normalizeTeacherName_','getAuthenticatedRoomOccupancy'])vm.runInContext(serverFunction(name),c);
assert.throws(()=>c.getAuthenticatedRoomOccupancy('9/26',false,''),/UNAUTHORIZED/);assert.equal(reads,0);
const result=c.getAuthenticatedRoomOccupancy('9/26',false,'valid');const json=JSON.stringify(result);
for(const secret of ['개인정보학생','비밀고3','상담내용','비밀학생','학생비밀','private','student','count'])assert(!json.includes(secret),secret+' must be absent');
const row=result.rows.find(r=>r.hour===13);assert(row.cells[0].occupied);assert(row.cells[0].lessons[0].own);assert.equal(row.cells[0].lessons[0].subject,'수학');assert(!row.cells[1].occupied);assert(row.cells[2].occupied);assert.equal(row.cells[2].lessons.length,0);
const {extract}=require('./toolbar-attendance-test.cjs');
const html=fs.readFileSync('Index.html','utf8'),mirror=fs.readFileSync('docs/index.html','utf8');
for(const name of ['openRoomOverview','closeRoomOverview','loadRoomOverview','roomOverviewRoomBuilding','selectRoomOverviewBuilding','renderRoomOverview','callServer'])assert(mirror.includes(extract(name)),name+' mirror parity');
assert(html.includes('<i></i><i></i><i></i><i></i><i></i>'));assert(html.includes('실제 학생 수가 아닙니다'));
assert(extract('loadRoomOverview').includes('request !== roomOverviewRequest'));assert(extract('closeRoomOverview').includes('roomOverviewData = null'));
console.log('PASS: authenticated projection, no student/notes/count leakage, real occupancy, own class, fixed placeholders, request isolation, mirror parity');
async function lifecycle(){
  const elements={};
  for(const id of ['roomOverviewPage','roomOverviewStatus','roomOverviewRefresh','roomOverviewTable','roomOverviewBuildings','mainPage','roomOverviewBtn']) elements[id]={hidden:false,textContent:'',innerHTML:'',focus(){},disabled:false};
  let resolveRead,fail=false,rendered=0;
  const client={roomOverviewRequest:0,roomOverviewData:null,roomOverviewSheet:'9/26',authState:{loggedIn:true,loginId:'teacher'},
    document:{getElementById:id=>elements[id],querySelector:()=>null},
    callServer:()=>fail?Promise.reject(Error('offline')):new Promise(resolve=>resolveRead=resolve),
    renderRoomOverview(){rendered++;}
  };
  vm.createContext(client);vm.runInContext(extract('loadRoomOverview')+'\n'+extract('closeRoomOverview'),client);
  let pending=client.loadRoomOverview(false);client.closeRoomOverview(false);resolveRead(result);await pending;
  assert.equal(rendered,0);assert.equal(client.roomOverviewData,null);
  elements.roomOverviewPage.hidden=false;pending=client.loadRoomOverview(false);client.authState.loginId='other';resolveRead(result);await pending;assert.equal(rendered,0);
  fail=true;await client.loadRoomOverview(true);assert.match(elements.roomOverviewStatus.textContent,/못했습니다/);assert.equal(elements.roomOverviewRefresh.disabled,false);
  fail=false;pending=client.loadRoomOverview(true);resolveRead(result);await pending;assert.equal(rendered,1);
  console.log('PASS: close during load, account switch isolation, failure/retry, button restoration');
}
lifecycle().catch(e=>{console.error(e);process.exitCode=1;});
