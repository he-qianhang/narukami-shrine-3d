// Shared distant scenery for the background and water reflections. Sample the
// panorama from the ray, never from a sphere's interpolated, singular UVs.
export const skyShader=`
uniform sampler2D panorama;
uniform sampler2D cloudCap;
uniform sampler2D seamBridge;
float skyHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float skyNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(skyHash(i),skyHash(i+vec3(1,0,0)),f.x),
                 mix(skyHash(i+vec3(0,1,0)),skyHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(skyHash(i+vec3(0,0,1)),skyHash(i+vec3(1,0,1)),f.x),
                 mix(skyHash(i+vec3(0,1,1)),skyHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 sky(vec3 direction){
  vec3 d=normalize(direction);
  vec2 raw=vec2(atan(d.z,-d.x)/6.2831853+.685,asin(clamp(d.y,-1.0,1.0))/3.14159265+.5);
  vec2 dx=dFdx(raw),dy=dFdy(raw);
  // Derivatives must also cross the angular seam continuously, or a one-pixel
  // seam can sample the smallest/darkest mip even when its colors match.
  dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
  float u=fract(raw.x);
  vec3 a=textureGrad(panorama,vec2(u,raw.y),dx,dy).rgb;
  // The repaired wrap lies at the center of the half-rotated texture. Only
  // this cloud strip is used, so distant architecture keeps its original pixels.
  float joint=u>.5?u-1.0:u;
  vec3 bridge=textureGrad(seamBridge,vec2(joint+.5,raw.y),dx,dy).rgb;
  vec3 picture=mix(a,bridge,1.0-smoothstep(.018,.065,abs(joint)));
  // The lower cap uses a painted cloud ocean with a nonsingular stereographic
  // projection. Texture colors follow the panorama's sRGB-to-linear path.
  vec2 capUv=.5+d.xz/(1.0+abs(d.y))*.75;
  vec3 lower=texture(cloudCap,capUv).rgb;
  float shadow=1.0-smoothstep(.25,.55,dot(lower,vec3(.2126,.7152,.0722)));
  lower+=vec3(.045,.032,.024)*shadow;
  float boundary=(skyNoise(d*14.0+vec3(3,7,2))-.5)*.075;
  float cloud=.58*skyNoise(d*5.5+vec3(3,7,2))+.29*skyNoise(d*11.3+vec3(7,2,5))+.13*skyNoise(d*23.1);
  vec3 clear=mix(vec3(.38,.30,.55),vec3(.55,.49,.69),smoothstep(-.8,.8,d.y));
  vec3 cap=mix(clear,vec3(.91,.65,.62),smoothstep(.28,.69,cloud)*.73);
  if(d.y<0.0)return mix(picture,lower,smoothstep(.42,.56,-d.y+boundary));
  return mix(picture,cap,smoothstep(.57,.88,d.y));
}
`;
