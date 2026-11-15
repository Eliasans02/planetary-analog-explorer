import { describe, expect, it, vi } from 'vitest';
import { latestResource } from './latestResource';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  const jobs = new Map<string, ReturnType<typeof deferred<string>>>();
  const signals = new Map<string, AbortSignal>();
  const display = vi.fn(), release = vi.fn(), failed = vi.fn(), loading = vi.fn();
  const owner = latestResource({
    load: (key: string, signal) => {
      const job = deferred<string>(); jobs.set(key, job); signals.set(key, signal); return job.promise;
    }, display, release, failed, loading,
  });
  return { owner, jobs, signals, display, release, failed };
}

describe('displayed map resource ownership', () => {
  it('keeps the displayed map while loading and rejects an older successful request', async () => {
    const f = fixture();
    const initial = f.owner.request('1K'); f.jobs.get('1K')!.resolve('image1'); await initial;
    const older = f.owner.request('2K');
    const newer = f.owner.request('4K');
    expect(f.signals.get('2K')!.aborted).toBe(true);
    expect(f.release).not.toHaveBeenCalled();
    expect(f.display.mock.calls).toEqual([['image1', '1K']]);
    f.jobs.get('4K')!.resolve('image4'); await newer;
    f.jobs.get('2K')!.resolve('image2'); await older;
    expect(f.display.mock.calls).toEqual([['image1', '1K'], ['image4', '4K']]);
    expect(f.release.mock.calls).toEqual([['image1'], ['image2']]);
    f.owner.dispose();
    expect(f.release.mock.calls).toEqual([['image1'], ['image2'], ['image4']]);
  });

  it('retains a valid map after replacement failure and permits retry', async () => {
    const f = fixture();
    const initial = f.owner.request('1K'); f.jobs.get('1K')!.resolve('valid'); await initial;
    const replacement = f.owner.request('4K'); f.jobs.get('4K')!.reject(new Error('hash mismatch')); await replacement;
    expect(f.release).not.toHaveBeenCalled();
    expect(f.failed).toHaveBeenCalledWith(expect.objectContaining({message:'hash mismatch'}), '4K');
    const retry = f.owner.request('4K'); f.jobs.get('4K')!.resolve('retried'); await retry;
    expect(f.display).toHaveBeenLastCalledWith('retried', '4K');
    expect(f.release).toHaveBeenCalledExactlyOnceWith('valid');
    f.owner.dispose();
  });

  it('ignores stale failure and releases a late decode after unmount exactly once', async () => {
    const f = fixture();
    const initial = f.owner.request('1K'); f.jobs.get('1K')!.resolve('valid'); await initial;
    const older = f.owner.request('2K'); const newest = f.owner.request('4K');
    f.jobs.get('2K')!.reject(new Error('old failure')); await older;
    expect(f.failed).not.toHaveBeenCalled();
    f.owner.dispose(); f.owner.dispose();
    expect(f.signals.get('4K')!.aborted).toBe(true);
    f.jobs.get('4K')!.resolve('late'); await newest;
    expect(f.display.mock.calls).toEqual([['valid', '1K']]);
    expect(f.release.mock.calls).toEqual([['valid'], ['late']]);
    expect(f.failed).not.toHaveBeenCalled();
  });
});
