import { useRef, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import type { ResearchRegion } from '../../data/globalAnalogs';
import './research-region.css';

export function RegionSelect({ regions, regionId, onChange, id = 'earth-region' }: {
  regions: ResearchRegion[]; regionId: string; onChange: (id: string) => void; id?: string;
}) {
  return <label className="research-select" htmlFor={id}><span>EARTH EXPEDITION</span>
    <select id={id} value={regionId} onChange={event => onChange(event.target.value)}>
      <option value="ustyurt">Ustyurt · Kazakhstan</option>
      {regions.map(region => <option key={region.id} value={region.id}>{region.name} · {region.country}</option>)}
    </select>
  </label>;
}
export function ResearchRegionControl({ regions, regionId, onChange, error, onRetry }: {
  regions: ResearchRegion[]; regionId: string; onChange: (id: string) => void; error?: string; onRetry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const region = regions.find(item => item.id === regionId);
  const close = () => { dialog.current?.close(); setOpen(false); };
  return <div className="research-control">
    {error && <p className="research-load-error" role="alert">{error} <button onClick={onRetry}>Retry worldwide expeditions</button></p>}
    <RegionSelect regions={regions} regionId={regionId} onChange={onChange} />
    {region && <button type="button" className="research-open" onClick={() => { setOpen(true); dialog.current?.showModal(); }}><BookOpen size={13} /> Research brief</button>}
    <dialog ref={dialog} className="research-dialog" onClose={() => setOpen(false)} aria-label="Published research brief">
      {region && open && <>
        <button className="research-close" aria-label="Close research brief" onClick={close}><X size={18} /></button>
        <span className="research-kicker">{region.country} / {region.theme}</span>
        <h2>{region.mission_title}</h2>
        <h3>Published finding</h3><p>{region.finding}</p>
        <h3>What the analogy does not establish</h3><p>{region.limitation}</p>
        <h3>Our terrain survey</h3><p>A separate 6 km square around the reference coordinate. Its 600 m windows compare elevation shape with NASA terrain. The publication’s biological, chemical and geophysical measurements are not inferred from these heights.</p>
        <p className="research-coordinate">{Math.abs(region.latitude).toFixed(5)}° {region.latitude < 0 ? 'S' : 'N'} · {Math.abs(region.longitude).toFixed(5)}° {region.longitude < 0 ? 'W' : 'E'}<br />{region.coordinate_note} <a href={region.coordinate_source_url} target="_blank" rel="noreferrer">Coordinate source ↗</a></p>
        <h3>Read the research</h3>
        {region.papers.map(paper => <a className="research-paper" key={paper.doi} href={paper.url} target="_blank" rel="noreferrer"><strong>{paper.title} ↗</strong><span>{paper.authors} · {paper.year}</span><small>DOI: {paper.doi}</small></a>)}
        <a href={region.agency_url} target="_blank" rel="noreferrer">Agency field context ↗</a>
      </>}
    </dialog>
  </div>;
}
