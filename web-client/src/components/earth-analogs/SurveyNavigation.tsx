import { useState, type KeyboardEvent } from 'react';
import { Crosshair, Minus, Plus, RotateCcw } from 'lucide-react';

export function useSurveyNavigation(selected: { cx: number; cy: number } | null) {
  const [view, setView] = useState({ x: 300, y: 225, zoom: 1 });
  const move = (x: number, y: number, zoom: number) => {
    const halfWidth = 300 / zoom;
    const halfHeight = 225 / zoom;
    setView({ x: Math.max(halfWidth, Math.min(600 - halfWidth, x)), y: Math.max(halfHeight, Math.min(450 - halfHeight, y)), zoom });
  };
  const zoomBy = (factor: number) => move(view.x, view.y, Math.max(1, Math.min(8, view.zoom * factor)));
  const focusSelected = () => move(selected?.cx ?? 300, selected?.cy ?? 225, 4);
  const reset = () => setView({ x: 300, y: 225, zoom: 1 });
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return;
    const step = 40 / view.zoom;
    if (event.key === 'ArrowLeft') move(view.x - step, view.y, view.zoom);
    else if (event.key === 'ArrowRight') move(view.x + step, view.y, view.zoom);
    else if (event.key === 'ArrowUp') move(view.x, view.y - step, view.zoom);
    else if (event.key === 'ArrowDown') move(view.x, view.y + step, view.zoom);
    else if (event.key === '+' || event.key === '=') zoomBy(1.5);
    else if (event.key === '-') zoomBy(1 / 1.5);
    else if (event.key === 'Home') reset();
    else return;
    event.preventDefault();
  };
  return {
    viewBox: `${view.x - 300 / view.zoom} ${view.y - 225 / view.zoom} ${600 / view.zoom} ${450 / view.zoom}`,
    onKeyDown,
    controls: <div className="eaf-survey-navigation" role="group" aria-label="Survey map navigation">
      <button onClick={() => zoomBy(1.5)} aria-label="Zoom into survey" title="Zoom in (+)"><Plus size={15} /></button>
      <button onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out of survey" title="Zoom out (-)"><Minus size={15} /></button>
      <button onClick={focusSelected} aria-label="Focus selected window" title="Focus selected window"><Crosshair size={15} /></button>
      <button onClick={reset} aria-label="Reset survey view" title="Reset survey view (Home)"><RotateCcw size={15} /></button>
    </div>,
  };
}
