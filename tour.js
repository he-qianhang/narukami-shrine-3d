// Angles in radians; elevations are measured above the horizon.
export const MIN_ELEVATION=-1.48,MAX_ELEVATION=1.48;
export const DEFAULT_SHOTS = [
  {name:'神樱全景',azimuth:.40,elevation:.44,target:[0,4.2,0],zoom:1,duration:8},
  {name:'鸟居参道',azimuth:.12,elevation:.45,target:[0,3.5,1.8],zoom:1.2,duration:7},
  {name:'山上神社',azimuth:.25,elevation:.40,target:[.9,6,-2.55],zoom:1.16,duration:8},
  {name:'溪桥落樱',azimuth:1.02,elevation:.38,target:[3.5,2.7,1.5],zoom:1.14,duration:8},
  {name:'绕山归来',azimuth:2.3,elevation:.62,target:[0,4.2,0],zoom:.95,duration:9},
  {name:'樱树背影',azimuth:4.7,elevation:.63,target:[0,4.2,0],zoom:.95,duration:8},
];
export const PREVIOUS_DEFAULT_SHOTS = [
  {name:'神樱全景',azimuth:.62,elevation:.56,target:[0,3,0],zoom:1,duration:8},
  {name:'鸟居参道',azimuth:.12,elevation:.45,target:[0,2.5,1.8],zoom:1.2,duration:7},
  {name:'山上神社',azimuth:-.3,elevation:.56,target:[1,4,-1],zoom:1.16,duration:8},
  {name:'溪桥落樱',azimuth:1.02,elevation:.5,target:[2.5,2.2,1.5],zoom:1.14,duration:8},
  {name:'绕山归来',azimuth:2.3,elevation:.62,target:[0,3,0],zoom:.95,duration:9},
  {name:'樱树背影',azimuth:4.7,elevation:.63,target:[0,3,0],zoom:.95,duration:8},
];
export const STORAGE_KEY='narukami.camera-route.v1';
export function validateShots(value){
  if(!Array.isArray(value)||value.length<2||value.length>30)throw new Error('路线需要 2–30 个镜头。');
  return value.map((s,i)=>{
    if(!s||![s.azimuth,s.elevation,s.zoom,s.duration].every(Number.isFinite)||!Array.isArray(s.target)||s.target.length!==3||!s.target.every(Number.isFinite))throw new Error(`第 ${i+1} 个镜头的数据不完整。`);
    if(s.elevation<MIN_ELEVATION||s.elevation>MAX_ELEVATION||s.zoom<.65||s.zoom>2||s.duration<2||s.duration>60||s.target.some(x=>Math.abs(x)>14))throw new Error(`第 ${i+1} 个镜头超出可用范围。`);
    return {name:String(s.name||`镜头 ${i+1}`).slice(0,40),azimuth:s.azimuth,elevation:s.elevation,zoom:s.zoom,duration:s.duration,target:[...s.target]};
  });
}
export function angleDelta(a,b){return ((b-a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;}
export function mixShot(a,b,t){
  const u=t*t*(3-2*t),lerp=(x,y)=>x+(y-x)*u;
  return {azimuth:a.azimuth+angleDelta(a.azimuth,b.azimuth)*u,elevation:lerp(a.elevation,b.elevation),zoom:lerp(a.zoom,b.zoom),target:a.target.map((x,i)=>lerp(x,b.target[i]))};
}
export function sampleTour(shots,time){
  const total=shots.reduce((sum,s)=>sum+s.duration,0);
  let t=((time%total)+total)%total;
  for(let i=0;i<shots.length;i++){
    if(t<shots[i].duration)return mixShot(shots[i],shots[(i+1)%shots.length],t/shots[i].duration);
    t-=shots[i].duration;
  }
  return shots[0];
}
