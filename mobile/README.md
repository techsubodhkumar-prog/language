# Activity Discovery mobile app

The Flutter client uses Supabase Auth for email registration, login, password recovery,
session refresh, and logout. Persisted sessions are stored with the platform secure-storage
plugin. The Supabase publishable/anon key is provided at build/run time; never pass a
service-role key to Flutter.

Run locally with project values supplied as Dart defines:

```bash
flutter pub get
flutter run \
  --dart-define=SUPABASE_URL=https://your-project.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=your-publishable-key \
  --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

Use `http://localhost:3000/api/v1` for Flutter web or desktop when the backend runs on
the same machine. The Android emulator uses `10.0.2.2` to reach the host machine.

Without Supabase configuration, the app shows the required configuration instead of
attempting authentication. New users create a profile and select interests before reaching
the authenticated home screen.
