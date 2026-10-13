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
  --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

### Connecting to Backend

1. **Start the backend first**:
   ```bash
   cd backend
   npm run start:dev
   ```

2. **Physical Android Device (via USB)**:
   Forward port 3000 from the phone to your computer:
   ```bash
   adb reverse tcp:3000 tcp:3000
   ```
   Now `http://localhost:3000/api/v1` will connect seamlessly over USB.

3. **Physical Android Device (via Wi-Fi)**:
   Find your computer's local IP (e.g. `10.0.19.45`) and run:
   ```bash
   flutter run --dart-define=API_BASE_URL=http://10.0.19.45:3000/api/v1
   ```
   Or change the server URL directly inside the app using the **Change Server URL** button on the error screen.

4. **Android Emulator**:
   The emulator routes host machine loopback to `10.0.2.2`:
   ```bash
   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
   ```

5. **Desktop / Web**:
   Uses `http://localhost:3000/api/v1` by default.
