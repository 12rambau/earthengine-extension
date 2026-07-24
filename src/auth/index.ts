/**
 * @module auth
 * Public surface of the authentication module: profile-based credential
 * storage, OAuth and service-account handling, and the AuthService facade.
 */

export { AuthService } from './authService.js';
export { TokenStorage, Profile } from './tokenStorage.js';
export {
  EECredentials,
  StoredCredentials,
  ServiceAccountCredentials,
  isServiceAccount,
  getDefaultCredentialsPath,
  getProfileCredentialsPath,
  readCredentials,
} from './oauth.js';
