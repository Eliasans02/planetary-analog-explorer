"""Persist this bounded navigation checkpoint from observed verification results."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'evidence/navigation_improvements/'
STAMP = datetime.now(timezone.utc).isoformat()
ID = 'NAVIGATION_CONTINUITY_VERIFIED_2026-11-14'

def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))

def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def identity(path):
    raw = (ROOT / path).read_bytes()
    return dict(path=path, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())

shots = [identity(PREFIX + 'navigation-' + v + '.jpg') for v in ('orbit', 'ground')]
assert shots[0]['sha256'] == '645eb9c490147d32bae0bda167e68bc0ffd6cbb698ab8459180e8c81bb61f351'
assert shots[1]['sha256'] == '6656756d6d975d0c55d7a2cb09a248ff28f328c0091f7e771f8ca1d713d4d648'
built = identity('web-client/dist/assets/index-BIWJTfWF.js')
suite_scope = ('All navigation source changes passed 105 tests in 12 files. '
               'Display-only grid-spacing formatting was added afterwards; final typecheck and build passed after that edit.')
checks = dict(recorded_at=STAMP, execution_location='local_repository', commands=[
    dict(command='npm.cmd run ' + command, cwd='web-client', exit_code=0, log=PREFIX + log + '.txt')
    for command, log in [('test', 'test'), ('typecheck', 'typecheck'), ('verify:planets', 'verify-planets'),
                         ('verify:surfaces', 'verify-surfaces'), ('build', 'build')]
], frontend_tests_passed=105, frontend_test_files_passed=12, full_suite_scope=suite_scope,
    built_js=built, warnings=['Vite main chunk exceeds 500 kB; build passed.'],
    scientific_data_changed=False, source_pipeline_tests_rerun=False,
    source_identity_evidence=PREFIX + 'independent-review.md',
    scored_dataset_verify_assets='UNSATISFIED_MISSING_CALIBRATED_DATASET_NOT_RERUN',
    performance_benchmark='NOT_PERFORMED', human_pass=dict(Dev_A=False, Dev_B=False), phase5_committed=False)
write(PREFIX + 'check-status.json', checks)

browser = dict(recorded_at=STAMP, observer='Astra root through CUA internal browser',
    url='http://127.0.0.1:4173/', final_script_observed='/assets/index-BIWJTfWF.js',
    final_console_warn_error_entries=[], intermediate_bundle='index-DwWbGyZ_.js',
    intermediate_bundle_scope='All navigation changes, before display-only spacing formatting.',
    observed_interactions=[
        'Rotated Moon retained pose and diameter from 2K through showing 2K/loading 4K to showing 4K.',
        'Split view fitted both globes; independently rotated Mars retained view when returning to a single panel.',
        'Locate Jezero, rotate away, explore and return retained the off-site Mars view instead of replaying Locate.',
        'Start and W changed native Z from zero to -1.7 m. Pause plus W left coordinates unchanged. Resume plus D changed X to 1.2 m. Escape paused. These are observed navigation positions, not scientific measurements or speed benchmarks.'
    ], final_bundle_observations=[
        'Jezero grid-spacing label shows 1.01 x 1.01 m; precise catalog values unchanged.',
        'Enter activated Start and Resume. Up arrows visibly shifted the horizon; Down restored it.',
        'Tab or Escape changed status to Paused, released canvas focus and showed Resume exploration.',
        'Final ground screenshot shows Paused and X 0.0 m / Z -0.1 m.',
        'Final split view displays both Moon and Mars verified 4K map status.'
    ], limitations=[
        'Internal browser rejected native pointer lock; explicit keyboard/drag fallback exercised. Native pointer-lock success remains unverified.',
        'Some final timed key holds produced no HUD delta; another produced -0.1 m. No speed, FPS or RAF throttling diagnosis is claimed. Read-only source audit found no concrete stalled-RAF path.',
        'Full-page split screenshot failed; orbital evidence is a viewport capture. Ground evidence is a full-page capture.',
        'No new source-derived terrain, scored results or Gaussian reconstruction was created in this navigation loop.'
    ], screenshots=shots, browser_control_method='Documented CUA UI actions and read-only DOM; no application state injection.')
write(PREFIX + 'browser-observation.json', browser)

previous = read('REPO_STATE.json')['current_checkpoint']
remaining = [
    'Expand real native terrain coverage and add registered source imagery.',
    'Reconstruct and register real source-backed Gaussian splats.',
    'Complete calibrated similarity and exact ENU/body-frame registration.',
    'Benchmark foreground FPS/RAM and input timing; verify native pointer lock in a supporting browser.',
    'Receive human Dev_A and Dev_B acceptance.'
]
implemented = [
    'Race-safe texture-only quality replacement retaining displayed map, camera and DEM; actual loading/showing status and retry.',
    'Per-body orbital view memory and relative zoom across split panels and ground return; stale Locate requests cleared.',
    'Explicit Start/Pause/Resume, keyboard arrow look, guarded input cleanup and final native position publishing.',
    'Responsive ground toolbar/help and display-only grid-spacing formatting.'
]
checkpoint = dict(id=ID, recorded_at=STAMP, phase='PHASE_4_ENGINEERING_VERIFIED_HUMAN_PASS_PENDING',
    phase5_committed=False, human_pass=dict(Dev_A=False, Dev_B=False), execution_mode='parallel_local_sol_6_1_medium',
    url=browser['url'], contracts=previous['contracts'],
    catalogs=[identity('web-client/public/data/' + body + '_catalog.json') for body in ('planet', 'surface')],
    built_js=built, implemented=implemented,
    checks=dict(frontend_tests_passed=105, frontend_files_passed=12, full_suite_scope=suite_scope,
        typecheck='PASS', build='PASS', verify_planets='PASS', verify_surfaces='PASS',
        browser='FUNCTIONAL_OBSERVATIONS_WITH_POINTER_LOCK_FALLBACK',
        scored_dataset_verify_assets='UNSATISFIED_MISSING_CALIBRATED_DATASET', performance_benchmark='NOT_PERFORMED'),
    evidence=[PREFIX + p for p in ('check-status.json', 'browser-observation.json', 'independent-review.md', 'SOURCE_MANIFEST.json')],
    screenshots=shots, remaining=remaining, no_unattended_scheduler=True)
write(PREFIX + 'NAVIGATION_CHECKPOINT.json', checkpoint)
preview = dict(url=browser['url'], source_directory='web-client', status='RUNNING_NAVIGATION_CONTINUITY_BUILD',
    evidence=PREFIX + 'browser-observation.json', real_native_relief_verified=True, exact_enu_or_splat_verified=False)
roles = [dict(id='/root/' + name, role=role, model='gpt-6.1-sol', reasoning_effort='medium',
              status='completed_bounded_task', evidence=PREFIX + 'NAVIGATION_CHECKPOINT.json') for name, role in [
    ('navigation_globe', 'Globe texture lifecycle and saved view'),
    ('navigation_ground', 'Explicit ground controls and position publishing'),
    ('navigation_review', 'Independent science identity, code/security review and continuation documentation')]]
changed_files = [
    'web-client/src/components/PlanetExplorer.tsx', 'web-client/src/components/PlanetViewport.tsx',
    'web-client/src/components/SurfaceViewport.tsx', 'web-client/src/components/SurfaceViewport.css',
    'web-client/src/terrain/latestResource.ts', 'web-client/src/terrain/latestResource.test.ts',
    'web-client/src/terrain/walkInput.ts', 'web-client/src/terrain/walkInput.test.ts',
    'docs/planet_explorer_contract.md', 'scripts/receive_preview_evidence.py', 'README.md', 'prompts/ASTRA_SOL_LOOP.md'
]
for name in ['REPO_STATE.json', 'docs/orchestration/ASTRA_LOOP_STATE.json', 'docs/orchestration/SOL_TEAM_STATE.json',
             'docs/orchestration/AGENT_BOARD.json', 'AI_AND_DATA_ATTRIBUTION_LOG.json']:
    data = read(name)
    old = data.get('current_checkpoint')
    history = data.setdefault('checkpoint_history', [])
    if old and old['id'] != ID and not any(h['id'] == old['id'] for h in history):
        history.append(old)
    data.update(current_checkpoint=checkpoint, updated_at=STAMP, phase5_committed=False,
                phase=checkpoint['phase'], state_update_kind='ENGINEERING_CHECKPOINT_NOT_HUMAN_ACCEPTANCE')
    if 'local_preview' in data:
        data['local_preview'] = preview
    if 'next_gate' in data:
        data['next_gate'] = 'Human acceptance remains pending; continue authorized real-data coverage/reconstruction work.'
    if name == 'REPO_STATE.json':
        data['modules']['planet_explorer'].update(evidence=checkpoint['evidence'],
            engineering_checks='VERIFIED_WITH_RUNTIME_LIMITATIONS', latest_checkpoint=ID)
    if name.endswith('ASTRA_LOOP_STATE.json'):
        data.update(next_action=remaining[0], handoff_priorities=remaining, local_checks_status=checkpoint['checks'],
                    observation_time_utc=STAMP, scheduler_created=False, daemon_running=False)
    for suffix, key in [('SOL_TEAM_STATE.json', 'agents'), ('AGENT_BOARD.json', 'local_roles')]:
        if name.endswith(suffix):
            data[key] = [a for a in data.get(key, []) if a.get('id') not in {r['id'] for r in roles}] + roles
    if name == 'AI_AND_DATA_ATTRIBUTION_LOG.json':
        data['ai_contributions'] = [a for a in data['ai_contributions'] if a.get('checkpoint') != ID]
        data['ai_contributions'].append(dict(actor='Astra (Orchestrator) and three GPT-6.1 Sol medium local workers',
            recorded_at=STAMP, checkpoint=ID, roles=roles, scope=implemented + ['Root integration, CUA verification and evidence.'],
            files=changed_files, scientific_values_generated=False, new_datasets_acquired=False,
            data_usage_note='Existing source catalogs, URLs, payloads and attribution unchanged; see catalog hashes and prior checkpoint.',
            human_verification='pending'))
    write(name, data)

# No circular references: manifest excludes itself and mutable state documents.
prior_paths = {f['path'] for f in read('evidence/planet_explorer/SOURCE_MANIFEST.json')['files']}
paths = prior_paths | set(changed_files) | {p.relative_to(ROOT).as_posix() for p in (ROOT / PREFIX).iterdir()
    if p.is_file() and p.name != 'SOURCE_MANIFEST.json'}
write(PREFIX + 'SOURCE_MANIFEST.json', dict(recorded_at=STAMP,
    scope='Retained prior implementation/data identities plus current navigation source, documentation and evidence.',
    files=[identity(p) for p in sorted(paths) if (ROOT / p).is_file()]))
print(json.dumps(dict(checkpoint=ID, built_js=built, screenshots=shots), indent=2))
