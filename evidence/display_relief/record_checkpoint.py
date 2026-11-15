"""Record bounded Mars-source/display-relief evidence after explicit root approval.

Prepare-only until invoked with --record. All input checks precede any writes.
Historical evidence directories and mutable orchestration ledgers are excluded
from the current source manifest; their checkpoint history is preserved.
"""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'evidence/display_relief/'
ID = 'MARS_SOURCE_RELIEF_VERIFIED_2026-11-14'
PREVIOUS = 'evidence/surface_imagery/'
STATES = ['REPO_STATE.json', 'docs/orchestration/ASTRA_LOOP_STATE.json',
          'docs/orchestration/SOL_TEAM_STATE.json', 'docs/orchestration/AGENT_BOARD.json',
          'AI_AND_DATA_ATTRIBUTION_LOG.json']
SOURCE_URL = 'https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/mars/Mars.jpg'
SOURCE_SHA = '12ec6bf02ebd42a246edc778cb2ce8c595b4d9f0892badf0bfff8abb2303c780'


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))


def identity(path):
    raw = (ROOT / path).read_bytes()
    return dict(path=path, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def logtext(name):
    return (ROOT / PREFIX / name).read_text(encoding='utf-8-sig')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record', action='store_true', help='Persist the root-approved, final verified checkpoint.')
    args = parser.parse_args()
    if not args.record:
        parser.error('Prepare-only script: explicit --record is required after root approval.')
    stamp = datetime.now(timezone.utc).isoformat()

    # Verify all required identities and reported evidence before touching ledgers.
    shots = []
    for name, expected_sha, expected_bytes in [
        ('mars', '3d8126ffa5d81d47ab5dbfb4f3f09c9454557be23f7c956524960bb6f014d886', 136030),
        ('ground', '3ff2461875a5914bd18ce8acb84575e2abf42d6604603d22f95a89ea55a55394', 134885),
        ('moon', '21905e2cd4dda5d9bcfc6095896cea8b389b1a85975932d5e957f372fc56746d', 131052),
    ]:
        shot = identity(PREFIX + 'relief-' + name + '.jpg')
        assert (shot['sha256'], shot['bytes']) == (expected_sha, expected_bytes), shot
        shots.append(shot)
    html = (ROOT / 'web-client/dist/index.html').read_text(encoding='utf-8')
    assert '/assets/index-BWJd2ss1.js' in html
    assert '/assets/index-DxUfEtlc.css' in html
    built = identity('web-client/dist/assets/index-BWJd2ss1.js')
    built_css = identity('web-client/dist/assets/index-DxUfEtlc.css')
    assert re.search(r'Test Files\s+18 passed', logtext('test.txt'))
    assert re.search(r'Tests\s+165 passed', logtext('test.txt'))
    assert '8 passed' in logtext('python-tests.txt')
    assert 'PendingDeprecationWarning' in logtext('python-tests.txt')
    assert 'Verified published analysis for 7 surfaces; no files changed' in logtext('analysis-check.txt')
    assert built['path'].split('/')[-1] in logtext('build.txt')
    assert built_css['path'].split('/')[-1] in logtext('build.txt')
    for name in ['typecheck.txt', 'verify-surfaces.txt', 'verify-planets.txt']:
        assert len(logtext(name).strip()) > 0
    required_review = identity('docs/research/MARS_DISPLAY_REVIEW.md')
    assert re.search(r'Test Files\s+2 passed', logtext('light-targeted.txt'))
    assert re.search(r'Tests\s+5 passed', logtext('light-targeted.txt'))
    targeted = dict(tests_passed=5, files_passed=2, log=PREFIX + 'light-targeted.txt',
                    command='npx vitest run src/terrain/surfaceAppearance.test.ts src/terrain/surfaceUv.test.ts',
                    scope='Focused surface appearance/UV tests after presentation-only edits', exit_code=0)

    catalogs = [identity('web-client/public/data/' + name + '.json') for name in
                ('planet_catalog', 'surface_catalog', 'surface_analysis', 'surface_imagery')]
    previous_checkpoint = read(PREVIOUS + 'SURFACE_COLOR_CHECKPOINT.json')
    old_catalogs = {item['path']: item for item in previous_checkpoint['catalogs']}
    for item in catalogs[1:3]:
        assert item['sha256'] == old_catalogs[item['path']]['sha256'], item
    baseline = read(PREVIOUS + 'SOURCE_MANIFEST.json')['files']
    unchanged = []
    for old in baseline:
        path = old['path']
        if path.startswith('web-client/public/assets/surfaces/') or (
            path.startswith('web-client/public/assets/surface-imagery/') and '/local-ortho/' in path
        ):
            current = identity(path)
            assert current['sha256'] == old['sha256'], f'Native DEM/local HiRISE changed: {path}'
            unchanged.append(current)
    assert unchanged, 'No native terrain or local imagery baseline entries were checked.'
    planets = read('web-client/public/data/planet_catalog.json')
    mars = next(planet for planet in planets['planets'] if planet['id'] == 'mars')
    assert mars['displacement'] is None
    native = next(texture for texture in mars['textures'] if texture['label'] == 'Native')
    assert (native['width'], native['height'], native['sha256']) == (1440, 720, SOURCE_SHA)
    assert {texture['label'] for texture in mars['textures']} == {'1K', 'Native'}
    assert identity('web-client/public' + native['path'])['sha256'] == SOURCE_SHA
    provenance_path = 'web-client/public' + mars['provenance']['path']
    provenance = read(provenance_path)
    receipt = provenance['raw_source_receipts'][0]
    assert receipt['canonical_url'] == SOURCE_URL and receipt['sha256'] == SOURCE_SHA
    assert provenance['source_sha256'] == SOURCE_SHA
    assert provenance['source_dimensions'] == [1440, 720]
    imagery = read('web-client/public/data/surface_imagery.json')
    assert imagery['catalog_sha256'] == catalogs[1]['sha256']
    for record in imagery['records']:
        for layer in record['layers']:
            if record['surface_id'].startswith('mars-') and layer['id'] == 'orbital-color':
                assert layer['source_url'] == mars['source_url']
    ledgers = {path: read(path) for path in STATES}

    commands = [dict(command='npm run ' + name, cwd='web-client', exit_code=0,
                     log=PREFIX + logfile, scope=scope) for name, logfile, scope in [
        ('test', 'test.txt', '165 tests/18 files before final presentation-only markup/CSS edits'),
        ('typecheck', 'typecheck.txt', 'Final source including presentation edits'),
        ('build', 'build.txt', 'Final browser-observed production bundle'),
        ('verify:surfaces', 'verify-surfaces.txt', 'Published native terrain asset integrity'),
        ('verify:planets', 'verify-planets.txt', 'Published planet image/DEM integrity and actual dimensions'),
    ]]
    commands += [dict(command='previews/a04/.venv/Scripts/python.exe -m pytest data-pipeline/tests/test_planet_assets.py data-pipeline/tests/test_surface_imagery.py',
                      cwd='.', exit_code=0, log=PREFIX + 'python-tests.txt'),
                 dict(command='previews/a04/.venv/Scripts/python.exe data-pipeline/analyze_surfaces.py --check',
                      cwd='.', exit_code=0, log=PREFIX + 'analysis-check.txt')]
    checks = dict(recorded_at=stamp, execution_location='local_repository', commands=commands,
        frontend_tests_passed=165, frontend_files_passed=18,
        full_frontend_suite_scope='Before final presentation-only markup/CSS edits; not rerun after those edits.',
        final_typecheck_and_build_include_presentation_edits=True,
        final_targeted_tests=targeted, python_tests_passed=8, analysis_surfaces_verified_unchanged=7,
        native_terrain_and_local_hirise_hashes_unchanged=unchanged,
        built_js=built, built_css=built_css, command_exit_codes_reported_by_root=True,
        warnings=[
            'Vite main chunk exceeds 500 kB; final build passed.',
            'Python: 16 Rasterio transform-multiplication PendingDeprecationWarnings; 8 tests passed.',
            'Browser: 3 warnings from external LROC QuickMap reference URLs; no local application warning/error.',
        ],
        scientific_source_samples_invented=False, display_source_replaced=True,
        scientific_analysis_changed=False, global_mars_dem_added=False,
        scored_dataset_verify_assets='UNSATISFIED_MISSING_CALIBRATED_DATASET_NOT_RERUN',
        performance_benchmark='NOT_PERFORMED', human_pass=dict(Dev_A=False, Dev_B=False),
        phase5_committed=False, scheduler_created=False, daemon_running=False)
    browser = dict(recorded_at=stamp, observer='Astra root through documented internal-browser CUA',
        url='http://127.0.0.1:4173/', final_script_observed='/assets/index-BWJd2ss1.js',
        final_css_observed='/assets/index-DxUfEtlc.css', screenshots=shots,
        console=dict(external_reference_warning_count=3, external_reference='LROC QuickMap reference URLs',
                     local_application_warning_count=0, local_application_error_count=0),
        observations=[
            'Warm NASA published Mars source displayed; toolbar and map status do not overlap the globe.',
            'Mars 1K/Native, Original image/Color + shape, and display-light -50 to -45 controls work.',
            'Split view retains independent Moon 4K and Mars Native source selections.',
            'Nobile Moon lit/unlit, light slider and compact surface panel remain clear.',
            'Gale defaults to published enhanced local imagery and switches to NASA orbital color.',
            'First-person W changes HUD Z to -0.8 m; pause followed by imagery/lighting toggles preserves the position and paused mode.',
            'All displayed terrain-analysis numbers remain unchanged.',
        ], limitations=[
            'Visual/functional browser observations, not GPU pixel equality or color-calibrated photometry.',
            'Display lighting is neutral visualization illumination, not an astronomical Sun model.',
            'Mars remains a spherical globe with no global DEM; local DEM windows retain 1x source relief.',
            'Global image placement is empirical and approximate; no independent local geodetic registration certification.',
            'No FPS/RAM benchmark or new native-pointer-lock acceptance claim.',
        ])
    source_attribution = dict(checkpoint=ID, recorded_at=stamp,
        source_page='https://science.nasa.gov/3d-resources/mars/', source_url=SOURCE_URL,
        source_sha256=SOURCE_SHA, source_bytes=receipt['bytes'], source_dimensions=[1440, 720],
        credit=provenance['credit'], complete_source_receipt=receipt,
        integrity_status=provenance['integrity_status'], provenance=identity(provenance_path),
        source_native=identity('web-client/public' + native['path']),
        processing=provenance['processing'],
        orientation_verification=provenance['display_orientation_verification'],
        limitations=provenance['limitations'],
        replaced_source='ASU published MDIM display pixels were authentically maroon/purple; replaced with NASA published display product, without hue/saturation correction.',
        earth_moon_native_terrain_local_hirise_and_analysis_unchanged=True,
        scientific_values_invented=False, new_display_source_acquired=True,
        research_review=required_review)
    implemented = [
        'Replaced Mars global display imagery with NASA Viking/USGS/JPL-Caltech published source; exact Native 1440x720 JPEG and downsampled 1K only.',
        'Regenerated approximate Mars orbital drapes from that source; retained local HiRISE images and all native DEM/analysis values.',
        'Added neutral color-plus-shape and original-image globe modes, independent display-light control and per-body available source resolution.',
        'Added neutral DEM-slope lighting and original-image surface modes, camera-preserving image/lighting changes and compact controls.',
        'Reserved separate toolbar, fitted-canvas and status rows so globe controls cannot occlude the planet.',
    ]
    remaining = [
        'Acquire broader and finer source-backed terrain/local imagery coverage.',
        'Acquire and register a real global Mars DEM before claiming global topographic relief.',
        'Calibrate comparable spatial support, body-frame/ENU registration and scientific analog similarity.',
        'Reconstruct and register source-backed Gaussian splats.',
        'Benchmark foreground FPS/RAM and native pointer lock in a supporting browser.',
        'Receive human Dev_A and Dev_B acceptance.',
    ]
    checkpoint = dict(id=ID, recorded_at=stamp, phase='PHASE_4_ENGINEERING_VERIFIED_HUMAN_PASS_PENDING',
        phase5_committed=False, human_pass=dict(Dev_A=False, Dev_B=False),
        execution_mode='parallel_local_sol_6_1_medium_with_astra_root', url=browser['url'],
        contracts=previous_checkpoint['contracts'], catalogs=catalogs, built_js=built, built_css=built_css,
        implemented=implemented, remaining=remaining,
        checks=dict(frontend_tests_passed=165, frontend_files_passed=18,
            full_suite_before_final_presentation_edits=True, final_targeted_tests=targeted,
            python_tests_passed=8, typecheck='PASS', build='PASS', verify_planets='PASS',
            verify_surfaces='PASS', analysis_unchanged_surfaces=7,
            browser='FUNCTIONAL_SOURCE_COLOR_RELIEF_CONTROLS_AND_NAVIGATION_OBSERVATIONS',
            performance_benchmark='NOT_PERFORMED',
            scored_dataset_verify_assets='UNSATISFIED_MISSING_CALIBRATED_DATASET_NOT_RERUN'),
        evidence=[PREFIX + name for name in ['check-status.json', 'browser-observation.json',
                    'source-attribution.json', 'SOURCE_MANIFEST.json']] + [required_review['path']],
        screenshots=shots, scheduler_created=False, daemon_running=False)
    roles = [dict(id='/root/' + name, role=role, model='gpt-6.1-sol', reasoning_effort='medium',
                  status='completed_bounded_task', evidence=PREFIX + 'DISPLAY_CHECKPOINT.json')
             for name, role in [
                 ('mars_color_audit', 'NASA source audit/acquisition, unchanged science checks and image asset pipeline'),
                 ('orbital_relief_render', 'Neutral globe lighting, source-resolution display, layout and independent renderer review'),
                 ('surface_relief_render', 'Neutral native DEM imagery lighting, camera/resource lifecycle and compact surface controls'),
             ]]

    write(PREFIX + 'check-status.json', checks)
    write(PREFIX + 'browser-observation.json', browser)
    write(PREFIX + 'source-attribution.json', source_attribution)
    write(PREFIX + 'DISPLAY_CHECKPOINT.json', checkpoint)
    for path, data in ledgers.items():
        old = data.get('current_checkpoint')
        history = data.setdefault('checkpoint_history', [])
        if old and old['id'] != ID and not any(item['id'] == old['id'] for item in history):
            history.append(old)
        data.update(current_checkpoint=checkpoint, updated_at=stamp, phase=checkpoint['phase'],
                    phase5_committed=False, scheduler_created=False, daemon_running=False,
                    state_update_kind='ENGINEERING_CHECKPOINT_NOT_HUMAN_ACCEPTANCE')
        if 'local_preview' in data:
            data['local_preview'] = dict(url=browser['url'], source_directory='web-client',
                status='RUNNING_NASA_MARS_SOURCE_RELIEF_BUILD', evidence=PREFIX + 'browser-observation.json',
                real_native_relief_verified=True, global_mars_dem_verified=False, exact_enu_or_splat_verified=False)
        if 'next_gate' in data:
            data['next_gate'] = 'Human acceptance pending; broader scientific coverage, calibration and reconstruction remain.'
        if path == 'REPO_STATE.json':
            data['modules']['planet_explorer'].update(evidence=checkpoint['evidence'],
                engineering_checks='VERIFIED_WITH_RUNTIME_LIMITATIONS', latest_checkpoint=ID)
        if path.endswith('ASTRA_LOOP_STATE.json'):
            data.update(next_action=remaining[0], handoff_priorities=remaining,
                        local_checks_status=checkpoint['checks'], observation_time_utc=stamp)
        for suffix, key in [('SOL_TEAM_STATE.json', 'agents'), ('AGENT_BOARD.json', 'local_roles')]:
            if path.endswith(suffix):
                data[key] = [entry for entry in data.get(key, []) if entry.get('id') not in {role['id'] for role in roles}] + roles
        if path == 'AI_AND_DATA_ATTRIBUTION_LOG.json':
            data['ai_contributions'] = [entry for entry in data.get('ai_contributions', []) if entry.get('checkpoint') != ID]
            data['ai_contributions'].append(dict(actor='Astra root and three GPT-6.1 Sol medium local workers',
                checkpoint=ID, recorded_at=stamp, roles=roles, scope=implemented,
                scientific_values_invented=False, scientific_derivatives_changed=False,
                new_display_source_acquired=True, data_attribution=PREFIX + 'source-attribution.json',
                human_verification='pending'))
            data['source_usage_checkpoints'] = [entry for entry in data.get('source_usage_checkpoints', [])
                if entry.get('checkpoint') != ID] + [source_attribution]
        write(path, data)

    # Only current source/artifacts/evidence. No old evidence dirs, state ledgers,
    # historical before snapshots, or manifest self-hashes (avoids circularity).
    paths = set()
    for directory in ['web-client/src', 'shared/schemas', 'shared/types',
                      'web-client/public/data', 'web-client/public/assets/planets',
                      'web-client/public/assets/surfaces', 'web-client/public/assets/surface-imagery',
                      'data-pipeline/tests', 'docs/research', 'web-client/scripts']:
        paths.update(path.relative_to(ROOT).as_posix() for path in (ROOT / directory).rglob('*')
                     if path.is_file() and '__pycache__' not in path.parts and '.pytest_cache' not in path.parts)
    paths.update(path.relative_to(ROOT).as_posix() for path in (ROOT / 'data-pipeline').glob('*.py'))
    paths.update(path.relative_to(ROOT).as_posix() for path in (ROOT / PREFIX).rglob('*')
                 if path.is_file() and 'before' not in path.relative_to(ROOT / PREFIX).parts
                 and '__pycache__' not in path.parts and path.name != 'SOURCE_MANIFEST.json'
                 and 'before-layout' not in path.name)
    for path in ['README.md', 'prompts/ASTRA_SOL_LOOP.md', 'docs/planet_explorer_contract.md',
                 'docs/native_surface_contract.md', 'web-client/package.json', 'web-client/package-lock.json',
                 'web-client/dist/index.html', built['path'], built_css['path']]:
        if (ROOT / path).is_file():
            paths.add(path)
    assert not set(STATES).intersection(paths)
    assert PREFIX + 'SOURCE_MANIFEST.json' not in paths
    write(PREFIX + 'SOURCE_MANIFEST.json', dict(recorded_at=stamp, checkpoint=ID,
        scope='Current implementation/contracts/source assets/docs and bounded current evidence only; old evidence dirs, before snapshots, mutable state ledgers and manifest self-hash excluded.',
        excluded_mutable_ledgers=STATES, baseline_comparison=PREVIOUS + 'SOURCE_MANIFEST.json',
        files=[identity(path) for path in sorted(paths)]))
    print(json.dumps(dict(checkpoint=ID, files=len(paths), screenshots=shots,
                         frontend_tests=165, python_tests=8, final_targeted_tests=targeted), indent=2))


if __name__ == '__main__':
    main()
