import { describe, expect, it } from 'vitest';
import {
  glCallStatsEnabled,
  installGlCallCounter,
  isSyncLikeGlCall,
  summarizeGlCalls,
} from '../src/n64/gl-call-stats';

class FakeGl {
  calls: string[] = [];
  get drawingBufferWidth() { return 320; }
  drawArrays(mode: number) { this.calls.push(`draw:${mode}`); return mode; }
  isEnabled() { return true; }
  uniform4f() { this.calls.push('uniform'); }
}

describe('N64 WebGL call statistics', () => {
  it('is opt-in through the query string only', () => {
    expect(glCallStatsEnabled('?n64GlCallStats=1')).toBe(true);
    expect(glCallStatsEnabled('?n64GlCallStats=true')).toBe(false);
    expect(glCallStatsEnabled('')).toBe(false);
  });

  it('counts prototype methods without changing behavior and restores them on uninstall', () => {
    const originalDraw = FakeGl.prototype.drawArrays;
    const counter = installGlCallCounter(FakeGl.prototype);
    const gl = new FakeGl();

    expect(gl.drawArrays(4)).toBe(4);
    gl.drawArrays(5);
    expect(gl.isEnabled()).toBe(true);
    expect(gl.drawingBufferWidth).toBe(320);
    expect(gl.calls).toEqual(['draw:4', 'draw:5']);
    expect(counter.snapshot()).toMatchObject({ drawArrays: 2, isEnabled: 1, uniform4f: 0 });
    expect(counter.snapshot()).not.toHaveProperty('constructor');

    counter.uninstall();
    expect(FakeGl.prototype.drawArrays).toBe(originalDraw);
    gl.drawArrays(6);
    expect(counter.snapshot().drawArrays).toBe(2);
  });

  it('summarizes per-loop deltas and flags calls that can block on the GPU process', () => {
    const summary = summarizeGlCalls(
      { drawArrays: 10, isEnabled: 4, uniform4f: 1 },
      { drawArrays: 30, isEnabled: 14, uniform4f: 41, finish: 2, getError: 0 },
      2,
      2,
    );

    expect(summary.callsPerLoop).toBe(36);
    expect(summary.syncLikeCallsPerLoop).toBe(6);
    expect(summary.top).toEqual([
      { name: 'uniform4f', perLoop: 20, syncLike: false },
      { name: 'drawArrays', perLoop: 10, syncLike: false },
    ]);
    expect(['getError', 'getParameter', 'isEnabled', 'finish', 'readPixels'].every(isSyncLikeGlCall)).toBe(true);
    expect(['drawArrays', 'bindTexture', 'invalidateFramebuffer'].some(isSyncLikeGlCall)).toBe(false);
  });
});
