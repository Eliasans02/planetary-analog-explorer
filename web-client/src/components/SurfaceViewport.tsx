import { useEffect, useRef, useState } from 'react';
import { walkInputActive, dragLookAngles, createWalkInput, createWalkPositionPublisher } from '../terrain/walkInput';
import './SurfaceViewport.css';

import * as THREE from 'three';

import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { RotateCcw, Grid2X2 } from 'lucide-react';

import type { SurfaceCatalog, SurfaceRecord } from '@shared/types/surface-catalog';

import type { SurfaceImageryRecord, SurfaceImageryLayer } from '@shared/types/surface-imagery';
import { loadSurfaceImageryCatalog, loadSurfaceImageryLayer } from '../data/surfaceImagery';
import { getSurfaceCatalogSha256 } from '../data/surfaceCatalog';
import { latestResource } from '../terrain/latestResource';
import { surfaceImageUvs } from '../terrain/surfaceUv';
import { createSurfaceImageMaterials, setSurfaceImageTexture, surfaceLightPosition, surfaceLightIntensities, type SurfaceLighting } from '../terrain/surfaceAppearance';

import { buildSurfaceGeometryData, gridToSurface, surfaceHeightAt, terrainTriangleHeightAt, walkSurfaceStep, surfaceWalkEntry } from '../terrain/surfaceGeometry';



export interface SurfaceViewportProps {

  surface: SurfaceRecord;
  catalog?: SurfaceCatalog;
  imageryPath?: string;

  heights: Float32Array;

  validMask: Uint8Array;

  onError?: (message: string) => void;

  mode?: 'orbit' | 'walk';
  allowWalking?: boolean;

  initialGrid?: [number, number];

  onModeChange?: (mode: 'orbit' | 'walk') => void;

}

export function surfaceWalkMode(requestedMode: 'orbit' | 'walk' | undefined, allowWalking: boolean): 'orbit' | 'walk' {
  return requestedMode === 'walk' && allowWalking ? 'walk' : 'orbit';
}



const panel = { background: 'rgba(7,19,28,.84)', border: '1px solid rgba(160,191,199,.19)', backdropFilter: 'blur(12px)' };

