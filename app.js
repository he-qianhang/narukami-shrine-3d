import {loadModel} from './load-model.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createEnvironment,backgroundFov} from './environment.js';
import {finishStone} from './stone.js';
import {createAtmosphere} from './atmosphere.js';
import {createWater} from './water.js';
import {createVerification} from './verification.js';
import {DEFAULT_SHOTS,PREVIOUS_DEFAULT_SHOTS,MIN_ELEVATION,MAX_ELEVATION,STORAGE_KEY,validateShots,mixShot,sampleTour} from './tour.js';

const viewport=document.querySelector('#viewport');
const editing=new URLSearchParams(location.search).get('edit')==='1';
const verifying=new URLSearchParams(location.search).get('verify')==='1';
const probe=verifying&&new URLSearchParams(location.search).get('perf')==='1'?(await import('./performance.js')).createPerformanceProbe():null;
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
document.body.classList.toggle('editing',editing);
document.querySelector('#director').hidden=!editing;
let shots=structuredClone(DEFAULT_SHOTS);
try{const saved=localStorage.getItem(STORAGE_KEY);if(saved){const stored=validateShots(JSON.parse(saved));if(JSON.stringify(stored)!==JSON.stringify(validateShots(PREVIOUS_DEFAULT_SHOTS)))shots=stored;}}catch{}
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
probe?.attach(renderer);
renderer.setPixelRatio(verifying?1:Math.min(devicePixelRatio,1.75));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
viewport.append(renderer.domElement);
const environment=createEnvironment(renderer);
const scene=new THREE.Scene();
scene.fog=new THREE.Fog('#d2c7d8',45,90);
const camera=new THREE.OrthographicCamera(-12,12,9,-9,.1,150);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.08;
controls.enablePan=editing;controls.maxTargetRadius=10;controls.minZoom=.65;controls.maxZoom=verifying?5:2;
const viewingFloor=verifying?-Math.PI/2+.001:editing?MIN_ELEVATION:-Math.PI/9;
controls.minPolarAngle=verifying?.001:Math.PI/2-MAX_ELEVATION;controls.maxPolarAngle=Math.PI/2-viewingFloor;
controls.zoomSpeed=.65;controls.rotateSpeed=.55;
scene.add(new THREE.HemisphereLight('#f0dcff','#b7a7c5',1.75));
const bounce=new THREE.DirectionalLight('#d7c6e2',.8);bounce.position.set(1,-7,5);scene.add(bounce);
const sun=new THREE.DirectionalLight('#ffe4c8',2.7);
sun.position.set(-7,17,10);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-12;sun.shadow.camera.near=1;sun.shadow.camera.far=50;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.radius=3;
scene.add(sun);
const rim=new THREE.DirectionalLight('#c6b2ff',1.2);rim.position.set(5,8,-8);scene.add(rim);
const sacredLight=new THREE.PointLight('#b66dff',4,4,2);sacredLight.position.set(-2.55,6.1,-1.65);scene.add(sacredLight);
const effects=new THREE.Scene();
const atmosphere=createAtmosphere(effects);
const water=createWater(renderer,environment);

