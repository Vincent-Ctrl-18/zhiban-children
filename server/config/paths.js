const path = require('path');

const serverRoot = path.join(__dirname, '..');
const configuredUploadDir = process.env.UPLOAD_DIR || 'uploads';

const UPLOAD_DIR = path.isAbsolute(configuredUploadDir)
  ? path.normalize(configuredUploadDir)
  : path.resolve(serverRoot, configuredUploadDir);

const rawBasePath = process.env.PUBLIC_BASE_PATH || '';
const PUBLIC_BASE_PATH = rawBasePath && rawBasePath !== '/'
  ? `/${rawBasePath.replace(/^\/+|\/+$/g, '')}`
  : '';

const isExternalUrl = (value) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);

const toPublicPath = (value) => {
  if (!value || isExternalUrl(value)) return value;
  const normalized = value.startsWith('/') ? value : `/${value}`;
  if (!PUBLIC_BASE_PATH) return normalized;
  if (normalized === PUBLIC_BASE_PATH || normalized.startsWith(`${PUBLIC_BASE_PATH}/`)) {
    return normalized;
  }
  return `${PUBLIC_BASE_PATH}${normalized}`;
};

const withoutPublicBasePath = (value) => {
  if (!PUBLIC_BASE_PATH || !value || isExternalUrl(value)) return value;
  return value.startsWith(`${PUBLIC_BASE_PATH}/`)
    ? value.slice(PUBLIC_BASE_PATH.length)
    : value;
};

const resolveStoredUploadPath = (value) => {
  const canonical = withoutPublicBasePath(value || '');
  const relative = canonical.replace(/^\/+uploads\/?/i, '');
  const resolved = path.resolve(UPLOAD_DIR, relative);
  const uploadRoot = `${path.resolve(UPLOAD_DIR)}${path.sep}`;

  if (resolved !== path.resolve(UPLOAD_DIR) && !resolved.startsWith(uploadRoot)) {
    throw new Error('非法的上传文件路径');
  }
  return resolved;
};

module.exports = {
  PUBLIC_BASE_PATH,
  UPLOAD_DIR,
  resolveStoredUploadPath,
  toPublicPath,
};
