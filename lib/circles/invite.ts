import { isUuid } from '../ids/uuid';

export const CIRCLE_INVITE_PREFIX = '/circles/invite/';

export function isCircleInviteId(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 && value === value.toLowerCase() && isUuid(value);
}

export function circleInviteHref(circleId: string) {
  return CIRCLE_INVITE_PREFIX + circleId;
}
