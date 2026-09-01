const path = require('path');

const serverRoot = path.join(__dirname, '..');
const configuredUploadDir = process.env.UPLOAD_DIR || 'uploads';

const UPLOAD_DIR = path.isAbsolute(configuredUploadDir)
  ? path.normalize(configuredUploadDir)
  : path.resolve(serverRoot, configuredUploadDir);

// 电子书等需要鉴权访问的文件不放在公开的 /uploads 静态目录下。
const configuredPrivateUploadDir = process.env.PRIVATE_UPLOAD_DIR || path.join(serverRoot, 'private_uploads');
const PRIVATE_UPLOAD_DIR = path.isAbsolute(configuredPrivateUploadDir)
  ? path.normalize(configuredPrivateUploadDir)
  : path.resolve(serverRoot, configuredPrivateUploadDir);

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

const resolvePrivateUploadPath = (value) => {
  const relative = String(value || '').replace(/^[/\\]+/, '');
  const resolved = path.resolve(PRIVATE_UPLOAD_DIR, relative);
  const privateRoot = `${path.resolve(PRIVATE_UPLOAD_DIR)}${path.sep}`;
  if (resolved !== path.resolve(PRIVATE_UPLOAD_DIR) && !resolved.startsWith(privateRoot)) {
    throw new Error('非法的私有文件路径');
  }
  return resolved;
};

module.exports = {
  PUBLIC_BASE_PATH,
  UPLOAD_DIR,
  PRIVATE_UPLOAD_DIR,
  resolveStoredUploadPath,
  resolvePrivateUploadPath,
  toPublicPath,
};
