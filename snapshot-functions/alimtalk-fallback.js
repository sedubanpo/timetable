'use strict';

// Build the replacement from the same verified variables as the approved ATA.
// SMS conversion can remove the en dash and cannot render a Kakao button.
const inquiryUrl='https://pf.kakao.com/_KIZxin/chat';
function fallbackText(variables){
  const keys=['#{학생명}','#{수업일}','#{등원시각}','#{수업목록}'];
  if(keys.some(k=>typeof variables?.[k]!=='string'||!variables[k].trim())){
    throw Object.assign(Error('INVALID_FALLBACK_CONTENT'),{code:'INVALID_FALLBACK_CONTENT'});
  }
  const lessons=variables['#{수업목록}']
    .replace(/(\d{2}:\d{2})[–—-](?=\d{2}:\d{2})/g,'$1 ~ ')
    .replace(/^[①-⑳]/gm,c=>(c.charCodeAt(0)-0x2460+1)+'.')
    .replace(/ · /g,' / ');
  return [
    '[에스학원 수업 일정 안내]',
    variables['#{학생명}']+' 학생의 수업 안내드립니다.',
    '',
    '수업일: '+variables['#{수업일}'],
    '등원 시각: '+variables['#{등원시각}'],
    '',
    '[수업 안내: 과목/시간/강사/관/강의실]',
    lessons,
    '',
    '수업 일정 변경 문의:',
    inquiryUrl,
    '',
    '전과목, 소수 정예 수업',
    '반포 에스학원'
  ].join('\n');
}
module.exports={fallbackText,inquiryUrl};
