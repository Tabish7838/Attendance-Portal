# Attendance Portal (Expo)

## Offline mode (Phase 3)

This app uses a local SQLite database to support offline-first usage.

- Local tables:
  - `students_local`
  - `attendance_local`
  - `sync_queue`

### How it works

- All roster + attendance changes are written to SQLite first.
- Each local change enqueues an operation into `sync_queue` with a `client_updated_at` timestamp.
- When the device is online, the app sends queued operations to the backend `POST /sync` endpoint.
- The backend applies Last-Write-Wins (LWW) and returns which operations were applied/rejected.

### Requirements

- The backend must expose `POST /sync` and accept a Supabase access token:
  - `Authorization: Bearer <access_token>`

### Installing dependencies

If you see TypeScript errors like `Cannot find module 'expo-sqlite'`, install native deps with:

```bash
npx expo install expo-sqlite @react-native-community/netinfo
```

Then restart the bundler.

## Running tests

```bash
npm test
```
