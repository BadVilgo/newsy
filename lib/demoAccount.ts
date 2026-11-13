import { usernameToEmail } from './username';

/**
 * Publiczne konto demo. Dane są celowo jawne (widać je na ekranie logowania) - to konto
 * pokazowe, a nie sekret. Z jego tematów powstaje też publiczny podgląd /demo.
 */
export const DEMO_USER = 'test-user';
export const DEMO_PASSWORD = 'test-password';
export const DEMO_EMAIL = usernameToEmail(DEMO_USER);
