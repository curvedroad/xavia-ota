import { getClientUpdateChannel, isUpdateChannel } from '../apiUtils/security/channel';

describe('update channels', () => {
  it('maps missing client channel to production for old app builds', () => {
    expect(getClientUpdateChannel(undefined)).toBe('production');
  });

  it('accepts only the supported explicit channels', () => {
    expect(getClientUpdateChannel('production')).toBe('production');
    expect(getClientUpdateChannel('qa')).toBe('qa');
    expect(getClientUpdateChannel('preview')).toBeNull();
    expect(getClientUpdateChannel(['qa'])).toBeNull();
    expect(isUpdateChannel('production')).toBe(true);
    expect(isUpdateChannel('qa')).toBe(true);
  });
});
