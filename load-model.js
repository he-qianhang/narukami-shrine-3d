// Stream gzip transport compression; older browsers use the direct GLB path.
export const loadInfo={phase:'download',loaded:0,total:0,downloadMs:null,prepareMs:null};
export function loadModel(loader,url,onLoad,onProgress,onError){
  const started=performance.now();let prepareStarted=null;
  Object.assign(loadInfo,{phase:'download',loaded:0,total:0,downloadMs:null,prepareMs:null});
  const notify=()=>onProgress({phase:loadInfo.phase,loaded:loadInfo.loaded,total:loadInfo.total});
  const progress=event=>{loadInfo.loaded=event.loaded;loadInfo.total=event.total||0;notify();};
  const prepare=()=>{prepareStarted=performance.now();loadInfo.downloadMs=prepareStarted-started;loadInfo.phase='prepare';notify();};
  const finish=result=>{
    onLoad(result);loadInfo.prepareMs=prepareStarted===null?null:performance.now()-prepareStarted;
    loadInfo.phase='ready';notify();
  };
  const fail=error=>{loadInfo.phase='error';notify();onError(error);};
  if(typeof DecompressionStream==='undefined')return loader.load(url,finish,event=>{
    progress(event);if(event.total>0&&event.loaded>=event.total&&prepareStarted===null)prepare();
  },fail);
  (async()=>{
    const response=await fetch(url.replace('.glb','.glb.gz'));
    if(!response.ok)throw new Error('模型下载失败：'+response.status);
    const total=Number(response.headers.get('content-length'));let loaded=0;
    const tracked=new TransformStream({transform(chunk,controller){
      loaded+=chunk.byteLength;progress({loaded,total});controller.enqueue(chunk);
    }});
    const stream=response.body.pipeThrough(tracked).pipeThrough(new DecompressionStream('gzip'));
    const data=await new Response(stream).arrayBuffer();
    prepare();
    return loader.parseAsync(data,new URL('.',new URL(url,location.href)).href);
  })().then(finish).catch(fail);
}
