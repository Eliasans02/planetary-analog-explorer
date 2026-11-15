/** Walking input is scoped to a locked pointer or a focused terrain canvas. */
export function walkInputActive(walking: boolean, locked: boolean, focused: boolean): boolean { return walking && (locked || focused); }
export function dragLookAngles(yaw: number, pitch: number, dx: number, dy: number) {
  return { yaw: yaw-dx*.002, pitch: Math.max(-Math.PI/2+.01,Math.min(Math.PI/2-.01,pitch-dy*.002)) };
}

/** Pause always clears held keys; resume requires a new explicit activation. */
export function createWalkInput() {
  const keys = new Set<string>();
  let active = false;
  return {
    keys,
    get active() { return active; },
    activate() { active = true; },
    press(code: string) { if (active && ['KeyW','KeyA','KeyS','KeyD'].includes(code)) keys.add(code); },
    release(code: string) { return keys.delete(code); },
    pause() { active = false; keys.clear(); },
  };
}

/** Throttle moving HUD updates, but publish the exact final sample on release/pause. */
export function createWalkPositionPublisher(publish: (position: { x: number; z: number }) => void) {
  let lastTime = -Infinity;
  let previous: { x: number; z: number } | undefined;
  return (x: number, z: number, time: number, flush = false) => {
    if (!flush && time - lastTime < 200) return;
    lastTime = time;
    if (previous?.x === x && previous?.z === z) return;
    previous = { x, z };
    publish(previous);
  };
}
