const fs=require('node:fs'),http=require('node:http');
const names=['openRoomOverview','closeRoomOverview','loadRoomOverview','roomOverviewRoomBuilding','selectRoomOverviewBuilding','renderRoomOverview'];
http.createServer((req,res)=>{
  const source=fs.readFileSync('Index.html','utf8');
  const extract=name=>{const start=source.indexOf('      function '+name+'(');return source.slice(start,source.indexOf('\n      }',start)+8);};
  const section=source.slice(source.indexOf('    <section id="roomOverviewPage"'),source.indexOf('    <div id="mainPage">'));
  const rooms=Array.from({length:15},(_,i)=>i<9?(i+1)+'강의실':(i<12?'2관 ':'3관 ')+(i%3+1)+'강의실');
  const rows=Array.from({length:9},(_,n)=>({hour:10+n,cells:rooms.map((_,i)=>({occupied:(n+i)%7!==0,lessons:(n+i)%7===0?[]:[{teacher:['가상가','가상나','가상다','가상라'][i%4],subject:['수학','국어','영어','과학'][i%4],own:i===1&&n===3}]}))}));
  res.setHeader('Content-Type','text/html;charset=utf-8');
  res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+source.match(/<style>[\s\S]*?<\/style>/)[0]+'<body>'+section+'<div id="mainPage"><button id="roomOverviewBtn" onclick="openRoomOverview()">전체 강의실</button></div><script>var authState={loggedIn:true,loginId:"fixture"},currentSheetName="9/26(토) · 합성 데이터",roomOverviewRequest=0,roomOverviewData=null,roomOverviewBuilding="전체",roomOverviewSheet="";function escapeHtml(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");}function callServer(){return Promise.resolve('+JSON.stringify({rooms,rows})+');}'+names.map(extract).join('\n')+'openRoomOverview();</script></body></html>');
}).listen(4190,'127.0.0.1',()=>console.log('Room overview synthetic fixture http://127.0.0.1:4190'));
