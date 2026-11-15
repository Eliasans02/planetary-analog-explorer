import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PlanetRecord, PlanetDrop, PlanetTexture } from '@shared/types/planet-catalog';
import type { SurfaceRecord } from '@shared/types/surface-catalog';
import { loadPlanetTexture } from '../data/planetCatalog';
import { latestResource } from '../terrain/latestResource';
import { fetchVerifiedAsset } from '../terrain/heightfield';
import { latLonToPoint, pointToLatLon, planetGeometryData } from '../terrain/planetGeometry';
import { createGlobeAppearance, type GlobeDisplayMode } from '../terrain/globeAppearance';
import './PlanetViewport.css';
export type PlanetView = { azimuth: number; polar: number; distance: number; fitDistance?: number };
export interface PlanetViewportProps { planet: PlanetRecord; surfaces: SurfaceRecord[]; resolution: PlanetTexture['label']; onDrop: (drop: PlanetDrop)=>void; onSelect?: (site:SurfaceRecord)=>void; selectedSiteId?:string; onError?: (message:string)=>void; syncView?: PlanetView; onViewChange?: (view:PlanetView)=>void; focusRequest?: {surfaceId:string;revision:number} }
export function PlanetViewport({ planet, surfaces, resolution, onDrop, onSelect, selectedSiteId, onError, syncView, onViewChange, focusRequest }: PlanetViewportProps) {
  const host=useRef<HTMLDivElement>(null), callbacks=useRef({onDrop,onSelect,onError,onViewChange}), applyView=useRef<((v:PlanetView)=>void)|null>(null);
  const highlightSite=useRef<((id?:string)=>void)|null>(null), selectedSite=useRef(selectedSiteId); selectedSite.current=selectedSiteId;
  useEffect(()=>{highlightSite.current?.(selectedSiteId);},[selectedSiteId]);
  const focusSite=useRef<((id:string)=>void)|null>(null), requestedFocus=useRef(focusRequest);
  requestedFocus.current=focusRequest;
  callbacks.current={onDrop,onSelect,onError,onViewChange};
  const latestView=useRef(syncView); latestView.current=syncView;
  const requestedResolution=useRef(resolution); requestedResolution.current=resolution;
  const textureRequest=useRef<((level:typeof resolution)=>void)|null>(null);
  const [displayMode,setDisplayMode]=useState<GlobeDisplayMode>('relief');
  const [lightAngle,setLightAngle]=useState(-50);
  const displaySettings=useRef({displayMode,lightAngle}); displaySettings.current={displayMode,lightAngle};
  const updateDisplay=useRef<(()=>void)|null>(null);
  useEffect(()=>{updateDisplay.current?.();},[displayMode,lightAngle]);
  const [mapState,setMapState]=useState<{current?:typeof resolution; loading?:typeof resolution; error?:string}>({loading:resolution});
  const [status,setStatus]=useState('Loading verified global terrain...');
  useEffect(()=> { if(syncView) applyView.current?.(syncView); },[syncView]);
  useEffect(()=> { if(focusRequest) focusSite.current?.(focusRequest.surfaceId); },[focusRequest]);
  useEffect(()=> { textureRequest.current?.(resolution); },[resolution]);
  useEffect(()=> {
    const container=host.current; if(!container) return;
    const abort=new AbortController(); let disposed=false, frame=0, flight=0, renderer:THREE.WebGLRenderer|undefined, controls:OrbitControls|undefined, observer:ResizeObserver|undefined;
    const geometries:THREE.BufferGeometry[]=[], materials:THREE.Material[]=[]; let removeEvents=()=>{};
    let releaseMaps=()=>{};
    setMapState({loading:requestedResolution.current});
    setStatus('Loading verified global terrain...');
    void (async()=> { try {
      let dem:Parameters<typeof planetGeometryData>[0];
      if(planet.displacement) { const d=planet.displacement; const bytes=await fetchVerifiedAsset(d.asset,abort.signal,64*1024*1024); const view=new DataView(bytes); const heights=new Float32Array(bytes.byteLength/4); for(let i=0;i<heights.length;i++) heights[i]=view.getFloat32(i*4,true); dem={heights,width:d.width,height:d.height,radius_m:d.radius_m}; }
      if(disposed)return;
      const scene=new THREE.Scene(); scene.background=new THREE.Color('#040b13');
      const camera=new THREE.PerspectiveCamera(38,1,.01,30); camera.position.set(2.8,1.2,2.8);
      renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'}); renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5)); renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none'; renderer.domElement.setAttribute('aria-label',`${planet.name} source map on a ${planet.displacement?'DEM-displaced globe':'spherical globe without terrain elevation'}. Drag to orbit 360 degrees; scroll to zoom. Bright site markers select prepared native terrain.`); renderer.domElement.tabIndex=0; container.appendChild(renderer.domElement);
      const invalidate=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(()=>{frame=0;if(renderer&&!disposed)renderer.render(scene,camera);});};
      const data=planetGeometryData(dem), geometry=new THREE.BufferGeometry(); geometries.push(geometry); geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3)); geometry.setAttribute('uv',new THREE.BufferAttribute(data.uv,2)); geometry.setIndex(new THREE.BufferAttribute(data.indices,1)); geometry.computeVertexNormals();
      const appearance=createGlobeAppearance(); materials.push(appearance.reliefMaterial,appearance.sourceMaterial);
      const globe=new THREE.Mesh(geometry,appearance.material(displaySettings.current.displayMode)); scene.add(globe,appearance.fill,appearance.light,appearance.light.target);
      updateDisplay.current=()=>{globe.material=appearance.material(displaySettings.current.displayMode);appearance.updateLight(camera,displaySettings.current.lightAngle);invalidate();};
      updateDisplay.current();
      const maps=latestResource<typeof resolution,{bitmap:ImageBitmap;texture:THREE.Texture}>({
        load:async(level,signal)=>{
          const source=planet.textures.find(t=>t.label===level);
          if(!source)throw new Error(`The ${level} source map is unavailable.`);
          const bitmap=await loadPlanetTexture(source,signal);
          try {
            const texture=new THREE.Texture(bitmap); texture.colorSpace=THREE.SRGBColorSpace; texture.needsUpdate=true; texture.flipY=false; texture.anisotropy=Math.min(4,renderer!.capabilities.getMaxAnisotropy());
            return {bitmap,texture};
          } catch(error) { bitmap.close(); throw error; }
        },
        display:({texture},level)=>{appearance.setMap(texture);setMapState({current:level});invalidate();},
        release:({texture,bitmap})=>{texture.dispose();bitmap.close();},
        loading:(level)=>setMapState(previous=>({current:previous.current,loading:level})),
        failed:(error)=>{const message=error instanceof Error?error.message:'Unable to load source map.';setMapState(previous=>({current:previous.current,error:message}));callbacks.current.onError?.(message);},
      });
      releaseMaps=()=>maps.dispose();
      textureRequest.current=(level)=>{void maps.request(level);};
      textureRequest.current(requestedResolution.current);
      const markerGeometry=new THREE.SphereGeometry(.016,16,12); geometries.push(markerGeometry);
      const outlineGeometry=new THREE.SphereGeometry(.016,16,12); geometries.push(outlineGeometry);
      const hitGeometry=new THREE.SphereGeometry(.085,12,10); geometries.push(hitGeometry);
      const markerMaterial=new THREE.MeshBasicMaterial({color:'#bae6fd'}); materials.push(markerMaterial);
      const selectedMaterial=new THREE.MeshBasicMaterial({color:'#38bdf8'}); materials.push(selectedMaterial);
      const outlineMaterial=new THREE.MeshBasicMaterial({color:'#05070b',side:THREE.BackSide}); materials.push(outlineMaterial);
      const hitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}); materials.push(hitMaterial);
      const markerEntries=surfaces.filter(s=>s.body===planet.id).map(surface=> {
        const pos=latLonToPoint(surface.coordinates.latitude_deg,surface.coordinates.longitude_deg,1.025);
        const mesh=new THREE.Mesh(markerGeometry,markerMaterial);
        mesh.position.set(...pos); mesh.userData.surface=surface;
        const outline=new THREE.Mesh(outlineGeometry,outlineMaterial);
        outline.scale.setScalar(1.42); outline.visible=false;
        mesh.add(outline);
        const hitMesh=new THREE.Mesh(hitGeometry,hitMaterial);
        hitMesh.position.set(...pos); hitMesh.userData.surface=surface;
        scene.add(mesh,hitMesh);
        return {mesh,outline,hitMesh};
      });
      const markers=markerEntries.map(e=>e.mesh);
      const hitTargets=markerEntries.map(e=>e.hitMesh);
      highlightSite.current=(id)=>{markerEntries.forEach(({mesh,outline})=>{const selected=mesh.userData.surface.id===id;mesh.material=selected?selectedMaterial:markerMaterial;mesh.scale.setScalar(selected?1.25:1);outline.visible=selected;});invalidate();};highlightSite.current(selectedSite.current);
      controls=new OrbitControls(camera,renderer.domElement); controls.enablePan=false;controls.enableDamping=false;controls.minDistance=1.15;controls.maxDistance=9;controls.minPolarAngle=.001;controls.maxPolarAngle=Math.PI-.001;
      const stopFlight=()=>{cancelAnimationFrame(flight);flight=0;};
      controls.addEventListener('start',stopFlight);
      focusSite.current=(id)=>{
        const site=surfaces.find(s=>s.id===id&&s.body===planet.id);if(!site)return;
        stopFlight();
        const start=camera.position.clone(), destination=new THREE.Vector3(...latLonToPoint(site.coordinates.latitude_deg,site.coordinates.longitude_deg,start.length()));
        if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){camera.position.copy(destination);controls?.update();invalidate();return;}
        const rotation=new THREE.Quaternion().setFromUnitVectors(start.clone().normalize(),destination.clone().normalize());
        const started=performance.now();
        const advance=(now:number)=>{
          if(disposed)return;
          const progress=Math.min(1,(now-started)/850), eased=progress*progress*(3-2*progress);
          camera.position.copy(start).applyQuaternion(new THREE.Quaternion().slerp(rotation,eased));
          controls?.update();invalidate();flight=progress<1?requestAnimationFrame(advance):0;
        };
        flight=requestAnimationFrame(advance);
      };
      let previousFit:number|undefined;
      let applying=false; const changed=()=>{appearance.updateLight(camera,displaySettings.current.lightAngle);invalidate();if(!applying&&controls)callbacks.current.onViewChange?.({azimuth:controls.getAzimuthalAngle(),polar:controls.getPolarAngle(),distance:camera.position.length(),fitDistance:previousFit});}; controls.addEventListener('change',changed);
      applyView.current=(v)=>{if(!controls)return;applying=true;camera.position.setFromSpherical(new THREE.Spherical(Math.max(1.15,v.distance*(previousFit&&v.fitDistance?previousFit/v.fitDistance:1)),Math.max(.001,Math.min(Math.PI-.001,v.polar)),v.azimuth));controls.maxDistance=Math.max(controls.maxDistance,camera.position.length());controls.update();applying=false;invalidate();}; if(latestView.current)applyView.current(latestView.current);
      const raycaster=new THREE.Raycaster(); const locate=(event:MouseEvent|DragEvent, markerOnly=false)=>{if(!renderer)return;const r=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),camera);const directHit=raycaster.intersectObjects([globe,...markers],false)[0];const hit=directHit?.object.userData.surface?directHit:raycaster.intersectObjects([globe,...hitTargets],false)[0];if(!hit)return;const site=hit.object.userData.surface as SurfaceRecord|undefined;if(site){if(markerOnly && callbacks.current.onSelect){callbacks.current.onSelect(site);return;}callbacks.current.onDrop({body:planet.id,latitude_deg:site.coordinates.latitude_deg,longitude_deg:site.coordinates.longitude_deg,surfaceId:site.id});}else if(!markerOnly){callbacks.current.onDrop({body:planet.id,...pointToLatLon(hit.point.x,hit.point.y,hit.point.z),surfaceId:null});}};
      const over=(e:DragEvent)=>{if(e.dataTransfer?.types.includes('application/x-pae-astronaut')){e.preventDefault();e.dataTransfer.dropEffect='copy';}};
      const drop=(e:DragEvent)=>{if(!e.dataTransfer?.types.includes('application/x-pae-astronaut'))return;e.preventDefault();locate(e);};
      let down:[number,number]=[0,0];const pointerdown=(e:MouseEvent)=>{down=[e.clientX,e.clientY];};const click=(e:MouseEvent)=>{if(Math.hypot(e.clientX-down[0],e.clientY-down[1])<5)locate(e,true);};
      const lost=(e:Event)=>{e.preventDefault();setStatus('Graphics context interrupted. Choose another view to reload.');};
      const canvas=renderer.domElement;canvas.addEventListener('dragover',over);canvas.addEventListener('drop',drop);canvas.addEventListener('pointerdown',pointerdown);canvas.addEventListener('click',click);canvas.addEventListener('webglcontextlost',lost);
      removeEvents=()=>{canvas.removeEventListener('dragover',over);canvas.removeEventListener('drop',drop);canvas.removeEventListener('pointerdown',pointerdown);canvas.removeEventListener('click',click);canvas.removeEventListener('webglcontextlost',lost);};
      const size=()=>{
        if(!renderer||disposed)return;
        const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);
        renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
        const halfFov=THREE.MathUtils.degToRad(camera.fov/2);
        const fit=1.03/Math.sin(Math.atan(Math.tan(halfFov)*Math.min(camera.aspect,1)))*1.12;
        if(previousFit!==undefined)camera.position.multiplyScalar(fit/previousFit);
        else if(latestView.current?.fitDistance)camera.position.multiplyScalar(fit/latestView.current.fitDistance);
        else if(!latestView.current)camera.position.normalize().multiplyScalar(fit);
        controls!.maxDistance=Math.max(9,fit*1.5,camera.position.length());
        previousFit=fit;controls!.update();invalidate();
      };observer=new ResizeObserver(size);observer.observe(container);size();if(requestedFocus.current)focusSite.current(requestedFocus.current.surfaceId);setStatus('');
    } catch(error){if(!disposed){const message=error instanceof Error?error.message:'Unable to load source globe.';setStatus(message);callbacks.current.onError?.(message);}} })();
    return()=>{disposed=true;abort.abort();if(frame)cancelAnimationFrame(frame);cancelAnimationFrame(flight);applyView.current=null;focusSite.current=null;highlightSite.current=null;textureRequest.current=null;updateDisplay.current=null;releaseMaps();observer?.disconnect();removeEvents();controls?.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();};
  },[planet,surfaces]);
  const sourceLabel=(level:PlanetTexture['label'])=>{const source=planet.textures.find(texture=>texture.label===level);return source?`${level} (${source.width} × ${source.height} px)`:level;};
  return <div className="planet-viewport">
    <div className="globe-display-controls" aria-label={`${planet.name} globe display`} style={status?{visibility:'hidden'}:undefined}>
      <label>Display <select value={displayMode} onChange={event=>setDisplayMode(event.target.value as GlobeDisplayMode)}>
        <option value="relief">Color + shape</option><option value="source">Original image</option>
      </select></label>
      {displayMode==='relief' && <label>Display light <input aria-label={`${planet.name} display light direction`} type="range" min={-120} max={120} step={5} value={lightAngle} onChange={event=>setLightAngle(Number(event.target.value))}/></label>}
      <small>{displayMode==='source'?'Unlit source colors.':planet.displacement?'Neutral display lighting · DEM terrain relief':'Neutral display lighting · sphere only, no elevation data'}</small>
    </div>
    <div ref={host} className="globe-canvas-host"/>
      <div role="status" className="globe-map-status" style={status?{visibility:'hidden'}:undefined}>
        {mapState.current ? `Showing ${planet.name} ${sourceLabel(mapState.current)} verified map.` : `No verified ${planet.name} map displayed.`}
        {mapState.loading && ` Loading ${sourceLabel(mapState.loading)}…`}
        {mapState.error && <> {mapState.error} <button type="button" onClick={()=>textureRequest.current?.(resolution)}>Retry {sourceLabel(resolution)}</button></>}
      </div>
    {status && <div role="status" style={{position:'absolute',inset:0,display:'grid',placeItems:'center',padding:24,color:'#d7e8e8',background:'#040b13'}}>{status}</div>}
  </div>;
}
