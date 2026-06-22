// content/modules/care-plan-stamp/v2-flag.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { engineVersionOf, devForceV2, devForceMock, isV2 } from './v2-flag.js';

describe('v2-flag', () => {
  let savedLocation;
  let savedLocalStorage;

  beforeEach(() => {
    savedLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
    savedLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    // Default: no override available.
    delete globalThis.location;
    delete globalThis.localStorage;
  });

  afterEach(() => {
    if (savedLocation) Object.defineProperty(globalThis, 'location', savedLocation);
    else delete globalThis.location;
    if (savedLocalStorage) Object.defineProperty(globalThis, 'localStorage', savedLocalStorage);
    else delete globalThis.localStorage;
  });

  describe('engineVersionOf', () => {
    it("returns 'v2' when audit.engineVersion is 'v2'", () => {
      expect(engineVersionOf({ engineVersion: 'v2' })).toBe('v2');
    });
    it("returns 'v1' for an empty object", () => {
      expect(engineVersionOf({})).toBe('v1');
    });
    it("returns 'v1' for null", () => {
      expect(engineVersionOf(null)).toBe('v1');
    });
  });

  describe('with NO override set', () => {
    it('isV2 is true for a v2 audit', () => {
      expect(isV2({ engineVersion: 'v2' })).toBe(true);
    });
    it('isV2 is false for a v1 audit', () => {
      expect(isV2({})).toBe(false);
    });
    it('devForceV2 is false', () => {
      expect(devForceV2()).toBe(false);
    });
    it('devForceMock is false', () => {
      expect(devForceMock()).toBe(false);
    });
  });

  describe('with ?cpv2=1', () => {
    beforeEach(() => {
      globalThis.location = { search: '?cpv2=1' };
    });
    it('devForceV2 is true', () => {
      expect(devForceV2()).toBe(true);
    });
    it('devForceMock is false', () => {
      expect(devForceMock()).toBe(false);
    });
    it('isV2 is true even for a v1 audit', () => {
      expect(isV2({})).toBe(true);
    });
  });

  describe('with ?cpv2=mock', () => {
    beforeEach(() => {
      globalThis.location = { search: '?cpv2=mock' };
    });
    it('devForceMock is true', () => {
      expect(devForceMock()).toBe(true);
    });
    it('devForceV2 is true', () => {
      expect(devForceV2()).toBe(true);
    });
  });

  describe('localStorage fallback', () => {
    beforeEach(() => {
      globalThis.location = { search: '' };
      globalThis.localStorage = { getItem: () => '1' };
    });
    it('devForceV2 is true', () => {
      expect(devForceV2()).toBe(true);
    });
  });

  describe('robustness when reading throws', () => {
    beforeEach(() => {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        get() {
          throw new Error('location blocked');
        },
      });
    });
    it('devForceV2 returns false and does not throw', () => {
      expect(() => devForceV2()).not.toThrow();
      expect(devForceV2()).toBe(false);
    });
  });
});
