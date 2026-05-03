import OAuthNativeCallback from "./oauth-native-callback";

/**
 * Mirror of `oauth-native-callback.tsx` for the newer `useSSO` hook, which
 * defaults its redirect path to `sso-callback`. Same behavior: complete the
 * Clerk handshake on web and forward into the app.
 */
export default OAuthNativeCallback;
