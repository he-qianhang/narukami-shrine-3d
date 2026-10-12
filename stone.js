// Shared world-space strata: no seams between the cliff and embedded boulders.
export function finishStone(material){
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 stonePoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nstonePoint=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=`varying vec3 stonePoint;
      float stoneHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float stoneNoise(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(stoneHash(i),stoneHash(i+vec3(1,0,0)),f.x),
          mix(stoneHash(i+vec3(0,1,0)),stoneHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(stoneHash(i+vec3(0,0,1)),stoneHash(i+vec3(1,0,1)),f.x),
          mix(stoneHash(i+vec3(0,1,1)),stoneHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float stoneRelief(vec3 p){
        float layer=stoneNoise(p*vec3(2.2,12.0,2.2)+stoneNoise(p*2.0)*1.7);
        return stoneNoise(p*14.0)*.004+stoneNoise(p*4.0)*.012+layer*.008;
      }
      float wetChannel(vec2 p,vec2 a,vec2 b,float wa,float wb){
        float t=clamp(dot(p-a,b-a)/dot(b-a,b-a),0.0,1.0);
        float d=length(p-mix(a,b,t)),w=mix(wa,wb,t)*.82;
        return 1.0-smoothstep(w-.04,w+.16,d);
      }
      float springWetness(vec3 p){
        float wet=max(wetChannel(p.xz,vec2(3.90,-1.68),vec2(3.96,-1.34),.10,.48),
                      wetChannel(p.xz,vec2(3.96,-1.34),vec2(4.04,-.75),.48,.65));
        wet=max(wet,wetChannel(p.xz,vec2(4.04,-.75),vec2(4.10,-.13),.65,.72));
        return wet*smoothstep(4.05,4.30,p.y)*(1.0-smoothstep(4.50,4.64,p.y));
      }
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float mineral=stoneNoise(stonePoint*2.4);
      float seams=smoothstep(.57,.79,stoneNoise(stonePoint*vec3(2.2,12.0,2.2)+stoneNoise(stonePoint*2.0)*1.7));
      diffuseColor.rgb*=.91+mineral*.18-seams*.09;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.07,1.02,.94),mineral*.45);
      float wet=springWetness(stonePoint);
      diffuseColor.rgb*=1.0-wet*.13;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.68,wet);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
      vec3 sx=cross(dy,normal),sy=cross(normal,dx);
      float det=dot(dx,sx),height=stoneRelief(stonePoint);
      vec3 grad=sign(det)*(dFdx(height)*sx+dFdy(height)*sy);
      normal=normalize(abs(det)*normal-grad);`);
  };
  material.customProgramCacheKey=()=> 'weathered-stone09';
}