let ready=false,mode=editing||verifying||motionQuery.matches?'manual':'auto',pinned=editing||verifying||motionQuery.matches;
let dragging=false,lastInteraction=performance.now(),tourTime=0,blend=null;
const radius=26;
function applyShot(s){
  controls.target.fromArray(s.target);camera.zoom=s.zoom;
  const elevation=Math.max(viewingFloor,s.elevation);
  camera.position.set(Math.sin(s.azimuth)*Math.cos(elevation)*radius,Math.sin(elevation)*radius,Math.cos(s.azimuth)*Math.cos(elevation)*radius).add(controls.target);
  camera.lookAt(controls.target);camera.updateProjectionMatrix();
}
function currentShot(){
  const d=camera.position.clone().sub(controls.target);
  return {azimuth:Math.atan2(d.x,d.z),elevation:Math.asin(d.y/d.length()),target:controls.target.toArray(),zoom:camera.zoom,duration:8,name:`镜头 ${shots.length+1}`};
}
function startTour(){
  // Flush damping before yielding camera ownership to the director.
  controls.enableDamping=false;controls.update();controls.enableDamping=true;
  blend={from:currentShot(),time:0};tourTime=0;mode='auto';pinned=false;updateViewPause();
}
function stopTour(pin=false){mode='manual';blend=null;lastInteraction=performance.now();if(pin)pinned=true;updateViewPause();}
controls.addEventListener('start',()=>{dragging=true;stopTour(editing);});
controls.addEventListener('end',()=>{dragging=false;lastInteraction=performance.now();});
viewport.addEventListener('wheel',()=>{stopTour(editing);},{passive:true});
viewport.addEventListener('pointerdown',()=>viewport.focus());
document.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;
  if(e.code==='Space'){e.preventDefault();toggleTour();}
  if(e.key.toLowerCase()==='r')resetView();
});
motionQuery.addEventListener('change',()=>{if(motionQuery.matches)stopTour(true);});
function resize(){
  const w=viewport.clientWidth,h=viewport.clientHeight,aspect=w/h;
  const height=Math.max(19.5,19.5/aspect);
  camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;
  camera.updateProjectionMatrix();renderer.setSize(w,h);
}
new ResizeObserver(resize).observe(viewport);
applyShot(shots[0]);controls.update();resize();

// Merge static meshes by material to keep the dense miniature inexpensive to draw.
function optimizeModel(root){
  root.updateMatrixWorld(true);const buckets=new Map();
  root.traverse(o=>{
    if(!o.isMesh||Array.isArray(o.material)||o.isSkinnedMesh)return;
    const key=o.material.uuid;
    if(!buckets.has(key))buckets.set(key,{material:o.material,geometries:[],objects:[]});
    const g=o.geometry.clone().applyMatrix4(o.matrixWorld);
    // Exported meshes may have optional UV/color attributes; only retain common shading data.
    if(!g.getAttribute('normal'))g.computeVertexNormals();
    for(const a of Object.keys(g.attributes))if(!['position','normal','uv'].includes(a))g.deleteAttribute(a);
    if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
    const b=buckets.get(key);b.geometries.push(g);b.objects.push(o);
  });
  const group=new THREE.Group();group.name='Narukami';
  for(const {material,geometries} of buckets.values()){
    if(material.name==='08 layered weathered stone')finishStone(material);
    if(/Foliage|Velvet moss|Cherry petals/.test(material.name)){
      material.side=THREE.DoubleSide;
      material.emissive.copy(material.color);material.emissiveIntensity=.10;
    }
    const geometry=mergeGeometries(geometries,false);
    if(!geometry)throw new Error('场景网格合并失败');
    const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;
    mesh.castShadow=!/water|glow|emissive/i.test(material.name);mesh.receiveShadow=true;
    if(material.emissive&&material.emissive.getHex()!==0&&!/Sacred glow|Foliage|Velvet moss|Cherry petals/.test(material.name))material.emissiveIntensity=.7;
    group.add(mesh);for(const g of geometries)g.dispose();
  }
  return group;
}
const loader=new GLTFLoader();probe?.trackLoader(loader);
const perfRun=probe?new URLSearchParams(location.search).get('perfRun'):null;
loadModel(loader,'./assets/scene.glb'+(perfRun?'?perfRun='+encodeURIComponent(perfRun):''),gltf=>{
  probe?.recordGeometry('decoded',gltf.scene);probe?.mark('mergeStart');
  const model=optimizeModel(gltf.scene);probe?.mark('mergeEnd');probe?.recordGeometry('merged',model);
  scene.add(model);atmosphere.attachChannels(model);
  viewport.dataset.waterSurfaces=String(water.attach(model));
  ready=true;document.querySelector('#loading').classList.add('loaded');
  setTimeout(()=>document.querySelector('#loading').hidden=true,850);
  // Kept as a DOM status for accessibility and smoke checks, not a visible overlay.
  viewport.dataset.ready='true';viewport.dataset.meshes=String(model.children.length);
  probe?.mark('ready');document.querySelector('#view-pause').disabled=false;document.querySelector('#view-reset').disabled=false;
},event=>{
  document.querySelector('#load-progress').textContent=event.total?`正在布置景观 · ${Math.round(event.loaded/event.total*100)}%`:'正在布置景观';
},error=>{
  console.error(error);const loading=document.querySelector('#loading');loading.classList.add('failed');
  loading.querySelector('p').textContent='景观未能载入，请刷新重试';document.querySelector('#load-progress').textContent='请确认网络连接正常。';document.querySelector('#retry').hidden=false;
});

