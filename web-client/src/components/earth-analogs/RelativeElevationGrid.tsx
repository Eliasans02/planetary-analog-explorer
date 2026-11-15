import { useRef, useState, type KeyboardEvent } from 'react';
import { elevationColor } from '../comparison/terrainComparisonMath';
import { formatNum } from './types';

export function RelativeElevationGrid({ title, subtitle, heights, gridSize }: {
  title: string; subtitle: string; heights: number[]; gridSize: number;
}) {
  const [active, setActive] = useState(0);
  const [inspected, setInspected] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const minimum = Math.min(...heights), span = Math.max(...heights) - minimum;
  const move = (event: KeyboardEvent, index: number) => {
    const row = Math.floor(index / gridSize), col = index % gridSize;
    let next = index;
    if (event.key === 'ArrowRight') next = row * gridSize + Math.min(gridSize - 1, col + 1);
    else if (event.key === 'ArrowLeft') next = row * gridSize + Math.max(0, col - 1);
    else if (event.key === 'ArrowDown') next = Math.min(gridSize - 1, row + 1) * gridSize + col;
    else if (event.key === 'ArrowUp') next = Math.max(0, row - 1) * gridSize + col;
    else if (event.key === 'Home') next = event.ctrlKey ? 0 : row * gridSize;
    else if (event.key === 'End') next = event.ctrlKey ? gridSize * gridSize - 1 : (row + 1) * gridSize - 1;
    else return;
    event.preventDefault(); setActive(next); buttons.current[next]?.focus();
  };
  return <div className="eaf-heatmap-card">
    <div className="eaf-heatmap-title" title={title}>{title}</div>
    <div className="eaf-section-note eaf-mono">{subtitle}</div>
    <div className="eaf-heatmap-grid" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }} role="grid" aria-rowcount={gridSize} aria-colcount={gridSize} aria-label={`${title} ${gridSize} by ${gridSize} relative elevation cells. Use arrow keys to inspect.`}>
      {Array.from({ length: gridSize }, (_, row) => <div role="row" key={row} style={{ display: 'contents' }}>
        {Array.from({ length: gridSize }, (_, col) => {
          const index = row * gridSize + col, relative = heights[index] - minimum;
          const rgb = elevationColor(relative, span).map(value => Math.round(value * 255));
          return <button key={col} ref={node => { buttons.current[index] = node; }} type="button" role="gridcell" aria-rowindex={row + 1} aria-colindex={col + 1}
            tabIndex={active === index ? 0 : -1} className="eaf-heatmap-cell" style={{ background: `rgb(${rgb.join(',')})` }}
            title={`Row ${row + 1}, Col ${col + 1}: +${relative.toFixed(1)} m relative`}
            aria-label={`Row ${row + 1} Column ${col + 1}, ${relative.toFixed(1)} meters relative elevation`}
            onKeyDown={event => move(event, index)} onFocus={() => { setActive(index); setInspected(index); }}
            onMouseEnter={() => setInspected(index)} onMouseLeave={() => setInspected(null)} />;
        })}
      </div>)}
    </div>
    <div className="eaf-heatmap-meta eaf-mono"><span>{inspected === null ? '0 m base · arrows to inspect' : `[${Math.floor(inspected / gridSize) + 1},${inspected % gridSize + 1}] +${formatNum(heights[inspected] - minimum, 1)} m rel`}</span><span>Span {formatNum(span, 1)} m</span></div>
  </div>;
}
