import * as THREE from 'three';

// Small, depth-tested halos and spray retain the miniature's edges without full-screen bloom.
export function createAtmosphere(scene){
  const halos=[];
  function attachChannels(model){
    model.traverse(o=>{
      if(!o.isMesh||o.material.name!=='Sacred glow violet')return;
      const geometry=o.geometry.clone(),p=geometry.attributes.position,n=geometry.attributes.normal;
      for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)+n.getX(i)*.026,p.getY(i)+n.getY(i)*.026,p.getZ(i)+n.getZ(i)*.026);
      p.needsUpdate=true;geometry.computeBoundingSphere();
      const material=new THREE.MeshBasicMaterial({color:'#a46aff',transparent:true,opacity:.12,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
      const halo=new THREE.Mesh(geometry,material);halo.name='Sacred bark soft halo';scene.add(halo);halos.push(material);
    });
  }
  function particles(count,color,size,opacity){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
    const material=new THREE.ShaderMaterial({uniforms:{tint:{value:new THREE.Color(color)},pointSize:{value:size},alpha:{value:opacity}},
      vertexShader:'uniform float pointSize; void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=pointSize;}',
      fragmentShader:`uniform vec3 tint; uniform float alpha;
        void main(){
          float r=length(gl_PointCoord-.5)*2.0;if(r>1.0)discard;
          gl_FragColor=vec4(tint,exp(-r*r*5.0)*alpha);
          #include <colorspace_fragment>
        }`,
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);return geometry.attributes.position;
  }
  const motes=particles(35,'#c29aff',5,.52),mist=particles(55,'#c4eee9',9,.075);
  function update(time){
    for(const m of halos)m.opacity=.10+Math.sin(time*.8)*.025;
    for(let i=0;i<motes.count;i++){
      const a=i*2.39996+time*.08,r=.35+(i%7)*.13;
      motes.setXYZ(i,-2.55+Math.cos(a)*r,4.55+((i*.137+time*.045)%2.4),-1.65+Math.sin(a)*r*.8);
    }
    for(let i=0;i<mist.count;i++){
      const t=(i*.618034+time*.55)%1,a=i*2.39996;
      const w=Math.sin(i*17.13)*.65;
      mist.setXYZ(i,4.20+w*.82+Math.cos(a)*t*.15,.44+Math.sin(t*Math.PI)*(.08+(i%7)*.025),1.08-w*.57+t*.30);
    }
    motes.needsUpdate=true;mist.needsUpdate=true;
  }
  update(0);return {attachChannels,update};
}
