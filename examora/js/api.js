/**
 * Centralised API client for UniversityAcademicApi.
 *
 * - Sends `Authorization: Bearer <token>` when a session exists.
 * - Normalises JSON property casing to camelCase (so Items/items both work).
 * - Understands ResponseModel<T> ({ success, message, data, errors, traceId }),
 *   PagedResponse<T>, and ASP.NET ProblemDetails / ValidationProblemDetails.
 * - Never fakes success: any non-2xx, or `success: false`, throws ApiError.
 */
import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, errors = [], fieldErrors = {}, traceId = null, network = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.fieldErrors = fieldErrors;
    this.traceId = traceId;
    this.network = network;
  }
}

const STATUS_MESSAGES = {
  400: 'The request was not accepted. Please check the details and try again.',
  401: 'Your session has expired or you are not signed in. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'The requested record could not be found.',
  409: 'This conflicts with existing data (for example, a duplicate record).',
  500: 'The server hit an unexpected error. Please try again later.',
};

let getToken = () => null;
let onUnauthorized = () => {};

export function configureApi(opts) {
  if (opts.getToken) getToken = opts.getToken;
  if (opts.onUnauthorized) onUnauthorized = opts.onUnauthorized;
}

const lowerFirst = (k) => k.charAt(0).toLowerCase() + k.slice(1);
function camelize(v) {
  if (Array.isArray(v)) return v.map(camelize);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[lowerFirst(k)] = camelize(val);
    return o;
  }
  return v;
}

function buildError(status, body) {
  let message = null;
  let errors = [];
  const fieldErrors = {};
  let traceId = null;

  if (body && typeof body === 'object') {
    traceId = body.traceId || null;
    if (Array.isArray(body.errors)) {
      errors = body.errors.map((e) => (typeof e === 'string' ? { message: e } : e));
    } else if (body.errors && typeof body.errors === 'object') {
      for (const [field, msgs] of Object.entries(body.errors)) {
        const m = Array.isArray(msgs) ? msgs.join(' ') : String(msgs);
        errors.push({ field, message: m });
      }
    }
    for (const e of errors) if (e.field) fieldErrors[e.field] = e.message;
    message = body.message || body.detail || body.title || errors[0]?.message || null;
  }
  return new ApiError(message || STATUS_MESSAGES[status] || `Request failed (HTTP ${status}).`, {
    status, errors, fieldErrors, traceId,
  });
}
const NETWORK_MESSAGE = () => {

  console.warn(`Cannot reach the API at ${CONFIG.API_BASE_URL}. Check that it is running, that its HTTPS certificate is trusted, and that CORS allows this origin.`);
  return 'We couldn’t connect to Examora. Please check your internet connection and try again.';
};
export async function request(method, path, { query, body, auth = true } = {}) {
  let url = CONFIG.API_BASE_URL.replace(/\/+$/, '') + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'The request timed out. Please try again.' : NETWORK_MESSAGE(), { network: true });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json = null;
  if (text) { try { json = camelize(JSON.parse(text)); } catch { /* non-JSON body */ } }

  if (res.status === 401 && auth) onUnauthorized();
  if (!res.ok) throw buildError(res.status, json);
  if (json && typeof json === 'object' && json.success === false) throw buildError(res.status || 400, json);
  return json ?? { success: true, data: null, message: null };
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body, opts) => request('POST', path, { body: body ?? {}, ...opts }),
  put: (path, body) => request('PUT', path, { body }),
  del: (path) => request('DELETE', path),
};

/** Walks every page using the API's pagination metadata, bounded by CONFIG limits. */
export async function fetchAllPages(path, query = {}) {
  const items = [];
  let page = 1;
  let totalCount = 0;
  let hasNext = false;
  do {
    const env = await api.get(path, { ...query, pageNumber: page, pageSize: CONFIG.FETCH_ALL_PAGE_SIZE });
    const d = env.data || {};
    items.push(...(d.items || []));
    totalCount = d.totalCount ?? items.length;
    hasNext = Boolean(d.hasNextPage) && (d.items || []).length > 0;
    page += 1;
  } while (hasNext && page <= CONFIG.FETCH_ALL_MAX_PAGES);
  return { items, totalCount, truncated: hasNext };
}