const buttonStyle = { ...panel, color: '#d7e8e8', borderRadius: 7, padding: '8px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11 };

const metres = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`;



export function SurfaceViewport({ surface, catalog, imageryPath = '/data/surface_imagery.json', heights, validMask, onError, mode: requestedMode, allowWalking = true, initialGrid, onModeChange }: SurfaceViewportProps) {

  const [imagery, setImagery] = useState<SurfaceImageryRecord | null>(null);
  const [imageryError, setImageryError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'orbital-color' | 'local-ortho' | 'relief'>('orbital-color');
  const explicitImageChoice = useRef(false);  const choiceSurface = useRef<string | null>(null);
  const [lighting, setLighting] = useState<SurfaceLighting>('relief-light');
  const [lightDirection, setLightDirection] = useState(225);
  const appearance = useRef({ lighting, lightDirection });
  appearance.current = { lighting, lightDirection };
  const updateAppearance = useRef<(() => void) | null>(null);
  useEffect(() => { updateAppearance.current?.(); }, [lighting, lightDirection]);
  const chooseImage = (next: typeof choice) => { explicitImageChoice.current = true; setChoice(next); };
  const [imageState, setImageState] = useState<{ displayed?: SurfaceImageryLayer | 'relief'; loading?: string; error?: string }>({loading:'Orbital color'});
  const imageRequest = useRef<((layer: SurfaceImageryLayer | 'relief') => void) | null>(null);
  const imageChoice = useRef<SurfaceImageryLayer | 'relief' | undefined>(undefined);
  const desiredImage = choice === 'relief' ? 'relief' : imagery?.surface_id === surface.id ? imagery.layers.find(layer => layer.id === choice) : undefined;
  imageChoice.current = desiredImage;
  useEffect(() => { if (desiredImage) imageRequest.current?.(desiredImage); }, [desiredImage]);
  useEffect(() => {
    const c = new AbortController(); setImagery(null); setImageryError(null);
    if (choiceSurface.current !== surface.id) {      choiceSurface.current = surface.id; explicitImageChoice.current = false; setChoice('orbital-color');    }
    if (surface.body === 'earth') { setImageryError('Photographic imagery is not available for this Earth window. Relief shading is an elevation tint.'); setChoice('relief'); return; }
    if (!catalog) { setImageryError('Photographic imagery unavailable: source catalog was not supplied.'); setImageState({displayed:'relief'}); return; }
    const sha = getSurfaceCatalogSha256(catalog);
    if (!sha) { setImageryError('Photographic imagery unavailable: source catalog identity is unverified.'); setImageState({displayed:'relief'}); return; }
    loadSurfaceImageryCatalog(catalog, sha, c.signal, imageryPath).then(data => {
      const record = data.records.find(record => record.surface_id === surface.id);
      if (!record) throw new Error('No source imagery is prepared for this window.');
      setImagery(record);
      if (!explicitImageChoice.current) setChoice(record.layers.some(layer => layer.id === 'local-ortho') ? 'local-ortho' : 'orbital-color');
    }).catch(error => { if (!c.signal.aborted) { setImageryError(String(error.message ?? error)); setImageState(previous => ({displayed:previous.displayed ?? 'relief'})); } });
    return () => c.abort();
  }, [catalog, imageryPath, surface.id, surface.body]);

  const host = useRef<HTMLDivElement>(null);

  const actions = useRef<{ reset: () => void; wireframe: (value: boolean) => void; walk: () => void; orbit: () => void; engage: () => void; pause: () => void } | null>(null);

  const errorHandler = useRef(onError);

  errorHandler.current = onError;

  const [mode, setMode] = useState<'orbit' | 'walk'>('orbit');

  const modeCallback = useRef(onModeChange); modeCallback.current = onModeChange;

  useEffect(() => { if(surfaceWalkMode(requestedMode, allowWalking) === 'walk') actions.current?.walk(); else actions.current?.orbit(); }, [allowWalking, requestedMode]);

  const [wireframe, setWireframe] = useState(false);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const [error, setError] = useState('');
  const [walkPosition, setWalkPosition] = useState<{ x: number; z: number } | null>(null);
  const [walkActive, setWalkActive] = useState(false);
  const [walkStarted, setWalkStarted] = useState(false);
  const [walkHelp, setWalkHelp] = useState('WASD move | Arrows or mouse look | Escape pauses');



  useEffect(() => {

    const container = host.current;

    if (!container) return;

    let disposed = false, frame = 0;

    let renderer: THREE.WebGLRenderer | undefined;

    let controls: OrbitControls | undefined;

    let pointer: PointerLockControls | undefined;

    let resize: ResizeObserver | undefined;

    const geometries: THREE.BufferGeometry[] = [];

    const materials: THREE.Material[] = [];

    let removeEvents = () => {};
    let releaseImagery = () => {};

    setStatus('loading'); setWireframe(false); setError(''); setWalkActive(false); setWalkStarted(false);
    setImageState({ displayed: 'relief' });

    const fail = (message: string) => {

      if (disposed) return;

      setError(message); setStatus('error'); errorHandler.current?.(message);

    };

    try {

      const data = buildSurfaceGeometryData(surface.grid, heights, validMask);

      const extent = Math.max(data.extentX, data.extentZ, data.max - data.min, 1);

      const midpoint = (data.min + data.max) / 2;

      const scene = new THREE.Scene();

      scene.background = new THREE.Color('#07131c');

      const camera = new THREE.PerspectiveCamera(38, 1, extent / 1000, extent * 30);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

      renderer.outputColorSpace = THREE.SRGBColorSpace;

      renderer.toneMapping = THREE.ACESFilmicToneMapping;

      renderer.toneMappingExposure = 1.25;

      renderer.shadowMap.enabled = true;

      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';

      renderer.domElement.setAttribute('aria-label', `${surface.name}: interactive three dimensional elevation model. Drag to orbit, scroll to zoom, right drag to pan.`);

      renderer.domElement.setAttribute('role', 'region');
      renderer.domElement.setAttribute('aria-describedby', 'surface-navigation-help');

      renderer.domElement.tabIndex = 0;

      container.appendChild(renderer.domElement);

      const invalidate = () => {

        if (disposed || frame) return;

        frame = requestAnimationFrame(() => {

          frame = 0;

          if (!disposed && renderer) {

            renderer.render(scene, camera);

            setStatus(previous => previous === 'loading' ? 'ready' : previous);

          }

        });

      };

      const geometry = new THREE.BufferGeometry(); geometries.push(geometry);

      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));

      geometry.setAttribute('uv', new THREE.BufferAttribute(surfaceImageUvs(surface.grid.width, surface.grid.height), 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));

      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));

      geometry.computeVertexNormals(); geometry.computeBoundingSphere();

      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, side: THREE.DoubleSide });

      const imageMaterials = createSurfaceImageMaterials();
      materials.push(material, imageMaterials.lit, imageMaterials.original);

      const terrain = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial | THREE.MeshLambertMaterial | THREE.MeshBasicMaterial>(geometry, material);

      let displayingImage = false;
      const images = latestResource<SurfaceImageryLayer | 'relief', { bitmap?: ImageBitmap; texture?: THREE.Texture }>({
        load: async (layer, signal) => {
          if (layer === 'relief') return {};
          const bitmap = await loadSurfaceImageryLayer(layer, signal);
          try {
            const texture = new THREE.Texture(bitmap); texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.needsUpdate = true;
            texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.anisotropy = Math.min(4,renderer!.capabilities.getMaxAnisotropy());
            return { bitmap, texture };
          } catch (error) { bitmap.close(); throw error; }
        },
        display: (resource, layer) => {
          displayingImage = layer !== 'relief';
          setSurfaceImageTexture(imageMaterials, resource.texture ?? null);
          terrain.material = displayingImage ? (appearance.current.lighting === 'original' ? imageMaterials.original : imageMaterials.lit) : material;
          setImageState({displayed:layer}); invalidate();
        },
        release: resource => { resource.texture?.dispose(); resource.bitmap?.close(); },
        loading: layer => setImageState(previous => ({...previous,loading:layer === 'relief' ? 'Relief shading' : layer.label,error:undefined})),
        failed: error => setImageState(previous => ({displayed:previous.displayed,error:error instanceof Error ? error.message : 'Photographic imagery could not be opened.'})),
      });
      releaseImagery = () => images.dispose();
      imageRequest.current = layer => { void images.request(layer); };
      if (imageChoice.current) imageRequest.current(imageChoice.current);
      terrain.castShadow = true; terrain.receiveShadow = true; scene.add(terrain);

      // Neutral fill keeps dark slopes readable without recoloring the published image.
      scene.add(new THREE.AmbientLight('#ffffff', surfaceLightIntensities.fill));

      const sun = new THREE.DirectionalLight('#ffffff', surfaceLightIntensities.key);

      sun.position.set(...surfaceLightPosition(appearance.current.lightDirection, extent, midpoint));
      updateAppearance.current = () => {
        if (displayingImage) terrain.material = appearance.current.lighting === 'original' ? imageMaterials.original : imageMaterials.lit;
        sun.position.set(...surfaceLightPosition(appearance.current.lightDirection, extent, midpoint));
        invalidate();
      };

      sun.target.position.set(0, midpoint, 0);

      sun.castShadow = true;

      sun.shadow.mapSize.set(1024, 1024);

      sun.shadow.camera.left = sun.shadow.camera.bottom = -extent;

      sun.shadow.camera.right = sun.shadow.camera.top = extent;

      sun.shadow.camera.near = extent / 100;

      sun.shadow.camera.far = extent * 5;

      sun.shadow.bias = -0.0003; sun.shadow.normalBias = extent / 3000;

      scene.add(sun, sun.target);



      // The published polygon stays in its original raster coordinates. Sample densely

      // along each edge, and leave gaps wherever source heights are missing.

      const outline: number[] = [];

      const points = surface.roi.outline_grid;

      const lift = extent * 0.0015;

      for (let i = 0; i < points.length; i++) {

        const a = points[i], b = points[(i + 1) % points.length];

        const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));

        let previous: [number, number, number] | null = null;

        for (let step = 0; step <= steps; step++) {

          const col = a[0] + (b[0] - a[0]) * step / steps, row = a[1] + (b[1] - a[1]) * step / steps;

          const y = surfaceHeightAt(surface.grid, heights, validMask, col, row);

          if (y === null) { previous = null; continue; }

          const [x, z] = gridToSurface(surface.grid, col, row);

          const point: [number, number, number] = [x, y + lift, z];

          if (previous) outline.push(...previous, ...point);

          previous = point;

        }

      }

      const outlineGeometry = new THREE.BufferGeometry(); geometries.push(outlineGeometry);

      outlineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3));

      const outlineMaterial = new THREE.LineBasicMaterial({ color: '#b9ee79', depthTest: true }); materials.push(outlineMaterial);

      scene.add(new THREE.LineSegments(outlineGeometry, outlineMaterial));

      controls = new OrbitControls(camera, renderer.domElement);

      controls.target.set(0, midpoint, 0);

      controls.enableDamping = false;

      controls.minDistance = extent * 0.035; controls.maxDistance = extent * 7;

      controls.maxPolarAngle = Math.PI * 0.49;

      controls.screenSpacePanning = true;

      controls.addEventListener('change', invalidate);

      const fit = () => {

        const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);

        const radius = Math.hypot(data.extentX, data.extentZ, data.max - data.min) / 2;

        const fitDistance = radius / Math.sin(Math.atan(Math.tan(halfFov) * Math.min(camera.aspect, 1))) * 1.13;

        camera.position.copy(new THREE.Vector3(0.9, 0.85, 1.15).normalize().multiplyScalar(fitDistance).add(new THREE.Vector3(0, midpoint, 0)));

        controls?.target.set(0, midpoint, 0); controls?.update(); invalidate();

      };

      pointer = new PointerLockControls(camera, renderer.domElement);

      let walking = false, gridPosition: [number,number] = initialGrid ?? [(surface.grid.width-1)/2,(surface.grid.height-1)/2];

      const input = createWalkInput(), keys = input.keys; let lastTime = 0;
      const publishPosition = createWalkPositionPublisher(setWalkPosition);
      const updatePosition = (time: number, flush = false) => { if(disposed)return; const [x,z]=gridToSurface(surface.grid,...gridPosition); publishPosition(x,z,time,flush); };
      const canvas=renderer.domElement, ownerDocument=canvas.ownerDocument;
      let focused=false, lockUnavailable=false, lockPending=false, captureId:number|null=null, dragX=0, dragY=0;
      const releaseDrag=()=>{if(captureId!==null&&canvas.hasPointerCapture(captureId))canvas.releasePointerCapture(captureId);captureId=null;};
      const stopFrame=()=>{input.pause();updatePosition(performance.now(),true);lastTime=0;if(frame)cancelAnimationFrame(frame);frame=0;if(!disposed)setWalkActive(false);};
      const fallback=()=>{lockPending=false;if(disposed){ownerDocument.removeEventListener('pointerlockchange',guardLateLock);ownerDocument.removeEventListener('pointerlockerror',lockError,true);return;}lockUnavailable=true;setWalkHelp('Mouse capture unavailable: arrows or drag terrain to look | WASD move | Escape pauses');if(walking&&focused)startFrame();};

      const setWalkingHeight = () => { const y=terrainTriangleHeightAt(surface.grid,heights,validMask,...gridPosition); if(y===null)return false; const [x,z]=gridToSurface(surface.grid,...gridPosition);camera.position.set(x,y+1.6,z);return true; };

      const tick = (time:number) => {

        frame=0;if(disposed||!input.active||!walkInputActive(walking,!!pointer?.isLocked,focused))return;

        const dt=Math.min(.05,lastTime?(time-lastTime)/1000:0);lastTime=time;

        const right=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),forward=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);

        if(right||forward){const direction=new THREE.Vector3();camera.getWorldDirection(direction);direction.y=0;direction.normalize();const sideways=new THREE.Vector3().crossVectors(direction,new THREE.Vector3(0,1,0));const movement=direction.multiplyScalar(forward).addScaledVector(sideways,right).normalize().multiplyScalar(2*dt);gridPosition=walkSurfaceStep(surface.grid,heights,validMask,gridPosition,[movement.x/surface.grid.spacing_m[0],movement.z/surface.grid.spacing_m[1]]);setWalkingHeight();updatePosition(time);}

        renderer?.render(scene,camera);frame=requestAnimationFrame(tick);

      };

      const startFrame=()=>{if(frame)cancelAnimationFrame(frame);lastTime=0;frame=requestAnimationFrame(tick);};

      const enterWalk=()=>{if(!allowWalking||walking)return;const entry=surfaceWalkEntry(surface.grid,heights,validMask,gridPosition);if(!entry)return;gridPosition=entry;setWalkingHeight();updatePosition(performance.now(),true);walking=true;focused=false;stopFrame();setWalkStarted(false);terrain.receiveShadow=false;controls!.enabled=false;camera.near=.05;camera.updateProjectionMatrix();camera.lookAt(camera.position.clone().add(new THREE.Vector3(0,-.1,-1)));setMode('walk');setWalkHelp(lockUnavailable?'Mouse capture unavailable: arrows or drag terrain to look | WASD move | Escape pauses':'WASD move | Arrows or mouse look | Escape pauses');canvas.setAttribute('aria-label',`${surface.name}: first person terrain. Start exploration to enable WASD movement and arrow key look. Drag terrain to look if mouse capture is unavailable.`);modeCallback.current?.('walk');invalidate();};

      const orbit=()=>{walking=false;terrain.receiveShadow=true;focused=false;releaseDrag();stopFrame();if(pointer?.isLocked)pointer.unlock();controls!.enabled=true;camera.near=extent/1000;camera.updateProjectionMatrix();setMode('orbit');canvas.setAttribute('aria-label',`${surface.name}: interactive three dimensional elevation model. Drag to orbit, scroll to zoom, right drag to pan.`);modeCallback.current?.('orbit');fit();};

      const engage=()=>{
        if(disposed||!walking)return;
        canvas.focus({preventScroll:true});focused=true;input.activate();setWalkActive(true);setWalkStarted(true);startFrame();
        if(pointer?.isLocked||lockUnavailable||lockPending)return;
        if(typeof canvas.requestPointerLock!=='function'){fallback();return;}
        lockPending=true;
        try { const result=canvas.requestPointerLock() as Promise<void>|undefined; result?.then(()=>{guardLateLock();if(disposed){ownerDocument.removeEventListener('pointerlockchange',guardLateLock);ownerDocument.removeEventListener('pointerlockerror',lockError,true);}},fallback); } catch { fallback(); }
      };
      const lookBy=(dx:number,dy:number)=>{const rotation=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');const look=dragLookAngles(rotation.y,rotation.x,dx,dy);rotation.y=look.yaw;rotation.x=look.pitch;camera.quaternion.setFromEuler(rotation);invalidate();};
      const keydown=(e:KeyboardEvent)=>{
        if(!input.active||!walkInputActive(walking,!!pointer?.isLocked,focused))return;
        if(e.code==='Escape'){e.preventDefault();pause();return;}
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();lookBy(e.code==='ArrowLeft'?-20:e.code==='ArrowRight'?20:0,e.code==='ArrowUp'?-20:e.code==='ArrowDown'?20:0);return;}
        if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();input.press(e.code);}
      };
      const keyup=(e:KeyboardEvent)=>{if(input.release(e.code))updatePosition(performance.now(),true);};
      const pause=()=>{focused=false;releaseDrag();stopFrame();canvas.blur();if(pointer?.isLocked)pointer.unlock();invalidate();};
      const clear=pause;
      const unlock=()=>{focused=false;releaseDrag();stopFrame();canvas.blur();invalidate();};
      // Legacy requestPointerLock may return no promise: retain this document guard
      // across teardown only while a request is pending, until its grant/error arrives.
      const guardLateLock=()=>{if(ownerDocument.pointerLockElement!==canvas)return;lockPending=false;if(disposed||!walking||!focused||!input.active)ownerDocument.exitPointerLock();if(disposed){ownerDocument.removeEventListener('pointerlockchange',guardLateLock);ownerDocument.removeEventListener('pointerlockerror',lockError,true);}};
      const locked=()=>{lockPending=false;if(disposed||!walking||!focused||!input.active){if(ownerDocument.pointerLockElement===canvas)ownerDocument.exitPointerLock();return;}focused=true;releaseDrag();startFrame();};
      const lockError=(e:Event)=>{if(!lockPending&&!(walking&&lockUnavailable))return;e.preventDefault();e.stopImmediatePropagation();fallback();};
      const pointerdown=(e:PointerEvent)=>{if(!walking||!input.active||pointer?.isLocked||e.button!==0)return;captureId=e.pointerId;dragX=e.clientX;dragY=e.clientY;canvas.setPointerCapture(e.pointerId);startFrame();};
      const pointermove=(e:PointerEvent)=>{if(!walking||pointer?.isLocked||captureId!==e.pointerId)return;lookBy(e.clientX-dragX,e.clientY-dragY);dragX=e.clientX;dragY=e.clientY;invalidate();};
      const pointerup=(e:PointerEvent)=>{if(captureId===e.pointerId)releaseDrag();};
      pointer.addEventListener('lock',locked);pointer.addEventListener('unlock',unlock);pointer.addEventListener('change',invalidate);
      ownerDocument.addEventListener('pointerlockerror',lockError,true);
      ownerDocument.addEventListener('pointerlockchange',guardLateLock);
      canvas.addEventListener('click',engage);canvas.addEventListener('pointerdown',pointerdown);canvas.addEventListener('pointermove',pointermove);canvas.addEventListener('pointerup',pointerup);canvas.addEventListener('pointercancel',pointerup);canvas.addEventListener('blur',clear);
      window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clear);
      const cleanWalk=()=>{releaseDrag();stopFrame();canvas.removeEventListener('click',engage);canvas.removeEventListener('pointerdown',pointerdown);canvas.removeEventListener('pointermove',pointermove);canvas.removeEventListener('pointerup',pointerup);canvas.removeEventListener('pointercancel',pointerup);canvas.removeEventListener('blur',clear);if(!lockPending){ownerDocument.removeEventListener('pointerlockerror',lockError,true);ownerDocument.removeEventListener('pointerlockchange',guardLateLock);}window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clear);pointer?.removeEventListener('lock',locked);pointer?.removeEventListener('unlock',unlock);pointer?.removeEventListener('change',invalidate);};

      actions.current = { engage, pause, reset: orbit, walk:enterWalk, orbit, wireframe: value => { material.wireframe = value; imageMaterials.lit.wireframe = value; imageMaterials.original.wireframe = value; invalidate(); } };



      let firstResize = true;

      const size = () => {

        if (disposed || !renderer) return;

        const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);

        renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();

        if (firstResize) { fit(); firstResize = false; } else invalidate();

      };

      resize = new ResizeObserver(size); resize.observe(container); size();

      if(surfaceWalkMode(requestedMode,allowWalking)==='walk')enterWalk();else setMode('orbit');

      const lost = (event: Event) => { event.preventDefault(); fail('The 3D graphics context was interrupted. Reload the view to continue.'); };

      renderer.domElement.addEventListener('webglcontextlost', lost);

      removeEvents = () => { renderer?.domElement.removeEventListener('webglcontextlost', lost); cleanWalk(); };

      // Shadow targets are GPU resources owned by the light, outside the mesh registry.

      const priorRemove = removeEvents;

      removeEvents = () => { priorRemove(); sun.shadow.dispose(); };

    } catch (cause) {

      fail(cause instanceof Error ? cause.message : 'Unable to initialize this elevation model.');

    }

    return () => {

      disposed = true;

      if (frame) cancelAnimationFrame(frame);

      imageRequest.current = null; updateAppearance.current = null; releaseImagery();
      actions.current = null; resize?.disconnect(); controls?.dispose(); removeEvents(); pointer?.unlock(); pointer?.dispose();

      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());

      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();

    };

  }, [surface, heights, validMask, allowWalking]);



  const width = (surface.grid.width - 1) * surface.grid.spacing_m[0];

  const depth = (surface.grid.height - 1) * surface.grid.spacing_m[1];

  return <div className="surface-viewport">

    <div ref={host} style={{ position: 'absolute', inset: 0 }} />

    <div className="surface-viewport-header"><div>

      <div style={{ fontSize: 10, letterSpacing: '0.14em', color: '#95b1bc', marginBottom: 7 }}>{surface.id.startsWith('regional-') ? 'REGIONAL SOURCE RELIEF' : 'NATIVE PROJECTED RELIEF'}</div>

      <div style={{ fontSize: 11, color: '#aebfc8' }}>Relative source heights | 1x vertical scale</div>

    </div>

    <div className="surface-viewport-actions">

      {mode === 'walk' && <button type="button" style={buttonStyle} onPointerDown={event => event.preventDefault()} onClick={() => walkActive ? actions.current?.pause() : actions.current?.engage()}>{walkActive ? 'Pause exploration' : walkStarted ? 'Resume exploration' : 'Start exploration'}</button>}
      {allowWalking && <button type="button" style={buttonStyle} onClick={() => mode === 'walk' ? actions.current?.orbit() : actions.current?.walk()}>{mode === 'walk' ? 'Orbit mode' : 'Enter first person'}</button>}

      <button type="button" style={buttonStyle} title="Restore the complete terrain view" onClick={() => actions.current?.reset()}><RotateCcw size={13} /> Reset</button>

      <button type="button" style={{ ...buttonStyle, color: wireframe ? '#b9ee79' : '#d7e8e8' }} aria-pressed={wireframe} title="Show the source grid triangles" onClick={() => { const next = !wireframe; setWireframe(next); actions.current?.wireframe(next); }}><Grid2X2 size={13} /> Grid</button>

    </div>

    </div>
    <div className="surface-imagery" aria-label="Surface appearance">
      <div className="surface-imagery-choices">{imagery?.layers.map(layer => <button type="button" key={layer.id} aria-pressed={choice === layer.id} onClick={() => chooseImage(layer.id)}>{layer.id === 'orbital-color' ? 'Orbital color' : 'Local image'}</button>)}<button type="button" aria-pressed={choice === 'relief'} onClick={() => chooseImage('relief')}>Relief shading</button></div>
      <div role="status" className="surface-image-status">
        <strong>{imageState.displayed && imageState.displayed !== 'relief' ? imageState.displayed.color_mode === 'published_false_color' ? 'Published enhanced IRB · not natural RGB' : imageState.displayed.color_mode === 'published_grayscale' ? 'Published grayscale' : 'Coarse global display mosaic' : 'Relief shading · elevation tint'}</strong>
        {imageState.loading && <p>Loading {imageState.loading}…</p>}
        {imageState.error && <p>{imageState.error} <button type="button" onClick={() => { if (desiredImage) imageRequest.current?.(desiredImage); }}>Retry imagery</button></p>}
        {imageryError && <p>{imageryError}</p>}
      </div>
      <details className="surface-appearance-details">
        <summary>Lighting &amp; source details · {lighting === 'original' && imageState.displayed !== 'relief' ? 'Original image' : 'Relief light'}</summary>
        <div className="surface-lighting" aria-label="Surface lighting">
          <div className="surface-imagery-choices"><button type="button" aria-pressed={lighting === 'relief-light' || imageState.displayed === 'relief'} onClick={() => setLighting('relief-light')}>Relief light</button><button type="button" disabled={!imageState.displayed || imageState.displayed === 'relief'} aria-pressed={lighting === 'original' && imageState.displayed !== 'relief'} onClick={() => setLighting('original')}>Original image · unlit</button></div>
          {(lighting === 'relief-light' || imageState.displayed === 'relief') && <label>Light direction <input aria-label="Visualization light direction" type="range" min="0" max="360" step="5" value={lightDirection} onChange={event => setLightDirection(Number(event.target.value))} /> {lightDirection}°</label>}
          <p>{lighting === 'original' && imageState.displayed !== 'relief' ? 'Published image colors without added terrain illumination.' : 'Neutral visualization light reveals DEM slopes; not the real Sun. Published image illumination remains baked in.'}</p>
        </div>
        {imageState.displayed && imageState.displayed !== 'relief' ? <>
          <strong>{imageState.displayed.label}</strong> · <a href={imageState.displayed.source_url} target="_blank" rel="noreferrer">Image source</a>
          <p>{imageState.displayed.id === 'orbital-color' ? 'Coarse global display mosaic · approximate placement; no local photographic detail.' : imageState.displayed.color_mode === 'published_false_color' ? 'Published enhanced color; not natural RGB.' : 'Published grayscale image.'}</p>
          <a href={imageState.displayed.provenance.path} target="_blank" rel="noreferrer">Processing provenance</a><ul>{imageState.displayed.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul>
        </> : <p>Colors show relative elevation, not photographed surface color.</p>}
      </details>
    </div>
    <div className="surface-viewport-help" id="surface-navigation-help">

      <div role="status" style={{ fontSize: 11, color:'#b9ee79', marginBottom:6 }}>{mode === 'walk' ? `First person | ${walkActive ? 'Active' : 'Paused'}` : allowWalking ? 'Orbit mode' : surface.id.startsWith('regional-') ? 'Orbit only · coarse regional grid' : 'Touch orbit · walking requires a keyboard'}</div>
      <div style={{ fontSize: 11, marginBottom: 6 }}>{mode === 'walk' ? `${walkActive ? '' : 'Start or resume exploration | '}${walkHelp}` : 'Drag to orbit'} {mode === 'orbit' && ' | Scroll to zoom | Right drag to pan'}</div>

      {mode === 'walk' && walkPosition && <div style={{fontSize:11,marginBottom:6,color:'#b9ee79'}} aria-label="Native navigation position">Native axes: X {walkPosition.x.toFixed(1)} m | Z {walkPosition.z.toFixed(1)} m (grid centre origin)</div>}
      <div style={{ fontSize: 10, color: '#8fa7b3' }}>{mode === 'walk' && 'Bounded to valid source triangles  |  eye 1.6 m  |  speed 2 m/s (navigation settings). '}Grid extent {metres(width)} x {metres(depth)} <span style={{ color: '#b9ee79', marginLeft: 8 }}>- ROI boundary</span></div>

    </div>

    {status === 'loading' && <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#07131c' }}>Preparing source elevation...</div>}

    {status === 'error' && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 30, background: '#07131c', textAlign: 'center' }}>{error}</div>}

  </div>;

}

