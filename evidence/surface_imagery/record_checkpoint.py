"""Record the bounded sites, analysis and source-color engineering checkpoint."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'evidence/surface_imagery/'
EXP = 'evidence/surface_expansion/'
ID = 'SURFACE_SITES_ANALYSIS_COLOR_VERIFIED_2026-11-14'
STAMP = datetime.now(timezone.utc).isoformat()

def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))

def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def identity(path):
    raw = (ROOT / path).read_bytes()
    return dict(path=path, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())

def urls(value):
    if isinstance(value, str):
        return {value} if value.startswith('https://') else set()
    if isinstance(value, list):
        return set().union(*(urls(v) for v in value))
    if isinstance(value, dict):
        return set().union(*(urls(v) for v in value.values()))
    return set()

shots = [identity(PREFIX + 'imagery-' + v + '.jpg') for v in ('moon', 'mars', 'local')]
for shot, sha in zip(shots, [
    'd73804dac8142b79f1919f4bb5052b854dd391291e469940aa9ee1f83cc4267e',
    'a626ab566c9f169004200090eb6d4b87366099f64d2db7a00fd955da46fe3b87',
    '56102ce68ec520ace86b7ff2be5b7b963770f81d6ee2adcff98a4c33c2f84eb2']):
    assert shot['sha256'] == sha
pins = identity(EXP + 'expansion-pins.jpg')
assert pins['sha256'] == '7922f9f8969be5ee63e39cf0d14a56db8eda8efd69a245cfdf07c5d6d12a9e0a'
built = identity('web-client/dist/assets/index-7jGhMrdp.js')
catalogs = [identity('web-client/public/data/' + name + '.json') for name in
            ('planet_catalog', 'surface_catalog', 'surface_analysis', 'surface_imagery')]
assert catalogs[-1]['sha256'] == 'd6b26ada6264b71abbb519fef48a6702144d787379bf98b1530325d0dac907d6'
surface = read('web-client/public/data/surface_catalog.json')
imagery = read('web-client/public/data/surface_imagery.json')
assert imagery['catalog_sha256'] == catalogs[1]['sha256']

commands = [dict(command='npm run ' + cmd, cwd='web-client', exit_code=0, log=PREFIX + log + '.txt')
            for cmd, log in [('test','test'),('typecheck','typecheck'),('build','build'),
                             ('verify:surfaces','verify-surfaces'),('verify:planets','verify-planets')]]
commands += [dict(command='previews/a04/.venv/Scripts/python.exe ' + cmd, cwd='.', exit_code=0,
                  log=PREFIX + log + '.txt') for cmd, log in [
    ("-m unittest discover -s data-pipeline/tests -p 'test_surface*.py' -v", 'python-tests'),
    ('data-pipeline/analyze_surfaces.py --check', 'analysis-check')]]
checks = dict(recorded_at=STAMP, execution_location='local_repository', commands=commands,
    frontend_tests_passed=155, frontend_files_passed=15, python_tests_passed=26,
    built_js=built, all_implementation_changes_included=True,
    scientific_source_samples_invented=False, scientific_derivatives_computed=True,
    analysis_unchanged_by_imagery=True, source_rgb_pixels_compared=149769,
    warnings=['Vite main chunk exceeds 500 kB; build passed.'],
    environment_note='Initial system Python and contract-only venv runs lacked dependencies. Preserved failure logs; the existing previews/a04 scientific venv passed all checks. No dependency installation required.',
    scored_dataset_verify_assets='UNSATISFIED_MISSING_CALIBRATED_DATASET_NOT_RERUN',
    performance_benchmark='NOT_PERFORMED', human_pass=dict(Dev_A=False, Dev_B=False), phase5_committed=False)
write(PREFIX + 'check-status.json', checks)
write(EXP + 'check-status.json', dict(recorded_at=STAMP, scope='Historical pre-color expansion build',
    frontend_tests_passed=119, frontend_files_passed=13,
    commands=[dict(command=c['command'], cwd='web-client', exit_code=0, log=c['log'].replace(PREFIX,EXP))
              for c in commands[:5]], built_js='index-Cuab9JlK.js',
    superseded_by=ID, final_checks=PREFIX+'check-status.json'))

write(EXP + 'browser-observation.json', dict(recorded_at=STAMP, build='index-Cuab9JlK.js',
    observer='Astra through documented internal-browser CUA', url='http://127.0.0.1:4173/',
    observations=['Three Moon and three Mars sites visible; selected globe pin and named Locate controls work.',
      'Explored Connecting ridge, Nobile rim, Gale and Eberswalde native windows with matching analysis.',
      'Earth surface archive displays its source-derived analysis.',
      'All viewed windows report 16641 valid heights and 16129 eligible 3x3 neighborhoods.',
      'Console warn/error entries empty.'],
    screenshots=[pins], limitations=['Pre-color build; screenshot proves site pins, not photographic color.',
      'Native pointer lock unavailable in this internal browser; keyboard/drag fallback used.']))
browser = dict(recorded_at=STAMP, observer='Astra root through documented internal-browser CUA',
    url='http://127.0.0.1:4173/', final_script_observed='/assets/index-7jGhMrdp.js',
    final_console_warn_error_entries=[], screenshots=shots,
    observations=['Connecting ridge orbital layer displays published lunar mosaic colors and coarse-image label.',
      'Gale orbital layer displays the sampled global source color; Local image shows published enhanced IRB texture and label.',
      'Orbital, local image and relief modes switch without resetting the visible orbital framing or analysis.',
      'First-person W changed HUD Z from 0.0 to -1.0 m; Escape paused. Switching relief to Local image retained X 0.0, Z -1.0 m and paused mode.',
      'Live preview restored and marked deliverable after saving all screenshots.'],
    limitations=['No GPU pixel-equality measurement, color-calibrated monitor validation or FPS/RAM benchmark.',
      'Exact source PNG samples were validated independently; global placement remains approximate.',
      'Native pointer-lock success unverified; browser used explicit keyboard/drag fallback.',
      'Imagery is display data, not a measured albedo or natural-RGB claim.'])
write(PREFIX+'browser-observation.json',browser)

previous = read('REPO_STATE.json')['current_checkpoint']
implemented = ['Added four source-backed native terrain windows: LOLA Site01/Site06 and HiRISE Gale/Eberswalde; six planetary pins plus retained Earth surface.',
    'Offline Horn slopes, relief, 3x3 range roughness, Riley TRI and slope distribution with source binding and validity coverage.',
    'Six orbital mosaic drapes and three HiRISE local images; published RGB/grayscale preserved and color modes labeled.',
    'Hash-bound optional imagery loader, PDS-label mapping checks, pixel-center UVs, bounded resource cleanup and camera-preserving mode swaps.']
remaining = ['Acquire finer real local lunar imagery and broader source-backed terrain windows.',
    'Reconstruct and register real source-backed Gaussian splats.',
    'Calibrate comparable spatial-support analysis and similarity; complete exact body-frame/ENU registration.',
    'Benchmark foreground FPS/RAM and native pointer lock in a supporting browser.',
    'Receive human Dev_A and Dev_B acceptance.']
checkpoint = dict(id=ID, recorded_at=STAMP, phase='PHASE_4_ENGINEERING_VERIFIED_HUMAN_PASS_PENDING',
    phase5_committed=False, human_pass=dict(Dev_A=False,Dev_B=False), execution_mode='parallel_local_sol_6_1_medium',
    url=browser['url'], contracts=previous['contracts'] | dict(surface_analysis='1.0.0',surface_imagery='1.0.0'),
    catalogs=catalogs, surface_counts=dict(moon=3,mars=3,earth=1), imagery_records=6, imagery_layers=9,
    built_js=built, implemented=implemented,
    checks=dict(frontend_tests_passed=155,frontend_files_passed=15,python_tests_passed=26,
      typecheck='PASS',build='PASS',verify_planets='PASS',verify_surfaces='PASS',analysis_recomputation='PASS',
      browser='FUNCTIONAL_COLOR_AND_NAVIGATION_OBSERVATIONS_WITH_POINTER_LOCK_FALLBACK',
      performance_benchmark='NOT_PERFORMED',scored_dataset_verify_assets='UNSATISFIED_MISSING_CALIBRATED_DATASET'),
    evidence=[PREFIX+p for p in ('check-status.json','browser-observation.json','verification.json',
      'review-pipeline.md','review-render.md','SOURCE_MANIFEST.json')] + [EXP+'review-assets.md',EXP+'review-analysis.md'],
    screenshots=shots+[pins], remaining=remaining, scheduler_created=False,daemon_running=False)
write(PREFIX+'SURFACE_COLOR_CHECKPOINT.json',checkpoint)

roles = [dict(id='/root/'+name,role=role,model='gpt-6.1-sol',reasoning_effort='medium',
              status='completed_bounded_task',evidence=PREFIX+'SURFACE_COLOR_CHECKPOINT.json') for name,role in [
    ('surface_assets','NASA asset acquisition, source-color pipeline and independent analysis review'),
    ('terrain_analysis','Scientific analysis, imagery contract/loader and independent asset/render reviews'),
    ('surface_experience','Surface pins, analysis panel, color rendering and documentation')]]
provenance = []
for record in imagery['records']:
    for layer in record['layers']:
        path='web-client/public'+layer['provenance']['path']
        provenance.append(dict(surface_id=record['surface_id'],layer=layer['id'],color_mode=layer['color_mode'],
          registration=layer['registration'],source_urls=sorted(urls(read(path))),provenance=identity(path)))
data_usage = dict(checkpoint=ID,recorded_at=STAMP,native_dem_sources=surface['sources'],imagery_sources=provenance,
    checksum_scope='Read each provenance receipt: native HiRISE DEM hashes cover exact downloaded ranges; imagery JP2 hashes cover complete assembled products. Never interpret a range hash as a full DEM hash.',
    scientific_values_invented=False,scientific_derivatives_computed=True,
    research_sources=['https://gdal.org/en/stable/programs/gdaldem.html',
      'https://github.com/OSGeo/gdal/blob/v3.11.0/apps/gdaldem_lib.cpp',
      'https://www.usgs.gov/publications/effect-resolution-terrain-feature-extraction',
      'https://pgda.gsfc.nasa.gov/products/78','https://www.uahirise.org/dtm/howto.php'])
write(PREFIX+'data-attribution.json',data_usage)

for path in ['REPO_STATE.json','docs/orchestration/ASTRA_LOOP_STATE.json','docs/orchestration/SOL_TEAM_STATE.json',
             'docs/orchestration/AGENT_BOARD.json','AI_AND_DATA_ATTRIBUTION_LOG.json']:
    data=read(path)
    old=data.get('current_checkpoint')
    history=data.setdefault('checkpoint_history',[])
    if old and old['id']!=ID and not any(h['id']==old['id'] for h in history):
        history.append(old)
    data.update(current_checkpoint=checkpoint,updated_at=STAMP,phase=checkpoint['phase'],phase5_committed=False,
                state_update_kind='ENGINEERING_CHECKPOINT_NOT_HUMAN_ACCEPTANCE')
    if 'local_preview' in data:
        data['local_preview']=dict(url=browser['url'],source_directory='web-client',status='RUNNING_SURFACE_SOURCE_COLOR_BUILD',
          evidence=PREFIX+'browser-observation.json',real_native_relief_verified=True,exact_enu_or_splat_verified=False)
    if 'next_gate' in data:
        data['next_gate']='Human acceptance pending; authorized scientific coverage and reconstruction can continue.'
    if path=='REPO_STATE.json':
        data['modules']['planet_explorer'].update(evidence=checkpoint['evidence'],
          engineering_checks='VERIFIED_WITH_RUNTIME_LIMITATIONS',latest_checkpoint=ID)
    if path.endswith('ASTRA_LOOP_STATE.json'):
        data.update(next_action=remaining[0],handoff_priorities=remaining,local_checks_status=checkpoint['checks'],
                    observation_time_utc=STAMP,scheduler_created=False,daemon_running=False)
    for suffix,key in [('SOL_TEAM_STATE.json','agents'),('AGENT_BOARD.json','local_roles')]:
        if path.endswith(suffix):
            data[key]=[a for a in data.get(key,[]) if a.get('id') not in {r['id'] for r in roles}]+roles
    if path=='AI_AND_DATA_ATTRIBUTION_LOG.json':
        data['ai_contributions']=[a for a in data['ai_contributions'] if a.get('checkpoint')!=ID]
        data['ai_contributions'].append(dict(actor='Astra (Orchestrator) and three GPT-6.1 Sol medium local workers',
          checkpoint=ID,recorded_at=STAMP,roles=roles,scope=implemented+['Root integration, CUA evidence and checkpoint.'],
          scientific_values_invented=False,scientific_derivatives_computed=True,new_datasets_acquired=True,
          data_attribution=PREFIX+'data-attribution.json',human_verification='pending'))
        data['source_usage_checkpoints']=[a for a in data.get('source_usage_checkpoints',[]) if a.get('checkpoint')!=ID]+[data_usage]
    write(path,data)

# Update documentation links without duplicating the immutable evidence checkpoint at root.
for path in ['README.md','prompts/ASTRA_SOL_LOOP.md','docs/planet_explorer_contract.md']:
    doc=(ROOT/path).read_text(encoding='utf-8')
    doc=doc.replace('(SURFACE_COLOR_CHECKPOINT.json)','(evidence/surface_imagery/SURFACE_COLOR_CHECKPOINT.json)')
    doc=doc.replace('(../SURFACE_COLOR_CHECKPOINT.json)','(../evidence/surface_imagery/SURFACE_COLOR_CHECKPOINT.json)')
    (ROOT/path).write_text(doc,encoding='utf-8')

# Current source snapshot; no mutable state documents or recursive manifest hashes.
paths=set()
for directory in ['web-client/src','shared/schemas','shared/types','web-client/public/data',
                  'web-client/public/assets/surfaces','web-client/public/assets/surface-imagery',
                  'data-pipeline/tests','docs/research',PREFIX,EXP]:
    paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT/directory).rglob('*')
                 if p.is_file() and '__pycache__' not in p.parts and p.name!='SOURCE_MANIFEST.json')
paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT/'data-pipeline').glob('*.py'))
paths.update(['README.md','prompts/ASTRA_SOL_LOOP.md','docs/planet_explorer_contract.md','docs/native_surface_contract.md',
              'scripts/receive_preview_evidence.py',built['path'],'web-client/dist/assets/index-BrMCF5He.css'])
write(PREFIX+'SOURCE_MANIFEST.json',dict(recorded_at=STAMP,checkpoint=ID,
    scope='Current implementation, contracts, source-derived artifacts, research, tests and bounded evidence. Raw source receipts reside in provenance; mutable orchestration states excluded.',
    files=[identity(p) for p in sorted(paths)]))
print(json.dumps(dict(checkpoint=ID,frontend_tests=155,python_tests=26,files=len(paths),screenshots=shots),indent=2))
