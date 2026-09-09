const RUNTIME_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const MAX_ARCHIVE_PATH_LENGTH = 2048;

export function isValidRuntimeVersion(value: unknown): value is string {
  return typeof value === 'string' && RUNTIME_VERSION_PATTERN.test(value);
}

export function isSafeArchivePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_ARCHIVE_PATH_LENGTH) {
    return false;
  }

  const parts = value.split('/');
  return !(
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/.test(value) ||
    parts.some((part) => part === '..')
  );
}
