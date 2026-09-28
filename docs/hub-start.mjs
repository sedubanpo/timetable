import {installSso} from './hub-client.mjs';
const start=()=>{
  // DOM is sufficient: image loading must not gate SSO readiness.
  window.initializeTimetablePage?.();
  return installSso({appId:"timetable",...{"brokerUrl":"https://asia-northeast3-fir-lms-prod.cloudfunctions.net/hubSsoApi","hubOrigins":["https://sedubanpo.github.io"]},...window.SeduHubAdapter});
};
if(document.readyState!=='loading')start();else document.addEventListener('DOMContentLoaded',start,{once:true});
