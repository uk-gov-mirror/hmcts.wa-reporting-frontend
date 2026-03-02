import config from 'config';
import type { CookieOptions, Request, Response } from 'express';

import { validateFilters } from './filters';
import { AnalyticsFilters } from './types';

type ArrayFilterKey = 'service' | 'roleCategory' | 'region' | 'location' | 'taskName' | 'workType' | 'user';
type DateFilterKey = 'completedFrom' | 'completedTo' | 'eventsFrom' | 'eventsTo';

export const BASE_FILTER_KEYS: ArrayFilterKey[] = [
  'service',
  'roleCategory',
  'region',
  'location',
  'taskName',
  'workType',
];

const ARRAY_FILTER_KEYS: ArrayFilterKey[] = [...BASE_FILTER_KEYS, 'user'];
const DATE_FILTER_KEYS: DateFilterKey[] = ['completedFrom', 'completedTo', 'eventsFrom', 'eventsTo'];

const COOKIE_VERSION = 1;
const MAX_COOKIE_BYTES = 3800;
const DEFAULT_COOKIE_PATH = '/';

type CookiePayload = {
  v: number; // payload version for backward compatibility
  s?: string[]; // service filter values
  rc?: string[]; // role category filter values
  r?: string[]; // region filter values
  l?: string[]; // location filter values
  t?: string[]; // task name filter values
  wt?: string[]; // work type filter values
  u?: string[]; // user filter values
  cf?: string; // completed from date (YYYY-MM-DD)
  ct?: string; // completed to date (YYYY-MM-DD)
  ef?: string; // events from date (YYYY-MM-DD)
  et?: string; // events to date (YYYY-MM-DD)
};

const DATE_FORMAT_LENGTH = 10;

function toDateString(value?: Date): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.toISOString().slice(0, DATE_FORMAT_LENGTH);
}

function buildPayload(filters: AnalyticsFilters): CookiePayload {
  return {
    v: COOKIE_VERSION,
    s: filters.service && filters.service.length > 0 ? filters.service : undefined,
    rc: filters.roleCategory && filters.roleCategory.length > 0 ? filters.roleCategory : undefined,
    r: filters.region && filters.region.length > 0 ? filters.region : undefined,
    l: filters.location && filters.location.length > 0 ? filters.location : undefined,
    t: filters.taskName && filters.taskName.length > 0 ? filters.taskName : undefined,
    wt: filters.workType && filters.workType.length > 0 ? filters.workType : undefined,
    u: filters.user && filters.user.length > 0 ? filters.user : undefined,
    cf: toDateString(filters.completedFrom),
    ct: toDateString(filters.completedTo),
    ef: toDateString(filters.eventsFrom),
    et: toDateString(filters.eventsTo),
  };
}

function payloadHasValues(payload: CookiePayload): boolean {
  return Object.entries(payload).some(([key, value]) => key !== 'v' && value !== undefined);
}

export function encodeFilterCookie(filters: AnalyticsFilters): string | null {
  const payload = buildPayload(filters);
  if (!payloadHasValues(payload)) {
    return null;
  }
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, 'utf8').toString('base64url');
  if (Buffer.byteLength(encoded, 'utf8') > MAX_COOKIE_BYTES) {
    return null;
  }
  return encoded;
}

export function decodeFilterCookie(raw: string | undefined): AnalyticsFilters {
  if (!raw) {
    return {};
  }
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as CookiePayload;
    if (!payload || payload.v !== COOKIE_VERSION) {
      return {};
    }
    const source: Record<string, unknown> = {
      service: payload.s,
      roleCategory: payload.rc,
      region: payload.r,
      location: payload.l,
      taskName: payload.t,
      workType: payload.wt,
      user: payload.u,
      completedFrom: payload.cf,
      completedTo: payload.ct,
      eventsFrom: payload.ef,
      eventsTo: payload.et,
    };
    return validateFilters(source).filters;
  } catch {
    return {};
  }
}

function isArrayFilterKey(key: keyof AnalyticsFilters): key is ArrayFilterKey {
  return ARRAY_FILTER_KEYS.includes(key as ArrayFilterKey);
}

function isDateFilterKey(key: keyof AnalyticsFilters): key is DateFilterKey {
  return DATE_FILTER_KEYS.includes(key as DateFilterKey);
}

