# Building for the App Store and Google Play

## Prerequisites
- Node.js 24
- pnpm
- Expo account at expo.dev
- EAS CLI: `npm install -g eas-cli`

## First-time setup
1. `eas login`
2. `eas init` — creates the EAS project and fills in `extra.eas.projectId` in app.json
3. For iOS: `eas credentials` — EAS manages signing certificates automatically
4. For Android: `eas credentials` — EAS manages the keystore automatically

## Build commands
```bash
# Development build (installable on device)
eas build --profile development --platform all

# Production build for store submission
eas build --profile production --platform ios
eas build --profile production --platform android

# Submit to stores (after successful production build)
eas submit --platform ios
eas submit --platform android
```

## Required manual steps before first submission
- [ ] Fill in `REPLACE_WITH_*` placeholders in eas.json
- [ ] Register bundle ID `com.stockclarify.app` in Apple Developer portal
- [ ] Create app listing in App Store Connect
- [ ] Create app listing in Google Play Console
- [ ] Upload google-service-account.json (from Google Play Console → API access)
- [ ] Set Privacy Policy URL to `https://api.yourdomain.com/legal/privacy`
      in both App Store Connect and Google Play Console listings.
      Replace `[SUPPORT_EMAIL]` placeholders in `artifacts/api-server/src/routes/legal.ts`
      with the real support email before submitting.
- [ ] (Recommended) Replace `./assets/images/icon.png` with a 1024×1024 transparent-background `adaptive-icon.png` for Android, then update `expo.android.adaptiveIcon.foregroundImage` in app.json. The current icon is RGB (no alpha); Android composites the foreground over `#0A1628` so a transparent-background asset gives a cleaner result on devices that mask the icon to a shape.
- [ ] Download `google-services.json` from Firebase Console and place it in
      `artifacts/mobile/` — required for Android push notifications.
      Once present, add `"googleServicesFile": "./google-services.json"` to the
      `expo.android` section of `app.json`.

## iOS push notifications (APNs)

EAS manages APNs certificates automatically via `eas credentials`. No additional
configuration is required in `app.json` beyond what is already set up in Phase 2.
