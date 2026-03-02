import type { Request, Response } from 'express';

import {
  BASE_FILTER_KEYS,
  applyFilterCookie,
  applyFilterCookieFromConfig,
  buildFilterCookieOptions,
  decodeFilterCookie,
  encodeFilterCookie,
  getFilterCookieContext,
  hasFilters,
  pickFilters,
} from '../../../../main/modules/analytics/shared/filterCookies';
import { AnalyticsFilters } from '../../../../main/modules/analytics/shared/types';

jest.mock('config', () => ({
  get: jest.fn((key: string) => {
    if (key === 'analytics.filtersCookieName') {
      return 'analytics-filters';
    }
    if (key === 'analytics.filtersCookieMaxAgeDays') {
      return 30;
    }
    throw new Error(`Unknown config key: ${key}`);
  }),
}));

describe('filterCookies', () => {
  const cookieName = 'analytics-filters';
  const cookieOptions = buildFilterCookieOptions(86_400_000, false);
  const baseKeys: (keyof AnalyticsFilters)[] = [...BASE_FILTER_KEYS];

  test('encodes and decodes filters with dates', () => {
    const filters: AnalyticsFilters = {
      service: ['Civil'],
      region: ['North'],
      completedFrom: new Date('2026-01-01T00:00:00.000Z'),
      completedTo: new Date('2026-01-31T00:00:00.000Z'),
    };

    const encoded = encodeFilterCookie(filters);
    expect(encoded).not.toBeNull();

    const decoded = decodeFilterCookie(encoded ?? undefined);
    expect(decoded.service).toEqual(['Civil']);
    expect(decoded.region).toEqual(['North']);
    expect(decoded.completedFrom?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(decoded.completedTo?.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  test('returns null when encoding empty filters', () => {
    expect(encodeFilterCookie({})).toBeNull();
  });

  test('returns null when only empty array filters are provided', () => {
    const filters: AnalyticsFilters = {
      service: [],
      roleCategory: [],
      region: [],
      location: [],
      taskName: [],
      workType: [],
      user: [],
    };

    expect(encodeFilterCookie(filters)).toBeNull();
  });

  test('returns null when encoded payload exceeds cookie size', () => {
    const oversized = 'x'.repeat(5000);
    const encoded = encodeFilterCookie({ service: [oversized] });
    expect(encoded).toBeNull();
  });

  test('encodes and decodes additional array filters', () => {
    const filters: AnalyticsFilters = {
      roleCategory: ['Legal'],
      region: ['South'],
      location: ['London'],
      taskName: ['Review'],
      workType: ['Hearing'],
      user: ['user-1'],
    };

    const encoded = encodeFilterCookie(filters);
    const decoded = decodeFilterCookie(encoded ?? undefined);
    expect(decoded.roleCategory).toEqual(['Legal']);
    expect(decoded.region).toEqual(['South']);
    expect(decoded.location).toEqual(['London']);
    expect(decoded.taskName).toEqual(['Review']);
    expect(decoded.workType).toEqual(['Hearing']);
    expect(decoded.user).toEqual(['user-1']);
  });

  test('picks only allowed filter keys', () => {
    const filters: AnalyticsFilters = {
      service: ['Civil'],
      user: ['user-1'],
      completedFrom: new Date('2026-01-01T00:00:00.000Z'),
    };

    const picked = pickFilters(filters, baseKeys);
    expect(picked).toEqual({ service: ['Civil'] });
  });

  test('pickFilters drops empty arrays and non-Date values for date fields', () => {
    const picked = pickFilters(
      {
        service: [],
        completedFrom: '2026-01-01' as unknown as Date,
      },
      ['service', 'completedFrom']
    );

    expect(picked).toEqual({});
  });

  test('picks date filters when allowed', () => {
    const filters: AnalyticsFilters = {
      completedFrom: new Date('2026-01-01T00:00:00.000Z'),
      completedTo: new Date('2026-01-31T00:00:00.000Z'),
    };

    const picked = pickFilters(filters, ['completedFrom', 'completedTo']);
    expect(picked.completedFrom?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(picked.completedTo?.toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  test('does not pick missing date filters', () => {
    const filters: AnalyticsFilters = {};
    const picked = pickFilters(filters, ['completedFrom']);
    expect(picked).toEqual({});
  });

  test('detects when filters have values', () => {
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ service: ['Civil'] })).toBe(true);
    expect(hasFilters({ completedFrom: new Date('2026-01-01T00:00:00.000Z') })).toBe(true);
  });

  test('does not treat empty arrays as active filters', () => {
    expect(hasFilters({ service: [] })).toBe(false);
  });

  test('decodes empty and invalid cookie values', () => {
    expect(decodeFilterCookie(undefined)).toEqual({});
    expect(decodeFilterCookie('not-json')).toEqual({});
    const badVersion = Buffer.from(JSON.stringify({ v: 99 }), 'utf8').toString('base64url');
    expect(decodeFilterCookie(badVersion)).toEqual({});
  });

  test('applyFilterCookie clears cookie on reset', () => {
    const req = { method: 'GET', signedCookies: {} } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookie({
      req,
      res,
      source: { resetFilters: '1' },
      allowedKeys: baseKeys,
      cookieName,
      cookieOptions,
    });

    expect(filters).toEqual({});
    expect(res.clearCookie).toHaveBeenCalledWith(cookieName, cookieOptions);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('applyFilterCookie clears cookie on numeric reset value', () => {
    const req = { method: 'GET', signedCookies: {} } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookie({
      req,
      res,
      source: { resetFilters: 1 },
      allowedKeys: baseKeys,
      cookieName,
      cookieOptions,
    });

    expect(filters).toEqual({});
    expect(res.clearCookie).toHaveBeenCalledWith(cookieName, cookieOptions);
  });

  test('applyFilterCookie writes cookie when request supplies filters', () => {
    const req = { method: 'POST', signedCookies: {} } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookie({
      req,
      res,
      source: { service: 'Crime' },
      allowedKeys: baseKeys,
      cookieName,
      cookieOptions,
    });

    expect(filters).toEqual({ service: ['Crime'] });
    expect(res.cookie).toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  test('applyFilterCookie clears cookie for empty filter form submission', () => {
    const req = { method: 'POST', signedCookies: {} } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookie({
      req,
      res,
      source: {},
      allowedKeys: baseKeys,
      cookieName,
      cookieOptions,
    });

    expect(filters).toEqual({});
    expect(res.clearCookie).toHaveBeenCalledWith(cookieName, cookieOptions);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('applyFilterCookie clears cookie when encoding fails', () => {
    const oversized = 'x'.repeat(5000);
    const req = { method: 'POST', signedCookies: {} } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookie({
      req,
      res,
      source: { service: oversized },
      allowedKeys: baseKeys,
      cookieName,
      cookieOptions,
    });

    expect(filters).toEqual({ service: [oversized] });
    expect(res.clearCookie).toHaveBeenCalledWith(cookieName, cookieOptions);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('applyFilterCookie uses stored cookie when no request filters', () => {
    const encoded = encodeFilterCookie({ service: ['Civil'] }) ?? '';
    const req = { method: 'GET', signedCookies: { [cookieName]: encoded } } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookie({
      req,
      res,
      source: {},
      allowedKeys: baseKeys,
      cookieName,
      cookieOptions,
    });

    expect(filters).toEqual({ service: ['Civil'] });
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  test('applyFilterCookie ignores non-string signed cookie values', () => {
    const req = { method: 'GET', signedCookies: { [cookieName]: 123 } } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookie({
      req,
      res,
      source: {},
      allowedKeys: baseKeys,
      cookieName,
      cookieOptions,
    });

    expect(filters).toEqual({});
  });

  test('applyFilterCookie handles missing signedCookies object', () => {
    const req = { method: 'GET' } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookie({
      req,
      res,
      source: {},
      allowedKeys: baseKeys,
      cookieName,
      cookieOptions,
    });

    expect(filters).toEqual({});
  });

  test('applyFilterCookie does not clear cookie for ajax submissions without filters', () => {
    const encoded = encodeFilterCookie({ service: ['Civil'] }) ?? '';
    const req = { method: 'POST', signedCookies: { [cookieName]: encoded } } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookie({
      req,
      res,
      source: { ajaxSection: 'overview-task-events' },
      allowedKeys: baseKeys,
      cookieName,
      cookieOptions,
    });

    expect(filters).toEqual({ service: ['Civil'] });
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  test('applyFilterCookie does not rehydrate stale cookie filters during facet refresh', () => {
    const encoded = encodeFilterCookie({ service: ['Civil'] }) ?? '';
    const req = { method: 'POST', signedCookies: { [cookieName]: encoded } } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookie({
      req,
      res,
      source: { ajaxSection: 'shared-filters', changedFilter: 'service', facetRefresh: '1' },
      allowedKeys: baseKeys,
      cookieName,
      cookieOptions,
    });

    expect(filters).toEqual({});
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  test('getFilterCookieContext uses configured name and age', () => {
    const context = getFilterCookieContext();
    expect(context.cookieName).toBe('analytics-filters');
    expect(context.cookieOptions.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
    expect(context.cookieOptions.httpOnly).toBe(true);
    expect(context.cookieOptions.signed).toBe(true);
    expect(context.cookieOptions.path).toBe('/');
  });

  test('getFilterCookieContext enables secure cookies in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const context = getFilterCookieContext();
      expect(context.cookieOptions.secure).toBe(true);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  test('applyFilterCookieFromConfig writes cookie using configured options', () => {
    const req = { method: 'POST', signedCookies: {} } as unknown as Request;
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;

    const filters = applyFilterCookieFromConfig({
      req,
      res,
      source: { service: 'Civil' },
      allowedKeys: baseKeys,
    });

    expect(filters).toEqual({ service: ['Civil'] });
    expect(res.cookie).toHaveBeenCalledWith(
      'analytics-filters',
      expect.any(String),
      expect.objectContaining({ maxAge: 30 * 24 * 60 * 60 * 1000 })
    );
  });
});
