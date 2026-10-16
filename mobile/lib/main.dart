import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/constants/app_constants.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_flow.dart';

const _defaultSupabaseUrl = 'https://viiwqzyrjhetpsypgpdh.supabase.co';
const _defaultSupabaseAnonKey =
    'sb_publishable_pWGsGud7sFXaNSTLtlpA7g_SqquD0j1';

// In release builds, never fall back to hardcoded development credentials or URLs
const _supabaseUrl = String.fromEnvironment(
  'SUPABASE_URL',
  defaultValue: kReleaseMode ? '' : _defaultSupabaseUrl,
);
const _supabaseAnonKey = String.fromEnvironment(
  'SUPABASE_ANON_KEY',
  defaultValue: kReleaseMode ? '' : _defaultSupabaseAnonKey,
);

const _defaultDevApiBaseUrl = 'http://localhost:3000/api/v1';

String resolveApiBaseUrl() {
  const envUrl = String.fromEnvironment('API_BASE_URL');
  if (envUrl.isNotEmpty) return envUrl;
  if (kReleaseMode) return '';
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.19.45:3000/api/v1';
  }
  return _defaultDevApiBaseUrl;
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const storage = FlutterSecureStorage();
  final savedUrl = await storage.read(key: 'activity_discovery_api_base_url');
  final resolvedUrl = resolveApiBaseUrl();

  final String apiBaseUrl;
  if (kReleaseMode) {
    // Release builds require an explicit HTTPS production URL and cannot silently fall back to localhost or dev IPs
    if (savedUrl != null && savedUrl.startsWith('https://')) {
      apiBaseUrl = savedUrl;
    } else if (resolvedUrl.startsWith('https://')) {
      apiBaseUrl = resolvedUrl;
    } else {
      apiBaseUrl = '';
    }
  } else {
    apiBaseUrl = (savedUrl != null && savedUrl.isNotEmpty)
        ? savedUrl
        : resolvedUrl;
  }

  final configured =
      _supabaseUrl.startsWith('https://') &&
      _supabaseAnonKey.isNotEmpty &&
      (!kReleaseMode || apiBaseUrl.startsWith('https://'));
  if (configured) {
    await Supabase.initialize(
      url: _supabaseUrl,
      publishableKey: _supabaseAnonKey,
      authOptions: FlutterAuthClientOptions(
        localStorage: _SecureSessionStorage(),
      ),
    );
  }
  runApp(ActivityDiscoveryApp(configured: configured, apiBaseUrl: apiBaseUrl));
}

class _SecureSessionStorage extends LocalStorage {
  static const _sessionKey = 'activity_discovery_supabase_session';
  static const _storage = FlutterSecureStorage();

  @override
  Future<void> initialize() async {}

  @override
  Future<bool> hasAccessToken() async => await accessToken() != null;

  @override
  Future<String?> accessToken() => _storage.read(key: _sessionKey);

  @override
  Future<void> removePersistedSession() => _storage.delete(key: _sessionKey);

  @override
  Future<void> persistSession(String persistSessionString) =>
      _storage.write(key: _sessionKey, value: persistSessionString);
}

class ActivityDiscoveryApp extends StatelessWidget {
  const ActivityDiscoveryApp({
    super.key,
    this.configured = false,
    this.apiBaseUrl = _defaultDevApiBaseUrl,
  });

  final bool configured;
  final String apiBaseUrl;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: AppConstants.appName,
    debugShowCheckedModeBanner: false,
    theme: AppTheme.lightTheme,
    home: configured
        ? AuthFlow(apiBaseUrl: apiBaseUrl)
        : const _ConfigurationScreen(),
  );
}

class _ConfigurationScreen extends StatelessWidget {
  const _ConfigurationScreen();

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: const [
            Icon(Icons.groups_outlined, size: 56),
            SizedBox(height: 16),
            Text(
              AppConstants.appName,
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 12),
            Text(
              'Set SUPABASE_URL and SUPABASE_ANON_KEY (and API_BASE_URL for release builds) with --dart-define to connect. The anon key is safe for client use; never use a service-role key here.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    ),
  );
}
