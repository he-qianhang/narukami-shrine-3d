// Opt-in local measurements: ?verify=1&perf=1. Nothing is added to the showcase.
export function createPerformanceProbe(){
  const marks={appStart:performance.now()},geometry={},samples=[],heapSamples=[],longTasks=[];
  let renderer,frameStart=0,firstFrame=false,active=null,setShot,queue=[];
  const longTaskSupported=typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('longtask');
  if(longTaskSupported)new PerformanceObserver(list=>{
    for(const e of list.getEntries())longTasks.push({start:e.startTime,duration:e.duration});
  }).observe({type:'longtask',buffered:true});
  const panel=document.createElement('section');panel.id='performance-panel';
  panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:6;padding:10px;background:#251d39ed;color:white;font:12px sans-serif;max-width:460px';
  const name=document.createElement('input');name.value='全景';name.setAttribute('aria-label','性能样本名称');name.style.width='110px';
  const measure=document.createElement('button');measure.textContent='测量此机位（6秒）';
  const status=document.createElement('p');status.id='performance-status';status.textContent='等待首帧';
  const output=document.createElement('pre');output.id='performance-data';output.hidden=true;
  const summary=document.createElement('pre');summary.style.cssText='white-space:pre-wrap;margin:8px 0';
  function heap(label){
    if(performance.memory)heapSamples.push({label,time:performance.now(),usedBytes:performance.memory.usedJSHeapSize,totalBytes:performance.memory.totalJSHeapSize});
  }
  function stats(values){
    if(!values.length)return null;
    const sorted=[...values].sort((a,b)=>a-b),at=p=>sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];
    return {count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,median:at(.5),p95:at(.95),max:sorted.at(-1)};
  }
  function report(){
    const resourceEntries=performance.getEntriesByType('resource');
    const resources=resourceEntries.map(e=>({path:new URL(e.name).pathname,query:new URL(e.name).search,start:e.startTime,responseStart:e.responseStart,responseEnd:e.responseEnd,duration:e.duration,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize,deliveryType:e.deliveryType??null,responseStatus:e.responseStatus??null}));
    const model=resources.find(e=>/\.glb(\.gz)?$/.test(e.path));
    const gl=renderer?.getContext(),debug=gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      createdAt:new Date().toISOString(),url:location.href,userAgent:navigator.userAgent,
      viewport:{width:renderer?.domElement.clientWidth,height:renderer?.domElement.clientHeight,devicePixelRatio,renderPixelRatio:renderer?.getPixelRatio(),bufferWidth:renderer?.domElement.width,bufferHeight:renderer?.domElement.height},
      gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),
      navigation:performance.getEntriesByType('navigation').map(e=>({type:e.type,duration:e.duration,transferSize:e.transferSize})),
      marks:{...marks},load:{modelTransferMs:model?model.responseEnd-model.responseStart:null,modelDownloadEndMs:model?.responseEnd??null,decodeMs:marks.decodeEnd-marks.decodeStart,mergeMs:marks.mergeEnd-marks.mergeStart,downloadEndToReadyMs:model?marks.ready-model.responseEnd:null,downloadEndToFirstFrameSubmittedMs:model?marks.firstFrameSubmitted-model.responseEnd:null,firstFrameSubmittedMs:marks.firstFrameSubmitted,firstFrameNextRafMs:marks.firstFrameNextRaf},
      geometry:{...geometry},memory:{jsHeapAvailable:!!performance.memory,sampledHeapPeakBytes:heapSamples.length?Math.max(...heapSamples.map(s=>s.usedBytes)):null,heapSamples:[...heapSamples],rendererCounts:renderer?{...renderer.info.memory}:null},
      resources,samples:[...samples],longTasks:longTaskSupported?[...longTasks]:null,
      limitations:['本地传输不代表线上网络；首轮请求也不等于机器或GPU冷启动。','CPU耗时是JS和WebGL提交耗时，帧间隔包含呈现调度；未直接测GPU时长。','首帧提交不是精确屏幕呈现时间；下一次rAF仅作近似。','几何字节为可遍历的属性/索引数据与底层ArrayBuffer，不是进程内存或完整显存。','JS堆峰值仅在浏览器提供performance.memory时采样，不能当作完整内存峰值。']
    };
  }
  function publish(){
    const data=report();output.textContent=JSON.stringify(data);
    summary.textContent=`首帧提交：${data.load.firstFrameSubmittedMs?.toFixed(1)??'—'} ms\n解码：${data.load.decodeMs?.toFixed(1)??'—'} ms；合并：${data.load.mergeMs?.toFixed(1)??'—'} ms\n已测样本：${samples.length}`;
  }
  function begin(label,expectedPose=null){
    if(active||!marks.firstFrameSubmitted)return;
    // Ignore two seconds after the trigger to settle the camera and shader caches.
    active={name:label,expectedPose,start:performance.now()+2000,intervals:[],cpu:[],calls:[],triangles:[],last:0,visibilityInterrupted:false,poseDrifted:false};
    measure.disabled=true;batch.disabled=true;status.textContent=`${label}：稳定2秒，然后采样6秒`;
  }
  measure.onclick=()=>begin(name.value||'未命名机位');
  const batch=document.createElement('button');batch.textContent='测量五机位（约80秒）';
  const views=[
    {name:'全景',azimuth:.4,elevation:.44,target:[0,4.2,0],zoom:1},
    {name:'樱冠近景',azimuth:.4,elevation:.56,target:[-3.3,8.7,-1.8],zoom:2},
    {name:'水景',azimuth:.61,elevation:.18,target:[4.1,2.5,.6],zoom:2},
    {name:'环绕背侧',azimuth:2.3,elevation:.62,target:[0,4.2,0],zoom:.95},
    {name:'俯视',azimuth:.4,elevation:1.3,target:[0,4.2,0],zoom:1}
  ];
  function next(){
    const view=queue.shift();if(!view)return;
    setShot(view);name.value=view.name;begin(view.name,view);
  }
  batch.onclick=()=>{
    if(active||!marks.firstFrameSubmitted||!setShot)return;
    queue=views.flatMap(view=>[1,2].map(repeat=>({...view,name:view.name+'-'+repeat})));next();
  };
  document.addEventListener('visibilitychange',()=>{if(active&&document.hidden)active.visibilityInterrupted=true;});
  const refresh=document.createElement('button');refresh.textContent='更新测量状态';refresh.onclick=publish;
  const download=document.createElement('button');download.textContent='导出性能JSON';download.onclick=()=>{
    heap('export');publish();
    const url=URL.createObjectURL(new Blob([output.textContent],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='narukami-performance.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  panel.append(name,measure,batch,status,summary,refresh,download,output);document.body.append(panel);
  return {
    attach(r){renderer=r;renderer.info.autoReset=false;heap('renderer-created');},
    bindCamera(callback){setShot=callback;},
    mark(label){marks[label]=performance.now();heap(label);},
    trackLoader(loader){
      const parse=loader.parse;
      loader.parse=function(data,path,onLoad,onError){
        marks.decodeStart=performance.now();heap('decode-start');
        return parse.call(this,data,path,gltf=>{marks.decodeEnd=performance.now();heap('decode-end');onLoad(gltf);},onError);
      };
    },
    recordGeometry(label,root){
      const geometries=new Set(),buffers=new Set(),arrays=new Set();let meshes=0,vertices=0,triangles=0,attributeBytes=0;
      root.traverse(o=>{
        if(!o.isMesh)return;meshes++;const g=o.geometry;
        if(geometries.has(g))return;geometries.add(g);
        vertices+=g.getAttribute('position').count;triangles+=(g.index?.count??g.getAttribute('position').count)/3;
        for(const attribute of [...Object.values(g.attributes),g.index].filter(Boolean)){
          const a=attribute.array??attribute.data.array;
          if(!arrays.has(a)){arrays.add(a);attributeBytes+=a.byteLength;}buffers.add(a.buffer);
        }
      });
      geometry[label]={meshes,geometries:geometries.size,vertices,triangles,attributeBytes,backingBufferBytes:[...buffers].reduce((s,b)=>s+b.byteLength,0)};
    },
    frameStart(){
      const now=performance.now();
      if(firstFrame&&!marks.firstFrameNextRaf){marks.firstFrameNextRaf=now;publish();}
      frameStart=now;renderer.info.reset();
      if(active&&now>=active.start){
        const label=active.name+'：采样中';if(status.textContent!==label)status.textContent=label;
        active.frameInterval=active.last?now-active.last:0;active.last=now;
      }
    },
    frameEnd(ready){
      const now=performance.now();
      if(ready&&!firstFrame){firstFrame=true;marks.firstFrameSubmitted=now;heap('first-frame');status.textContent='可开始采样';publish();}
      if(!active||frameStart<active.start)return;
      const pose={...document.querySelector('#viewport').dataset};
      if(active.expectedPose){
        const expected=active.expectedPose,angle=Number(pose.azimuth)-expected.azimuth;
        if(Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))>.001||Math.abs(Number(pose.elevation)-expected.elevation)>.001||Math.abs(Number(pose.zoom)-expected.zoom)>.001)active.poseDrifted=true;
      }
      if(active.frameInterval)active.intervals.push(active.frameInterval);
      active.cpu.push(now-frameStart);active.calls.push(renderer.info.render.calls);active.triangles.push(renderer.info.render.triangles);
      if(now-active.start<6000)return;
      const elapsed=active.last-active.start;
      heap(active.name);
      samples.push({name:active.name,durationMs:elapsed,visibilityInterrupted:active.visibilityInterrupted,poseDrifted:active.poseDrifted,expectedPose:active.expectedPose,pose,frameIntervalMs:stats(active.intervals),fps:active.intervals.length/(active.intervals.reduce((s,n)=>s+n,0)/1000),framesOver33ms:active.intervals.filter(n=>n>33.34).length,framesOver50ms:active.intervals.filter(n=>n>50).length,cpuSubmissionMs:stats(active.cpu),drawCalls:stats(active.calls),drawnTriangles:stats(active.triangles),rawIntervalsMs:active.intervals});
      active=null;measure.disabled=false;batch.disabled=false;status.textContent='测量完成';publish();next();
    }
  };
}
