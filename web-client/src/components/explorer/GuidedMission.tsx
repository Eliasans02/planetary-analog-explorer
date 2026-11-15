import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import type { EarthDiscovery } from '@shared/types/earth-discovery';
import { missionTargets, type MissionState } from './unifiedTypes';
import './guided-mission.css';

export function GuidedMission({ mission, discovery, error, onRetry, onStep, onClose, onEvidence }: {
  mission: MissionState;
  discovery: EarthDiscovery | null;
  error?: string;
  onRetry: () => void;
  onStep: (body: MissionState['body'], step: number) => void;
  onClose: () => void;
  onEvidence: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const chosen = missionTargets[mission.body];
  const candidate = discovery?.candidates.find(item => item.comparisons[chosen.target]?.rank === 1);
  const comparison = candidate?.comparisons[chosen.target];
  const stepTitles = [`Begin at ${chosen.name}`, 'Read the planetary terrain', 'Find its Earth counterpart', 'Compare the evidence'];
  const descriptions = [
    `Orbit ${mission.body === 'moon' ? 'the Moon' : 'Mars'} and find the highlighted source site. This journey links its measured terrain to an exploratory Earth candidate.`,
    `Explore the prepared ${chosen.source} terrain. This native context covers a different extent from the 600 m window used in the comparison.`,
    `This Ustyurt window ranks first among ${discovery?.domain.eligible_count.toLocaleString('en-US') ?? '1,600'} searched windows. It is a terrain candidate within this region, not a claim of the best analog on Earth.`,
    'Rotate both measured surfaces together. The shared colours, axes, contours and profile reveal where the terrain agrees—and where it differs.',
  ];
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [mission.step]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);
  return <section className={`mission-card ${mission.step < 0 ? 'mission-chooser' : ''}`} aria-label="Guided mission">
    <div className="mission-eyebrow"><span><Compass size={13} aria-hidden="true" /> FIELD NOTES / {mission.step < 0 ? 'START HERE' : `0${mission.step + 1} OF 04`}</span><button type="button" onClick={onClose} aria-label="End guided mission"><X size={16} /></button></div>
    <h2 ref={heading} tabIndex={-1}>{mission.step < 0 ? 'Two worlds. One investigation.' : stepTitles[mission.step]}</h2>
    {mission.step < 0 ? <>
      <p>Follow a planetary landscape to a measured Earth candidate. Four interactive stops, with the sources and results ready to take away.</p>
      <div className="mission-choices">{(['moon', 'mars'] as const).map(body => <button key={body} type="button" disabled={!discovery} onClick={() => onStep(body, 0)}><span>{body === 'moon' ? 'LUNAR EXPEDITION' : 'MARTIAN EXPEDITION'}</span><strong>{missionTargets[body].name}</strong><ArrowRight size={17} /></button>)}</div>
      {!discovery && <p role={error ? 'alert' : 'status'}>{error ?? 'Preparing the verified mission evidence…'}{error && <button type="button" onClick={onRetry}>Retry mission data</button>}</p>}
    </> : <>
      <p>{descriptions[mission.step]}</p>
      <div className="mission-fact">{mission.step < 2 ? <><span>MEASURED SOURCE</span><strong>{chosen.source}</strong></> : <><span>{mission.step === 2 ? 'EARTH COORDINATES' : 'EXPLORATORY DISTANCE'}</span><strong>{mission.step === 2 && candidate ? `${candidate.latitude.toFixed(4)}° N · ${candidate.longitude.toFixed(4)}° E` : comparison?.distance.toFixed(4)}</strong></>}</div>
      <div className="mission-progress" aria-label={`Step ${mission.step + 1} of 4`}>{stepTitles.map((title, index) => <button type="button" key={title} aria-label={`Mission step ${index + 1}: ${title}`} aria-current={index === mission.step ? 'step' : undefined} onClick={() => onStep(mission.body, index)} />)}</div>
      <div className="mission-navigation"><button type="button" onClick={() => onStep(mission.body, mission.step - 1)}><ArrowLeft size={14} /> Back</button><button className="mission-next" type="button" onClick={() => mission.step === 3 ? onEvidence() : onStep(mission.body, mission.step + 1)}>{mission.step === 3 ? 'Open evidence & report' : 'Continue mission'}<ArrowRight size={14} /></button></div>
      <small>{mission.step === 3 ? 'Topography only · geology, climate and mission suitability are unverified.' : 'Explore freely between stops. Press Esc to end the mission.'}</small>
    </>}
  </section>;
}
