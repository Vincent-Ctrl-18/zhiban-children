const rawBaseUrl = import.meta.env.BASE_URL || '/';

export const APP_BASE_PATH = rawBaseUrl === '/'
  ? ''
  : `/${rawBaseUrl.replace(/^\/+|\/+$/g, '')}`;

const isExternalUrl = (value) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);

export const withBasePath = (value = '/') => {
  if (!value || isExternalUrl(value)) return value;

  const normalized = value.startsWith('/') ? value : `/${value}`;
  if (!APP_BASE_PATH) return normalized;
  if (normalized === APP_BASE_PATH || normalized.startsWith(`${APP_BASE_PATH}/`)) {
    return normalized;
  }
  if (normalized === '/') return `${APP_BASE_PATH}/`;
  return `${APP_BASE_PATH}${normalized}`;
};

export const withoutBasePath = (value = '') => {
  if (!APP_BASE_PATH || !value || isExternalUrl(value)) return value;
  if (value === APP_BASE_PATH) return '/';
  return value.startsWith(`${APP_BASE_PATH}/`)
    ? value.slice(APP_BASE_PATH.length)
    : value;
};

export const API_BASE_URL = withBasePath('/api');
