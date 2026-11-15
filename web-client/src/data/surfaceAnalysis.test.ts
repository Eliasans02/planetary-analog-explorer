import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { SurfaceCatalog } from '@shared/types/surface-catalog';
import { ANALYSIS_BYTE_LIMIT, loadSurfaceAnalysis, validateSurfaceAnalysis } from './surfaceAnalysis';

// TEST_ONLY: a complete 3x3 grid supplies exactly one analyzed center.
function fixture() {
  const source = JSON.parse(readFileSync(new URL('../../public/data/surface_catalog.json', import.meta.url), 'utf8')) as SurfaceCatalog;
  const s = structuredClone(source.surfaces[0]); s.id = 'test-only'; s.grid.width = 3; s.grid.height = 3; s.grid.spacing_m = [1,1]; s.stats.valid_samples = 9; s.stats.total_samples = 9; s.stats.relief_m = 4;
  const catalog = { ...source, surfaces: [s] }, sha = 'a'.repeat(64);
  const analysis = { schema_version:'1.0.0', generated_at:'2026-11-14T00:00:00Z', catalog_sha256:sha, method:{id:'horn_3x3_v1',references:['https://gdal.org/en/stable/programs/gdaldem.html']}, surfaces:[{surface_id:s.id, inputs:{heights_sha256:s.grid.heights.sha256,valid_mask_sha256:s.grid.valid_mask.sha256,width:3,height:3,spacing_m:[1,1]},coverage:{valid_height_samples:9,total_samples:9,analyzed_centers:1,possible_interior_centers:1}, metrics:{relief_m:4,mean_slope_deg:2,p95_slope_deg:2,max_slope_deg:2,mean_roughness_m:4,max_roughness_m:4,mean_tri_m:7},slope_histogram:[0,5,10,20,30].map((min_deg,i)=>({min_deg,max_deg:[5,10,20,30,90][i],samples:i===0?1:0,fraction_pct:i===0?100:0})),limitations:['TEST_ONLY']}] };
  return {catalog,sha,analysis};
}
afterEach(()=>vi.unstubAllGlobals());
describe('prepared source-bound analysis',()=>{
  it('accepts shipped summaries bound to the exact shipped source catalog bytes',()=>{
    const bytes=readFileSync(new URL('../../public/data/surface_catalog.json',import.meta.url));
    const catalog=JSON.parse(bytes.toString('utf8')) as SurfaceCatalog;
    const data=JSON.parse(readFileSync(new URL('../../public/data/surface_analysis.json',import.meta.url),'utf8'));
    expect(validateSurfaceAnalysis(data,catalog,createHash('sha256').update(bytes).digest('hex')).surfaces.length).toBe(catalog.surfaces.length);
  });
  it('accepts complete counts, inputs, and distribution',()=>{const f=fixture();expect(validateSurfaceAnalysis(f.analysis,f.catalog,f.sha)).toBe(f.analysis);});
  it.each(['hash','stale-input','spacing','count','fraction','bin','missing','bounds','unknown-field'])('rejects corrupt or stale summaries: %s',kind=>{
    const f=fixture(), r=f.analysis.surfaces[0];
    if(kind==='hash')f.analysis.catalog_sha256='bad';
    if(kind==='stale-input')r.inputs.heights_sha256='b'.repeat(64);
    if(kind==='spacing')r.inputs.spacing_m=[2,1];
    if(kind==='count')r.coverage.analyzed_centers=2;
    if(kind==='fraction')r.slope_histogram[0].fraction_pct=99;
    if(kind==='bin')r.slope_histogram[0].max_deg=6;
    if(kind==='missing')f.analysis.surfaces=[];
    if(kind==='bounds')r.metrics.max_roughness_m=10;
    if(kind==='unknown-field')Object.assign(r.metrics,{invented_score:100});
    expect(()=>validateSurfaceAnalysis(f.analysis,f.catalog,f.sha)).toThrow();
  });
  it('bounds streamed bytes even without content-length',async()=>{const f=fixture();vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(ANALYSIS_BYTE_LIMIT+1))));await expect(loadSurfaceAnalysis(f.catalog,f.sha,new AbortController().signal)).rejects.toThrow('quota');});
  it('rejects coherent histogram counts that contradict the slope metrics',()=>{
    const f=fixture(),r=f.analysis.surfaces[0];r.slope_histogram[0].samples=0;r.slope_histogram[0].fraction_pct=0;r.slope_histogram[4].samples=1;r.slope_histogram[4].fraction_pct=100;
    expect(()=>validateSurfaceAnalysis(f.analysis,f.catalog,f.sha)).toThrow('distribution');
    r.metrics.max_slope_deg=40;r.metrics.p95_slope_deg=40;
    expect(()=>validateSurfaceAnalysis(f.analysis,f.catalog,f.sha)).toThrow('distribution');
  });
});
