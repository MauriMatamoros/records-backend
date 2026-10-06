export const SESSION_COOKIE = 'ph_session';
export const OAUTH_STATE_COOKIE = 'ph_oauth_state';

export interface SessionPayload {
  sub: string;
  email: string;
}
