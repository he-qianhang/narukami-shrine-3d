// Local QA controls are created only with ?verify=1; the showcase stays clean.
export function createVerification(setShot,setMarker,setSolid){
  const state={time:0,shot:{azimuth:.4,elevation:.44,target:[0,4.2,0],zoom:1}};
  const pose=s=>{state.shot=s;setShot(s);angle.value=(s.azimuth*180/Math.PI).toFixed(2);elevation.value=(s.elevation*180/Math.PI).toFixed(2);zoom.value=s.zoom;};
  const panel=document.createElement('div');panel.id='verification';
  panel.style.cssText='position:fixed;left:12px;top:12px;z-index:5;padding:8px;background:#251d39e8;color:white;font:12px sans-serif;display:flex;gap:6px;flex-wrap:wrap;max-width:650px';
  function button(label,action){const b=document.createElement('button');b.textContent=label;b.onclick=action;panel.append(b);}
  const water={elevation:.18,target:[4.1,2.5,.6],zoom:2};
  for(const [name,azimuth] of [['水景正面',.61],['水景斜侧',1.3],['水景侧面',2.18]])button(name,()=>pose({...water,azimuth}));
  button('泉池衔接',()=>pose({...water,azimuth:.61,elevation:.68}));
  button('岩壁近景',()=>pose({azimuth:1.05,elevation:.30,target:[4.85,2.65,-.1],zoom:3.8}));
  button('树侧草丛',()=>pose({azimuth:-2.0,elevation:.18,target:[-3.7,3.2,-1.0],zoom:3.6}));
  button('屋顶交接',()=>pose({azimuth:0,elevation:1.10,target:[.9,8.1,-1.4],zoom:3.2}));
  button('树冠俯视',()=>pose({azimuth:.4,elevation:1.569,target:[-3.3,8.7,-1.8],zoom:3.0}));
  button('云海斜俯',()=>pose({azimuth:3.55,elevation:1.30,target:[0,4.2,0],zoom:.72}));
  for(const [name,azimuth,elevation] of [['全景',.4,.44],['俯视',.4,1.569],['仰视',.4,-1.569],['接缝',3.55,.4]])button(name,()=>pose({azimuth,elevation,target:[0,4.2,0],zoom:1}));
  const label=document.createElement('label');label.textContent='时间 ';const input=document.createElement('input');input.type='number';input.min=0;input.step=.1;input.value=0;input.style.width='56px';input.setAttribute('aria-label','验证时间');
  input.oninput=()=>{state.time=Math.max(0,Number(input.value)||0);};label.append(input);panel.append(label);
  button('下一帧',()=>{state.time=Math.round((state.time+.1)*100)/100;input.value=state.time;});
  button('流向标记',()=>{state.marker=!state.marker;setMarker(state.marker);});
  const angle=document.createElement('input');angle.type='number';angle.value=23;angle.style.width='55px';angle.setAttribute('aria-label','验证方位角');
  angle.oninput=()=>pose({...state.shot,azimuth:Number(angle.value)*Math.PI/180});panel.append('方位° ',angle);
  const elevation=document.createElement('input');elevation.type='number';elevation.value=25.2;elevation.style.width='55px';elevation.setAttribute('aria-label','验证俯角');
  elevation.oninput=()=>pose({...state.shot,elevation:Math.max(-1.569,Math.min(1.569,Number(elevation.value)*Math.PI/180))});panel.append('俯角° ',elevation);
  const zoom=document.createElement('input');zoom.type='number';zoom.min=.65;zoom.max=5;zoom.step=.1;zoom.value=1;zoom.style.width='55px';zoom.setAttribute('aria-label','验证缩放');
  zoom.oninput=()=>pose({...state.shot,zoom:Math.max(.65,Math.min(5,Number(zoom.value)||1))});panel.append('缩放 ',zoom);
  button('实体截面',()=>{state.solid=!state.solid;setSolid(state.solid);});
  document.body.append(panel);return state;
}
