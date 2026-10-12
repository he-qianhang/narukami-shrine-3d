import * as THREE from 'three';
import {skyShader} from './sky.js';

const vertex=`
uniform float time;
varying vec3 worldPoint; varying vec3 surfaceNormal; varying vec2 flowUv;
void main(){
  vec4 p=modelMatrix*vec4(position,1.0);
  // Blender glTF flips V. Restore travel time before every moving pattern.
  flowUv=vec2(uv.x,1.0-uv.y);
  #ifdef CONNECTED_FLOW
    float moving=.003*sin(flowUv.y*9.0-time*5.0+uv.x*19.0)+.002*sin(flowUv.y*17.0-time*8.0-uv.x*31.0);
    p.xyz+=normalize(mat3(modelMatrix)*normal)*moving*sin(uv.x*3.14159265)*smoothstep(.5,.85,p.y);
  #endif
  worldPoint=p.xyz;surfaceNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*p;
}`;
const common=skyShader+`
uniform sampler2D sceneColor,sceneDepth;
uniform vec2 resolution; uniform float time,nearPlane,farPlane,verifyFlow,verifySolid;
uniform vec3 eyeDirection;
varying vec3 worldPoint; varying vec3 surfaceNormal; varying vec2 flowUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.03+7.1)+.15*noise(p*4.07+19.3);}
vec3 refractScene(vec2 screen,vec2 offset,float depth){
  vec2 bent=clamp(screen+offset,vec2(.001),vec2(.999));
  // Do not pull foreground bridge/rock pixels into the water's silhouette.
  if(texture2D(sceneDepth,bent).r<depth-.00002)bent=screen;
  return texture2D(sceneColor,bent).rgb;
}
vec3 shadeWater(vec2 screen,vec3 n,float thickness,vec2 distortion){
  vec3 beneath=refractScene(screen,distortion,gl_FragCoord.z);
  vec3 transmission=exp(-vec3(5.0,1.4,1.0)*thickness);
  vec3 water=beneath*transmission+vec3(.025,.21,.20)*(1.0-transmission);
  water=mix(water,vec3(.055,.29,.31),.16);
  float fresnel=.025+.78*pow(1.0-max(0.0,dot(n,eyeDirection)),5.0);
  water=mix(water,sky(reflect(-eyeDirection,n)),fresnel);
  vec3 sun=normalize(vec3(-7.0,17.0,10.0));
  float highlight=pow(max(0.0,dot(reflect(-sun,n),eyeDirection)),110.0);
  return water+vec3(1.0,.87,.69)*highlight*.65;
}
`;
const poolFragment=common+`
float waves(vec2 q){
  return fbm(q*4.0-vec2(time*.09,time*.18))*.013+
         fbm(q*13.0+vec2(time*.07,-time*.15))*.004;
}
void main(){
  vec2 screen=gl_FragCoord.xy/resolution;vec2 q=worldPoint.xz;
  float e=.018,h=waves(q);
  vec2 slope=vec2(waves(q+vec2(e,0))-h,waves(q+vec2(0,e))-h)/e;
  vec3 n=normalize(surfaceNormal+vec3(-slope.x,0.0,-slope.y));
  if(dot(n,eyeDirection)<0.0)n=-n;
  float depth=texture2D(sceneDepth,screen).r;
  float thickness=max(0.0,(depth-gl_FragCoord.z)*(farPlane-nearPlane));
  thickness=min(thickness,.8);
  vec3 water=shadeWater(screen,n,thickness,slope*.012);
  float current=fbm(q*17.0-vec2(time*.12,time*.65));
  float bank=(1.0-smoothstep(.012,.055,thickness))*smoothstep(.49,.72,current);
  float r=length((q-vec2(4.20,1.12))*vec2(1.0,1.6));
  float impact=exp(-r*r*3.4)*smoothstep(.42,.69,current)*.62;
  float spring=step(worldPoint.y,1.0);
  float foam=clamp(bank*.30+impact*spring,0.0,.65);
  water=mix(water,vec3(.76,.88,.86),foam);
  gl_FragColor=vec4(water,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const connectedFragment=common+`
