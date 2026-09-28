      // Export tools must never delay DOM readiness, Firebase login or SSO.
      var exportLibraryLoads = Object.create(null);
      function ensureExportLibrary(name) {
        var sources={html2canvas:'https://html2canvas.hertzen.com/dist/html2canvas.min.js',XLSX:'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'};
        if(!sources[name])return Promise.reject(new Error('알 수 없는 내보내기 도구입니다.'));
        if(window[name])return Promise.resolve(window[name]);
        if(exportLibraryLoads[name])return exportLibraryLoads[name];
        var pending=new Promise(function(resolve,reject){
          var script=document.createElement('script'),timer;
          function finish(error){
            clearTimeout(timer);script.onload=script.onerror=null;
            if(error){script.remove();reject(error);}else resolve(window[name]);
          }
          script.async=true;script.src=sources[name];
          script.onload=function(){finish(window[name]?null:new Error('내보내기 도구를 불러오지 못했습니다.'));};
          script.onerror=function(){finish(new Error('내보내기 도구를 불러오지 못했습니다. 다시 시도해 주세요.'));};
          timer=setTimeout(function(){finish(new Error('내보내기 도구 연결이 지연됩니다. 다시 시도해 주세요.'));},15000);
          document.head.appendChild(script);
        });
        exportLibraryLoads[name]=pending;
        pending.catch(function(){if(exportLibraryLoads[name]===pending)delete exportLibraryLoads[name];});
        return pending;
      }
      function renderExportCanvas(element, options) {
        return ensureExportLibrary('html2canvas').then(function(render){return render(element,options);});
      }
