// Stream lossless transport compression; older browsers use the original GLB.
export function loadModel(loader,url,onLoad,onProgress,onError){
  if(typeof DecompressionStream==='undefined')return loader.load(url,onLoad,onProgress,onError);
  (async()=>{
    const response=await fetch(url.replace('.glb','.glb.gz'));
    if(!response.ok)throw new Error('模型下载失败：'+response.status);
    const total=Number(response.headers.get('content-length'));let loaded=0;
    const progress=new TransformStream({transform(chunk,controller){
      loaded+=chunk.byteLength;onProgress({loaded,total});controller.enqueue(chunk);
    }});
    const stream=response.body.pipeThrough(progress).pipeThrough(new DecompressionStream('gzip'));
    const data=await new Response(stream).arrayBuffer();
    return loader.parseAsync(data,new URL('.',new URL(url,location.href)).href);
  })().then(onLoad).catch(onError);
}