void main(){
  vec2 screen=gl_FragCoord.xy/resolution;
  // Travel time is continuous across the pool, curved lip and falling body.
  // Equal texture motion becomes faster in world space as the water descends.
  vec2 q=vec2(flowUv.x*14.0,flowUv.y*3.6-time*.95);
  float body=fbm(q+vec2(noise(q*.3)*.7,0));
  float fine=fbm(vec2(flowUv.x*34.0,flowUv.y*9.0-time*2.375));
  vec3 across=vec3(.82,0.0,-.57);
  vec3 tangent=normalize(cross(surfaceNormal,across));
  vec3 n=normalize(surfaceNormal+across*(body-.5)*.11+tangent*(fine-.5)*.055);
  if(dot(n,eyeDirection)<0.0)n=-n;
  float steep=smoothstep(.12,.70,1.0-abs(surfaceNormal.y));
  float depth=texture2D(sceneDepth,screen).r;
  float poolThickness=clamp((depth-gl_FragCoord.z)*(farPlane-nearPlane),0.0,.45);
  float thickness=mix(poolThickness,.055,steep);
  vec3 water=shadeWater(screen,n,thickness,vec2(body-.5,fine-.5)*.0035);
  float aeration=smoothstep(.42,.73,body)*.72+smoothstep(.64,.82,fine)*.10;
  float develop=smoothstep(.015,.85,4.48-worldPoint.y);
  float foam=aeration*(.025+steep*develop*.78);
  water=mix(water,vec3(.76,.88,.86),foam);
  vec3 solid=vec3(.13,.39,.47)*(.45+.75*max(0.0,dot(normalize(surfaceNormal),normalize(vec3(-.4,.6,.7)))));
  water=mix(water,solid,verifySolid);
  // A single tracer is available only on the verification page. Its position
  // uses the same travel coordinate and speed as the visible flow patterns.
  float tracer=1.0-smoothstep(.025,.065,abs(flowUv.y-(1.0+time*.95/3.6)));
  water=mix(water,vec3(1.0,.06,.01),tracer*verifyFlow);
  // Lower pool depth occludes the submerged tail; no transparent layers stack.
  gl_FragColor=vec4(water,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createWater(renderer,environment){
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
  target.samples=Math.min(4,renderer.capabilities.maxSamples);
  target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const waterScene=new THREE.Scene(),copyScene=new THREE.Scene(),copyCamera=new THREE.Camera();
  const copyMaterial=new THREE.ShaderMaterial({
    uniforms:{color:{value:target.texture},depth:{value:target.depthTexture}},
    vertexShader:'varying vec2 screen;void main(){screen=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`uniform sampler2D color,depth;varying vec2 screen;
      void main(){gl_FragColor=texture2D(color,screen);gl_FragDepth=texture2D(depth,screen).r;
        if(gl_FragDepth<.999999){
          #include <tonemapping_fragment>
        }
        #include <colorspace_fragment>
      }`,depthTest:true,depthWrite:true,depthFunc:THREE.AlwaysDepth});
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),copyMaterial);quad.frustumCulled=false;copyScene.add(quad);
  const uniforms={sceneColor:{value:target.texture},sceneDepth:{value:target.depthTexture},panorama:{value:environment.panorama},cloudCap:{value:environment.cloudCap},seamBridge:{value:environment.seamBridge},
    resolution:{value:new THREE.Vector2()},time:{value:0},verifyFlow:{value:0},verifySolid:{value:0},nearPlane:{value:.1},farPlane:{value:150},eyeDirection:{value:new THREE.Vector3()}};
  const pool=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:poolFragment,side:THREE.DoubleSide});
  const fall=new THREE.ShaderMaterial({uniforms,defines:{CONNECTED_FLOW:1},vertexShader:vertex,fragmentShader:connectedFragment,side:THREE.FrontSide});
  function attach(model){
    const surfaces=[];model.traverse(o=>{if(o.isMesh&&/^Water(?:07|09) /.test(o.material.name))surfaces.push(o);});
    for(const o of surfaces){
      o.material.dispose();o.material=/falling|connected/.test(o.name)?fall:pool;
      o.castShadow=false;o.receiveShadow=false;o.renderOrder=o.material===fall?2:1;waterScene.add(o);
    }
    return surfaces.length;
  }
  function render(scene,effects,camera,lookAt,time){
    renderer.getDrawingBufferSize(uniforms.resolution.value);
    const {x:w,y:h}=uniforms.resolution.value;
    if(target.width!==w||target.height!==h)target.setSize(w,h);
    uniforms.time.value=time;uniforms.nearPlane.value=camera.near;uniforms.farPlane.value=camera.far;
    uniforms.eyeDirection.value.copy(camera.position).sub(lookAt).normalize();
    renderer.setRenderTarget(target);environment.render(camera,lookAt);renderer.render(scene,camera);
    // Copy opaque color AND depth: dense scenery is drawn once, then only water/effects are composited.
    renderer.setRenderTarget(null);renderer.clear();renderer.render(copyScene,copyCamera);renderer.render(waterScene,camera);
    renderer.render(effects,camera);
  }
  return {attach,render,setVerificationMarker(enabled){uniforms.verifyFlow.value=enabled?1:0;},setVerificationSolid(enabled){uniforms.verifySolid.value=enabled?1:0;}};
}
