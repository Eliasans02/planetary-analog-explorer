"""Persist the observed Sol handoff after successful local engineering checks.

This writes orchestration/attribution records only. It cannot grant human PASS,
publish scientific assets, or mark the hackathon implementation complete.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
if (ROOT / 'evidence/real_surface_ui/REAL_SURFACE_CHECKPOINT.json').exists():
    raise SystemExit('This historical Gemini-to-Sol checkpoint is superseded by REAL_SURFACE_CHECKPOINT.json; do not overwrite newer state.')


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def identity(path):
    payload = (ROOT / path).read_bytes()
    return {'path': path, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}


checks = read('evidence/local_b04_checks/app/combined_final_checks.json')
assert isinstance(checks, list)
for command in ['typecheck', 'test', 'test:config', 'build']:
    matches = [row for row in checks if row['command'] in [f'npm run {command}', f'npm.cmd run {command}']]
    assert matches and matches[-1]['exit_code'] == 0, f'Missing successful {command}'
test_row = next(row for row in reversed(checks) if row['command'] in ['npm run test', 'npm.cmd run test'])
log_path = Path(test_row['log'])
if not log_path.is_absolute():
    log_path = ROOT / log_path
test_log = re.sub(r'\x1b\[[0-9;]*m', '', log_path.read_text(encoding='utf-8-sig'))
counts = re.findall(r'Tests\s+(\d+) passed', test_log)
assert counts, 'Unit-test count not found in actual log'
frontend_count = int(counts[-1])
pipeline = read('evidence/local_a05_checks/results.json')['full_pytest']
assert pipeline['exit_code'] == 0
now = datetime.now(timezone.utc).isoformat()
event_id = 'SOL_LOCAL_HANDOFF_VERIFIED_2026-11-14'
archive = identity('archives/gemini-handoff-2026-11-14.zip')
assert archive['sha256'] == '17b158d12d7cb663040b7adda4bb495f2cd4af1f8e1b5dfbbaf9039a5d508f7a'
preview = read('evidence/local_b04_checks/preview/observation.json')
audit = read('docs/research/NATIVE_DEM_AUDIT.json')
manifest = []
for folder in ['data-pipeline/src', 'data-pipeline/tests', 'web-client/src', 'web-client/scripts', 'shared']:
    for path in sorted((ROOT / folder).rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts and path.suffix in {'.py', '.ts', '.tsx', '.json', '.mjs', '.css'}:
            manifest.append(identity(path.relative_to(ROOT).as_posix()))
for path in ['data-pipeline/fetch_and_score.py', 'data-pipeline/pyproject.toml', 'web-client/package.json', 'web-client/package-lock.json', 'web-client/vite.config.ts', 'web-client/vitest.config.ts', 'web-client/tsconfig.json', 'web-client/tsconfig.shared.generated.json']:
    if (ROOT / path).exists():
        manifest.append(identity(path))
write('evidence/local_b04_checks/SOL_SOURCE_MANIFEST.json', {'recorded_at': now, 'scope': 'Current local source after Sol patches; not the immutable Gemini baselines', 'files': manifest})
checkpoint = {
    'id': event_id, 'recorded_at': now, 'execution_mode': 'parallel_local_sol_6_1_medium',
    'source_archive': archive, 'source_archive_scope': 'Latest received Gemini A04 (17 files), B03 (36 files), available visible conversations/reports, and orchestration context; not a complete Google account history export.',
    'source_manifest': 'evidence/local_b04_checks/SOL_SOURCE_MANIFEST.json',
    'pipeline_tests_passed': pipeline['tests'], 'frontend_tests_passed': frontend_count,
    'frontend_typecheck': 'PASS', 'frontend_config_tests': 'PASS', 'frontend_build': 'PASS',
    'asset_verification': 'FAIL_MISSING_PREPARED_DATASET',
    'independent_review': 'Both concrete score and splat numeric findings fixed and independently re-reviewed; bounded source scope only',
    'independent_review_path': 'evidence/local_b04_checks/independent-review.md',
    'science_audit': 'docs/research/NATIVE_DEM_AUDIT.md',
    'publication_gates': audit['publication_gates'],
    'real_ground_verified': False, 'performance_verified': False,
    'phase5_committed': False, 'human_pass': {'Dev_A': False, 'Dev_B': False},
    'preview_evidence': 'evidence/local_b04_checks/preview/observation.json',
    'continuation_prompt': 'prompts/ASTRA_SOL_LOOP.md',
    'no_unattended_scheduler': True,
}
write('evidence/local_b04_checks/INTEGRATION_CHECKPOINT.json', checkpoint)
team = read('docs/orchestration/SOL_TEAM_STATE.json')
for row in team['agents']:
    row['status'] = 'completed_bounded_implementation_and_checks'
for row in [
    {'id': '/root/sol_science_review', 'role': 'Independent native DEM and science audit', 'writes': ['docs/research/NATIVE_DEM_AUDIT.*', 'evidence/native_dem_audit'], 'status': 'completed'},
    {'id': '/root/sol_review', 'role': 'Independent code and security review', 'writes': ['evidence/local_b04_checks/independent-review.md'], 'status': 'completed'},
]:
    if not any(agent['id'] == row['id'] for agent in team['agents']):
        team['agents'].append(row)
team.update(updated_at=now, source_archive_in_progress=False, source_archive=archive, current_checkpoint=checkpoint,
    continuation_prompt='prompts/ASTRA_SOL_LOOP.md', next_gate='Resolve native frame / absolute height / exact ENU contract before source-backed ground assets; retain human acceptance gate')
write('docs/orchestration/SOL_TEAM_STATE.json', team)

for path in ['REPO_STATE.json', 'docs/orchestration/ASTRA_LOOP_STATE.json', 'docs/orchestration/AGENT_BOARD.json']:
    state = read(path)
    state.update(updated_at=now, execution_mode='parallel_local_sol_6_1_medium', active_team_state='docs/orchestration/SOL_TEAM_STATE.json',
        current_checkpoint=checkpoint, phase5_committed=False, local_preview={'url': preview['url'], 'source_directory': 'web-client', 'status': 'RUNNING_LOCAL_ENGINEERING_PREVIEW', 'evidence': checkpoint['preview_evidence'], 'real_ground_verified': False},
        state_update_kind='Observed engineering checkpoint; not PHASE_5 or scientific acceptance')
    state.setdefault('status_history', []).append({'id': event_id, 'recorded_at': now, 'evidence': 'evidence/local_b04_checks/INTEGRATION_CHECKPOINT.json'})
    if path == 'REPO_STATE.json':
        for key, evidence in [('Dev_A_fetch_and_score', 'evidence/local_a05_checks/results.json'), ('Dev_B_Viewport3D', 'evidence/local_b04_checks/app/combined_final_checks.json')]:
            state['modules'][key].update(status='IN_PROGRESS', implementation_location='local_repository', local_integration_complete=True,
                independent_local_execution_verified=True, human_pass=False, current_checks=evidence, hotfix_status='LOCAL_SOL_PATCHES_TESTED_SCIENTIFIC_AND_HUMAN_ACCEPTANCE_PENDING')
        state['modules']['scientific_demo_dataset'].update(status='BLOCKED', reason='Real NASA/USGS raw DEMs acquired and audited; native frame, absolute height, exact ENU, quality policy and scoring calibration remain unresolved.')
        state['modules']['raw_data_acquisition'].update(status='IN_PROGRESS', raw_bytes_verified=True, scientific_interpretation_verified=False, evidence_path='docs/research/NATIVE_DEM_AUDIT.json')
        state['next_gate'] = checkpoint['publication_gates'] + ['Real comparison profile calibration and comparable evidence', 'Explicit human Dev_A and Dev_B PASS']
        state['local_fallback_code_written'] = True
        for row in state.get('browser_dispatch', {}).values():
            row['historical_only'] = True
    elif path.endswith('ASTRA_LOOP_STATE.json'):
        state['historical_browser_actions'] = state.get('historical_browser_actions', state.get('actions', []))
        state['actions'] = [{'id': 'LOCAL_NATIVE_FRAME_RELOOP', 'status': 'PENDING', 'action': team['next_gate'], 'evidence': 'docs/research/NATIVE_DEM_AUDIT.md'}]
        state['next_action'] = state['actions'][0]
        state['parallel_actions'] = []
        state['local_checks_status'] = checkpoint
        state['handoff_priorities'] = checkpoint['publication_gates']
        state['implementation_created_by_this_update'] = True
        state['browser_status'].update(status='LOCAL_PREVIEW_VERIFIED', execution_model='Native parallel Sol agents; Gemini sessions preserved as historical evidence')
        for row in state.get('context_inputs', []):
            if (ROOT / row['path']).is_file():
                row.update(identity(row['path']))
    else:
        state['orchestration_model'] = 'Astra with separate local GPT-6.1 Sol medium instances; maximum three concurrent workers plus orchestrator'
        state['local_roles'] = team['agents']
        for row in state['roles']:
            row['historical_only'] = True
            row['previous_observed_status'] = row['status']
            row['status'] = 'ARCHIVED_GEMINI_WORK_SUPERSEDED_BY_LOCAL_SOL' if row.get('service') == 'Google AI Studio' else 'HISTORICAL_ADVISORY_NOT_DESIGN_ACCEPTANCE'
            row['next_action'] = 'Use current local Sol checkpoint; do not repeat historical browser dispatch.'
    write(path, state)

attribution = read('AI_AND_DATA_ATTRIBUTION_LOG.json')
attribution.update(updated_at=now, current_checkpoint=checkpoint, local_fallback_code_written=True)
if not any(row.get('event_id') == event_id for row in attribution['ai_contributions']):
    attribution['ai_contributions'].append({
        'event_id': event_id, 'recorded_at': now, 'actor': 'Astra (Orchestrator) with GPT-6.1 Sol medium instances',
        'source_author': 'Gemini Hydrogen: immutable A04 and B03 baselines',
        'new_work_authorship': 'Astra integration and orchestration; Sol pipeline, app, viewer, science audit, and independent review',
        'scope': ['Local source import and immutable archive', 'Pipeline URL/terrain boundary fixes', 'Selection and semantic score validation', 'Shared-root/configuration checks', 'Asset integrity, numeric safety, renderer cleanup', 'Native DEM audit and local UI verification'],
        'file_manifest': checkpoint['source_manifest'], 'evidence': 'evidence/local_b04_checks/INTEGRATION_CHECKPOINT.json',
        'scientific_values_generated': False, 'synthetic_fixtures': 'TEST_ONLY; never published as observations',
        'human_verification': 'pending',
    })
for receipt_path, source_id in [('docs/research/LOCAL_DEM_ROI_ACQUISITION.json', 'lola_site04_published_roi_archive'), ('docs/research/LOCAL_DEM_EARTH_ACQUISITION.json', 'usgs_3dep_n20w156_20250611')]:
    receipt = read(receipt_path)
    sources = attribution['data_usage']['sources']
    if not any(row.get('source_id') == source_id for row in sources):
        sources.append({'source_id': source_id, 'url': receipt['canonical_url'], 'bytes': receipt['bytes'], 'sha256': receipt['sha256'], 'receipt': receipt_path, 'status': 'downloaded_and_native_audited_not_published_as_features_or_scores'})
attribution['data_usage'].update(status='real_raw_payloads_and_native_geometry_audited_scientific_publication_blocked', scientific_payloads_downloaded=True,
    native_payload_audit='docs/research/NATIVE_DEM_AUDIT.json', published_measurements_extracted=False, scores_calculated=False, scientific_assets_created=False)
write('AI_AND_DATA_ATTRIBUTION_LOG.json', attribution)
print(json.dumps({'checkpoint': event_id, 'python_tests': pipeline['tests'], 'frontend_tests': frontend_count, 'source_files_hashed': len(manifest), 'phase5_committed': False}))
