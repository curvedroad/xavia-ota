export const UPDATE_CHANNELS = ['production', 'qa'] as const;

export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

export function isUpdateChannel(value: unknown): value is UpdateChannel {
  return typeof value === 'string' && UPDATE_CHANNELS.includes(value as UpdateChannel);
}

export function getClientUpdateChannel(value: string | string[] | undefined): UpdateChannel | null {
  if (value === undefined) return 'production';
  return isUpdateChannel(value) ? value : null;
}