// Deterministic petals: the same scene time gives the same animation.
let seed=7401;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const petalShape=new THREE.Shape();petalShape.moveTo(0,-.08);petalShape.bezierCurveTo(-.1,-.01,-.07,.1,0,.07);petalShape.bezierCurveTo(.07,.1,.1,-.01,0,-.08);
const petals=new THREE.InstancedMesh(new THREE.ShapeGeometry(petalShape),new THREE.MeshStandardMaterial({color:'#ffb8d9',roughness:.8,side:THREE.DoubleSide}),160);
const particles=Array.from({length:160},()=>({x:rand()*12-6,y:rand()*12,z:rand()*12-6,s:.4+rand()*.6,phase:rand()*Math.PI*2}));
const dummy=new THREE.Object3D();petals.frustumCulled=false;scene.add(petals);
const verification=verifying?createVerification(s=>{stopTour(true);controls.enableDamping=false;applyShot(s);controls.update();controls.enableDamping=true;},enabled=>water.setVerificationMarker(enabled),enabled=>water.setVerificationSolid(enabled)):null;
probe?.bindCamera(s=>{stopTour(true);controls.enableDamping=false;applyShot(s);controls.update();controls.enableDamping=true;});
const clock=new THREE.Clock();let elapsed=0;
renderer.setAnimationLoop(()=>{
  const dt=Math.min(clock.getDelta(),.05);if(document.hidden)return;
  probe?.frameStart(ready);
  if(verification)elapsed=verification.time;else if(!motionQuery.matches)elapsed+=dt;
  if(ready){
    if(mode==='manual'&&!pinned&&!dragging&&performance.now()-lastInteraction>9000)startTour();
    if(mode==='auto'){
      if(blend){blend.time+=dt;applyShot(mixShot(blend.from,shots[0],Math.min(blend.time/2.8,1)));if(blend.time>=2.8)blend=null;}
      else{tourTime+=dt;applyShot(sampleTour(shots,tourTime));}
    }else controls.update();
    particles.forEach((p,i)=>{
      dummy.position.set(p.x+Math.sin(elapsed*.16+p.phase)*1.1,((p.y-elapsed*p.s*.45)%11+11)%11,p.z+Math.cos(elapsed*.2+p.phase)*.5);
      dummy.rotation.set(elapsed*.6+p.phase,elapsed*.35+p.phase,elapsed*.3+p.phase);dummy.scale.setScalar(p.s);dummy.updateMatrix();petals.setMatrixAt(i,dummy.matrix);
    });petals.instanceMatrix.needsUpdate=true;
    atmosphere.update(elapsed);sacredLight.intensity=3.6+Math.sin(elapsed*.8)*.35;
  }
  water.render(scene,effects,camera,controls.target,elapsed);viewport.dataset.mode=mode;
  if(verification){viewport.dataset.time=elapsed.toFixed(2);viewport.dataset.azimuth=((currentShot().azimuth+Math.PI*2)%(Math.PI*2)).toFixed(4);}
  viewport.dataset.elevation=currentShot().elevation.toFixed(3);
  viewport.dataset.zoom=camera.zoom.toFixed(3);viewport.dataset.backgroundFov=backgroundFov(camera.zoom).toFixed(3);
  probe?.frameEnd(ready);
});

