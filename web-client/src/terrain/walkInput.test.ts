import { describe,it,expect } from 'vitest';
import { walkInputActive,dragLookAngles } from './walkInput';
describe('first person fallback input',()=>{
 it('permits focused movement without pointer lock and stops after Escape/blur focus loss',()=>{expect(walkInputActive(true,false,true)).toBe(true);expect(walkInputActive(true,false,false)).toBe(false);expect(walkInputActive(false,true,true)).toBe(false);expect(walkInputActive(true,true,false)).toBe(true);});
 it('uses horizontal drag for yaw and clamps pitch before overturning',()=>{const look=dragLookAngles(0,0,100,-100);expect(look.yaw).toBeCloseTo(-.2);expect(look.pitch).toBeCloseTo(.2);expect(dragLookAngles(0,0,0,-1e6).pitch).toBeLessThan(Math.PI/2);expect(dragLookAngles(0,0,0,1e6).pitch).toBeGreaterThan(-Math.PI/2);});
});

import { createWalkInput, createWalkPositionPublisher } from './walkInput';
describe('walk activation and pause lifecycle', () => {
 it('requires activation, clears held keys on pause, and resumes without stale movement', () => {
  const input = createWalkInput();
  input.press('KeyW');
  expect(input.keys.size).toBe(0);
  input.activate(); input.press('KeyW'); input.press('KeyD'); input.press('Tab');
  expect([...input.keys]).toEqual(['KeyW','KeyD']);
  input.pause();
  expect(input.active).toBe(false);
  expect(input.keys.size).toBe(0);
  input.press('KeyA'); input.activate();
  expect(input.keys.size).toBe(0);
  input.press('KeyS'); expect(input.release('KeyS')).toBe(true);
  expect(input.keys.size).toBe(0);
 });
 it('flushes the final native sample on release within the movement throttle interval', () => {
  const positions: {x:number;z:number}[] = [];
  const publish = createWalkPositionPublisher(position => positions.push(position));
  publish(0,0,0,true);
  publish(.37,-.41,80);
  expect(positions).toEqual([{x:0,z:0}]);
  publish(.37,-.41,90,true);
  expect(positions.at(-1)).toEqual({x:.37,z:-.41});
  publish(.37,-.41,100,true);
  expect(positions).toHaveLength(2);
  publish(.8,-.9,200);
  expect(positions).toHaveLength(2);
  publish(.8,-.9,210,true);
  expect(positions.at(-1)).toEqual({x:.8,z:-.9});
 });
});
