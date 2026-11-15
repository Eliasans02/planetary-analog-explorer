import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import type { ResearchRegion } from '../../data/globalAnalogs';
import { formatCoordPair } from '../earth-analogs/types';
import { RegionSelect } from './ResearchRegionControl';
import { missionTargets, type MissionState } from './unifiedTypes';
import './guided-mission.css';

export function GuidedMission({ mission, discovery, error, onRetry, onStep, onClose, onEvidence, regions, regionId, onRegionChange, regionError }: {
  mission: MissionState;
  discovery: EarthDiscovery | null;
  error?: string;
  onRetry: () => void;
  onStep: (body: MissionState['body'], step: number) => void;
  onClose: () => void;
  onEvidence: () => void;
  regions: ResearchRegion[];
  regionId: string;
  onRegionChange: (id: string) => void;
  regionError?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const chosen = missionTargets[mission.body];
  const region = regions.find(item => item.id === regionId);
  const candidate = discovery?.candidates.find(item => item.comparisons[chosen.target]?.rank === 1);
  const comparison = candidate?.comparisons[chosen.target];
  const stepTitles = [`Begin at ${chosen.name}`, 'Read the planetary terrain', region ? `Arrive in ${region.country}` : 'Find its Earth counterpart', 'Compare the evidence'];
  const descriptions = [
    `Orbit ${mission.body === 'moon' ? 'the Moon' : 'Mars'} and find the highlighted source site. ${region ? `${region.mission_title}: investigate ${region.theme.toLowerCase()} in ${region.name}.` : 'Follow its measured terrain to an exploratory Earth candidate.'}`,
    `Explore the prepared ${chosen.source} terrain. This native context covers a different extent from the 600 m comparison window. ${region ? 'The planetary target is a terrain reference; the paper does not claim these exact two locations are equivalent.' : ''}`,
    region ? region.finding : `This Ustyurt window ranks first among ${discovery?.domain.eligible_count.toLocaleString('en-US') ?? '1,600'} searched windows. This is a regional terrain candidate, not a global-best claim.`,
    'Rotate both measured surfaces together. Shared colours, axes, contours and profiles show the similarities and differences. The rank covers this region only.',
  ];
  useEffect(() => { heading.current?.focus({ preventScroll: true }); setAnswer(null); }, [mission.step, regionId]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);
  return <section className={`mission-card ${mission.step < 0 ? 'mission-chooser' : ''}`} aria-label="Guided mission">
    <div className="mission-eyebrow"><span><Compass size={13} aria-hidden="true" /> FIELD NOTES / {mission.step < 0 ? 'CHOOSE YOUR EXPEDITION' : `0${mission.step + 1} OF 04`}</span><button type="button" onClick={onClose} aria-label="End guided mission"><X size={16} /></button></div>
    <h2 ref={heading} tabIndex={-1}>{mission.step < 0 ? 'Two worlds. One investigation.' : stepTitles[mission.step]}</h2>
    {mission.step < 0 ? <>
      <p>Choose an Earth region, then follow a planetary landscape through four interactive stops to published research and measured terrain.</p>
      <RegionSelect regions={regions} regionId={regionId} onChange={onRegionChange} id="mission-region" />
      {region && <p>{region.mission_title} · {region.theme}</p>}
      <div className="mission-choices">{(region?.bodies ?? ['moon', 'mars'] as const).map(body => <button key={body} type="button" disabled={!discovery} onClick={() => onStep(body, 0)}><span>{body === 'moon' ? 'LUNAR EXPEDITION' : 'MARTIAN EXPEDITION'}</span><strong>{missionTargets[body].name}</strong><ArrowRight size={17} /></button>)}</div>
      {regionError && <p role="alert">{regionError}<button onClick={onRetry}>Retry expeditions</button></p>}
      {!discovery && <p role={error ? 'alert' : 'status'}>{error ?? 'Preparing the verified mission evidence…'}{error && <button type="button" onClick={onRetry}>Retry mission data</button>}</p>}
    </> : <>
      <p>{descriptions[mission.step]}</p>
      {region && mission.step === 2 && <>
        <a className="mission-research-link" href={region.papers[0].url} target="_blank" rel="noreferrer">{region.papers[0].authors} · {region.papers[0].year} · Read the paper ↗</a>
        <fieldset className="mission-checkpoint"><legend>{region.question}</legend>{region.choices.map((choice, index) => <button key={choice.label} type="button" aria-pressed={answer === index} onClick={() => setAnswer(index)}>{choice.label}</button>)}</fieldset>
        {answer !== null && <p className="mission-feedback" role="status"><strong>{region.choices[answer].correct ? 'Evidence supported. ' : 'Reconsider the evidence. '}</strong>{region.choices[answer].feedback}</p>}
      </>}
      {!(region && mission.step === 2) && <div className="mission-fact">{mission.step < 2 ? <><span>MEASURED SOURCE</span><strong>{chosen.source}</strong></> : <><span>{mission.step === 2 ? 'EARTH COORDINATES' : `REGIONAL RANK #${comparison?.rank ?? '—'} · EXPLORATORY DISTANCE`}</span><strong>{mission.step === 2 && candidate ? formatCoordPair(candidate.latitude, candidate.longitude, 4) : comparison?.distance.toFixed(4)}</strong></>}</div>}
      <div className="mission-progress" aria-label={`Step ${mission.step + 1} of 4`}>{stepTitles.map((title, index) => <button type="button" key={title} aria-label={`Mission step ${index + 1}: ${title}`} aria-current={index === mission.step ? 'step' : undefined} onClick={() => onStep(mission.body, index)} />)}</div>
      <div className="mission-navigation"><button type="button" onClick={() => onStep(mission.body, mission.step - 1)}><ArrowLeft size={14} /> Back</button><button className="mission-next" type="button" onClick={() => mission.step === 3 ? onEvidence() : onStep(mission.body, mission.step + 1)}>{mission.step === 3 ? 'Open evidence & report' : 'Continue mission'}<ArrowRight size={14} /></button></div>
      <small>{region && mission.step === 2 ? region.limitation : mission.step === 3 ? 'Topographic comparison only. Published biological and chemical findings are separate evidence.' : 'Explore freely between stops. Press Esc to end the mission.'}</small>
    </>}
  </section>;
}