export function pickFilters(filters: AnalyticsFilters, allowedKeys: (keyof AnalyticsFilters)[]): AnalyticsFilters {
  const picked: AnalyticsFilters = {};
  allowedKeys.forEach(key => {
    if (isArrayFilterKey(key)) {
      const value = filters[key];
      if (Array.isArray(value) && value.length > 0) {
        picked[key] = value;
      }
      return;
    }
    if (isDateFilterKey(key)) {
      const value = filters[key];
      if (value instanceof Date) {
        picked[key] = value;
      }
    }
  });
  return picked;
}

export function hasFilters(filters: AnalyticsFilters): boolean {
  return Object.values(filters).some(value => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value instanceof Date;
  });
}

export function buildFilterCookieOptions(maxAgeMs: number, secure: boolean, path = DEFAULT_COOKIE_PATH): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    signed: true,
    maxAge: maxAgeMs,
    path,
  };
}

export function getFilterCookieContext(): { cookieName: string; cookieOptions: CookieOptions } {
  const cookieName: string = config.get('analytics.filtersCookieName');
  const cookieMaxAgeDays: number = config.get('analytics.filtersCookieMaxAgeDays');
  const cookieOptions = buildFilterCookieOptions(
    cookieMaxAgeDays * 24 * 60 * 60 * 1000,
    process.env.NODE_ENV === 'production'
  );
  return { cookieName, cookieOptions };
}

function getSignedCookieValue(req: Request, name: string): string | undefined {
  const raw = req.signedCookies?.[name];
  if (typeof raw === 'string') {
    return raw;
  }
  return undefined;
}

function isResetRequest(source: Record<string, unknown>): boolean {
  if (source.resetFilters === '1' || source.resetFilters === 1) {
    return true;
  }
  return false;
}

function isAjaxRequest(source: Record<string, unknown>): boolean {
  const ajaxSection = source.ajaxSection;
  if (typeof ajaxSection === 'string' && ajaxSection.trim().length > 0) {
    return true;
  }
  if (source.facetRefresh === '1' || source.facetRefresh === 1) {
    return true;
  }
  return false;
}

function isFacetRefreshRequest(source: Record<string, unknown>): boolean {
  return source.facetRefresh === '1' || source.facetRefresh === 1;
}

export function applyFilterCookie(params: {
  req: Request;
  res: Response;
  source: Record<string, unknown>;
  allowedKeys: (keyof AnalyticsFilters)[];
  cookieName: string;
  cookieOptions: CookieOptions;
}): AnalyticsFilters {
  const { req, res, source, allowedKeys, cookieName, cookieOptions } = params;

  if (isResetRequest(source)) {
    res.clearCookie(cookieName, cookieOptions);
    return {};
  }

  const { filters: parsedFilters } = validateFilters(source);
  const scopedFilters = pickFilters(parsedFilters, allowedKeys);
  const requestHasFilters = hasFilters(scopedFilters);
  const ajaxRequest = isAjaxRequest(source);
  const facetRefreshRequest = isFacetRefreshRequest(source);

  if (req.method === 'POST' && !ajaxRequest) {
    if (requestHasFilters) {
      const encoded = encodeFilterCookie(scopedFilters);
      if (encoded) {
        res.cookie(cookieName, encoded, cookieOptions);
      } else {
        res.clearCookie(cookieName, cookieOptions);
      }
    } else {
      res.clearCookie(cookieName, cookieOptions);
    }
    return scopedFilters;
  }

  if (requestHasFilters) {
    return scopedFilters;
  }

  // Facet refresh requests represent authoritative in-form state.
  // If no filters are present, avoid falling back to stale persisted cookie values.
  if (facetRefreshRequest) {
    return scopedFilters;
  }

  const rawCookie = getSignedCookieValue(req, cookieName);
  const storedFilters = decodeFilterCookie(rawCookie);
  return pickFilters(storedFilters, allowedKeys);
}

export function applyFilterCookieFromConfig(params: {
  req: Request;
  res: Response;
  source: Record<string, unknown>;
  allowedKeys: (keyof AnalyticsFilters)[];
}): AnalyticsFilters {
  const { cookieName, cookieOptions } = getFilterCookieContext();
  return applyFilterCookie({ ...params, cookieName, cookieOptions });
}