const status=document.querySelector('#route-status');
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(shots));status.textContent='已保存到当前浏览器';}catch{status.textContent='无法本地保存，请导出路线。';}}
function showShots(){
  const list=document.querySelector('#shots');list.replaceChildren();
  shots.forEach((shot,i)=>{
    const li=document.createElement('li'),name=document.createElement('button');name.className='shot-name';name.textContent=`${String(i+1).padStart(2,'0')} · ${shot.name}`;
    name.onclick=()=>{stopTour(true);controls.enableDamping=false;applyShot(shot);controls.update();controls.enableDamping=true;};
    const remove=document.createElement('button');remove.className='remove';remove.textContent='×';remove.setAttribute('aria-label',`删除${shot.name}`);remove.disabled=shots.length<=2;remove.onclick=()=>{stopTour(true);shots.splice(i,1);save();showShots();};
    const label=document.createElement('label');label.textContent='前往下一镜头';const input=document.createElement('input');input.type='number';input.min=2;input.max=60;input.value=shot.duration;input.setAttribute('aria-label',`${shot.name}时长`);input.onchange=()=>{const n=Number(input.value);shot.duration=Number.isFinite(n)?Math.max(2,Math.min(60,n)):8;input.value=shot.duration;save();};label.append(input,'秒');
    input.addEventListener('input',()=>{const n=Number(input.value);if(input.value!==''&&Number.isFinite(n)&&n>=2&&n<=60){shot.duration=n;save();}});
    li.append(name,remove,label);list.append(li);
  });
}
document.querySelector('#capture').onclick=()=>{if(shots.length>=30){status.textContent='最多记录 30 个镜头';return;}stopTour(true);shots.push(currentShot());save();showShots();};
document.querySelector('#play').onclick=()=>{if(mode==='auto'){stopTour(true);status.textContent='巡游已暂停';}else{startTour();status.textContent='正在预览 · 拖拽即可接管镜头';}};
document.querySelector('#reset').onclick=()=>{stopTour(true);shots=structuredClone(DEFAULT_SHOTS);save();showShots();applyShot(shots[0]);controls.update();};
document.querySelector('#export').onclick=()=>{const blob=new Blob([JSON.stringify(shots,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='narukami-camera-route.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.querySelector('#import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;shots=validateShots(JSON.parse(await file.text()));stopTour(true);save();showShots();applyShot(shots[0]);controls.update();}catch(err){status.textContent=err.message;}e.target.value='';};
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY&&e.newValue){try{shots=validateShots(JSON.parse(e.newValue));showShots();if(mode==='auto')startTour();}catch{}}});
showShots();

// Share-page controls reuse the keyboard's camera and tour behavior.
function updateViewPause(){
  document.querySelector('#view-pause').textContent=mode==='auto'?'暂停巡游':'继续巡游';
}
function toggleTour(){mode==='auto'?stopTour(true):startTour();}
function resetView(){
  stopTour(editing||motionQuery.matches);controls.enableDamping=false;
  applyShot(shots[0]);controls.update();controls.enableDamping=true;
}
const viewTools=document.querySelector('#view-tools'),viewMenu=document.querySelector('#view-menu'),viewActions=document.querySelector('#view-actions');
viewTools.hidden=editing||verifying;
function closeViewMenu(){viewActions.hidden=true;viewMenu.setAttribute('aria-expanded','false');}
viewMenu.onclick=()=>{viewActions.hidden=!viewActions.hidden;viewMenu.setAttribute('aria-expanded',String(!viewActions.hidden));};
document.querySelector('#view-pause').onclick=toggleTour;
document.querySelector('#view-reset').onclick=()=>{resetView();closeViewMenu();viewport.focus();};
document.querySelector('#retry').onclick=()=>location.reload();
document.addEventListener('pointerdown',e=>{if(!viewTools.contains(e.target))closeViewMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!viewActions.hidden){closeViewMenu();viewMenu.focus();}});
updateViewPause();
