import * as THREE from 'three';
import {skyShader} from './sky.js';

// Remote scenery changes apparent size more slowly than the miniature.
export function backgroundFov(zoom){
  return 2*Math.atan(Math.tan(68*Math.PI/360)/Math.pow(zoom,.32))*180/Math.PI;
}

export function createEnvironment(renderer){
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(68,1,.1,300),screenCamera=new THREE.Camera();
  const texture=new THREE.TextureLoader().load('./assets/inazuma-panorama11.png');
  texture.colorSpace=THREE.SRGBColorSpace;
  const cloudCap=new THREE.TextureLoader().load('./assets/inazuma-cloud-cap14.png');
  cloudCap.colorSpace=THREE.SRGBColorSpace;
  const seamBridge=new THREE.TextureLoader().load('./assets/inazuma-seam14.png');
  seamBridge.colorSpace=THREE.SRGBColorSpace;
  const uniforms={panorama:{value:texture},cloudCap:{value:cloudCap},seamBridge:{value:seamBridge},inverseProjection:{value:camera.projectionMatrixInverse},cameraWorld:{value:camera.matrixWorld}};
  const sky=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
    uniforms,depthWrite:false,depthTest:false,
    vertexShader:`uniform mat4 inverseProjection,cameraWorld;varying vec3 skyRay;
      void main(){vec4 ray=inverseProjection*vec4(position.xy,1.0,1.0);
        skyRay=(cameraWorld*vec4(ray.xyz,0.0)).xyz;gl_Position=vec4(position.xy,0.0,1.0);}`,
    fragmentShader:skyShader+`varying vec3 skyRay;
      void main(){gl_FragColor=vec4(sky(skyRay),1.0);
        #include <colorspace_fragment>
      }`
  }));
  sky.frustumCulled=false;scene.add(sky);
  const size=new THREE.Vector2(),direction=new THREE.Vector3();renderer.autoClear=false;
  return {
    panorama:texture,
    cloudCap,
    seamBridge,
    render(mainCamera,target){
      renderer.getSize(size);camera.aspect=size.x/size.y;
      camera.fov=backgroundFov(mainCamera.zoom);camera.updateProjectionMatrix();
      direction.copy(mainCamera.position).sub(target).normalize();
      camera.position.set(direction.x*7,9+direction.y*1.5,direction.z*7);
      camera.lookAt(0,9,0);camera.updateMatrixWorld();
      renderer.clear();renderer.render(scene,screenCamera);renderer.clearDepth();
    }
  };
}
