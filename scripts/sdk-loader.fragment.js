      var liveExternalScriptLoads = Object.create(null);
      function loadLiveExternalScriptOnce(src, test) {
        if (test()) return Promise.resolve();
        if (liveExternalScriptLoads[src]) return liveExternalScriptLoads[src];
        var pending=new Promise(function(resolve,reject){
          var script=document.createElement('script'),timer;
          function finish(error){
            clearTimeout(timer);script.onload=script.onerror=null;
            if(error){script.remove();reject(error);}else resolve();
          }
          script.src=src;script.async=true;
          script.onload=function(){finish(test()?null:new Error('로그인 연결 도구를 불러오지 못했습니다. 다시 시도해 주세요.'));};
          script.onerror=function(){finish(new Error('로그인 서버 연결을 확인한 뒤 다시 시도해 주세요.'));};
          timer=setTimeout(function(){finish(new Error('로그인 서버 연결이 지연됩니다. 다시 시도해 주세요.'));},20000);
          document.head.appendChild(script);
        });
        liveExternalScriptLoads[src]=pending;
        pending.catch(function(){if(liveExternalScriptLoads[src]===pending)delete liveExternalScriptLoads[src];});
        return pending;
      }
