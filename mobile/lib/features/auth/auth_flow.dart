import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/network/api_client.dart';
import '../activities/activity_screens.dart';
import '../notifications/notifications_screen.dart';
import '../profile/profile_screen.dart';

export '../../core/network/api_client.dart' show ApiClient, ApiException;

class AuthFlow extends StatefulWidget {
  const AuthFlow({super.key, required this.apiBaseUrl});
  final String apiBaseUrl;
  @override
  State<AuthFlow> createState() => _AuthFlowState();
}

class _AuthFlowState extends State<AuthFlow> {
  late final ApiClient api = ApiClient(widget.apiBaseUrl);
  Session? session;
  bool checkingProfile = false;
  bool hasProfile = false;
  String? profileError;
  @override
  void initState() {
    super.initState();
    session = Supabase.instance.client.auth.currentSession;
    Supabase.instance.client.auth.onAuthStateChange.listen((event) {
      if (!mounted) return;
      setState(() {
        session = event.session;
        profileError = null;
      });
      if (event.session != null) _checkProfile();
    });
    if (session != null) _checkProfile();
  }

  Future<void> _checkProfile() async {
    setState(() {
      checkingProfile = true;
      profileError = null;
    });
    try {
      await api.request('GET', '/users/me');
      final saved = await api.request('GET', '/interests/me');
      final savedInterests = (saved['interests'] as List<dynamic>?) ?? [];
      if (mounted) {
        setState(() {
          hasProfile = savedInterests.isNotEmpty;
          checkingProfile = false;
        });
      }
    } catch (e) {
      if (e is ApiException && e.statusCode == 401) {
        // Expired or revoked session: sign out cleanly to show sign-in screen
        await Supabase.instance.client.auth.signOut();
        if (mounted) {
          setState(() {
            session = null;
            checkingProfile = false;
            profileError = null;
          });
        }
        return;
      }
      final missingProfile = e is ApiException && e.statusCode == 404;
      if (mounted) {
        setState(() {
          hasProfile = !missingProfile;
          checkingProfile = false;
          profileError = missingProfile ? null : 'Could not load your profile. Check the API connection and try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (session == null) return const AuthScreen();
    if (checkingProfile) {
      return const _LoadingScreen(label: 'Checking your profile…');
    }
    if (profileError != null) {
      return _RetryScreen(
        message: profileError!,
        currentUrl: api.baseUrl,
        onRetry: _checkProfile,
        onUpdateUrl: (newUrl) {
          setState(() {
            api.baseUrl = newUrl;
          });
          _checkProfile();
        },
        onSignOut: () async {
          await Supabase.instance.client.auth.signOut();
        },
      );
    }
    return hasProfile
        ? HomeScreen(api: api)
        : OnboardingScreen(
            api: api,
            onComplete: () => setState(() => hasProfile = true),
          );
  }
}

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool registering = false, busy = false;
  bool _obscurePassword = true;
  String? error, info;
  Future<void> submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      busy = true;
      error = null;
      info = null;
    });
    try {
      if (registering) {
        final result = await Supabase.instance.client.auth.signUp(
          email: _email.text.trim(),
          password: _password.text,
        );
        if (result.session == null && mounted) {
          setState(
            () => info =
                'Check your email to confirm your account, then sign in.',
          );
        }
      } else {
        await Supabase.instance.client.auth.signInWithPassword(
          email: _email.text.trim(),
          password: _password.text,
        );
      }
    } on AuthException catch (e) {
      if (mounted) setState(() => error = e.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => error = 'Could not connect. Check your network and try again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  final _form = GlobalKey<FormState>();
  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.groups_outlined, size: 56),
                const SizedBox(height: 16),
                Text(
                  registering ? 'Create your account' : 'Welcome back',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Find your people. Make a plan.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) =>
                      v == null ||
                          !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
                              .hasMatch(v.trim())
                      ? 'Enter a valid email'
                      : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _password,
                  obscureText: _obscurePassword,
                  autofillHints: [
                    registering
                        ? AutofillHints.newPassword
                        : AutofillHints.password,
                  ],
                  decoration: InputDecoration(
                    labelText: 'Password',
                    border: const OutlineInputBorder(),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                      tooltip: _obscurePassword
                          ? 'Show password'
                          : 'Hide password',
                      onPressed: () =>
                          setState(() => _obscurePassword = !_obscurePassword),
                    ),
                  ),
                  validator: (v) => v == null || v.length < 8
                      ? 'Use at least 8 characters'
                      : null,
                ),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                if (info != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      info!,
                      style: const TextStyle(color: Colors.green),
                    ),
                  ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: busy ? null : submit,
                  child: busy
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(registering ? 'Create account' : 'Sign in'),
                ),
                TextButton(
                  onPressed: busy
                      ? null
                      : () => setState(() {
                          registering = !registering;
                          error = null;
                          info = null;
                        }),
                  child: Text(
                    registering
                        ? 'Already have an account? Sign in'
                        : 'New here? Create an account',
                  ),
                ),
                if (!registering)
                  TextButton(
                    onPressed: busy
                        ? null
                        : () async {
                            if (_email.text.trim().isEmpty) {
                              setState(() => error = 'Enter your email first.');
                              return;
                            }
                            try {
                              await Supabase.instance.client.auth
                                  .resetPasswordForEmail(_email.text.trim());
                              if (mounted) {
                                setState(
                                  () => info = 'Password reset instructions sent if that account exists.',
                                );
                              }
                            } catch (_) {
                              if (mounted) {
                                setState(
                                  () => error = 'Could not send reset instructions. Try again.',
                                );
                              }
                            }
                          },
                    child: const Text('Forgot password?'),
                  ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({
    super.key,
    required this.api,
    required this.onComplete,
  });
  final ApiClient api;
  final VoidCallback onComplete;
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _name = TextEditingController(), _bio = TextEditingController();
  List<dynamic> interests = [];
  final Set<String> selected = {};
  bool loading = true, saving = false;
  String? error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await widget.api.request('GET', '/interests');
      if (mounted) {
        setState(() {
          interests = (data['interests'] as List<dynamic>);
          loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          error = 'Could not load interests. Check the API and retry.';
          loading = false;
        });
      }
    }
  }

  Future<void> _save() async {
    if (_name.text.trim().length < 2) {
      setState(() => error = 'Name must be at least 2 characters.');
      return;
    }
    if (selected.isEmpty) {
      setState(() => error = 'Choose at least one interest.');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await widget.api.request(
        'PUT',
        '/users/me',
        body: {'displayName': _name.text.trim(), 'bio': _bio.text.trim()},
      );
      await widget.api.request(
        'PUT',
        '/interests/me',
        body: {'interestIds': selected.toList()},
      );
      widget.onComplete();
    } catch (_) {
      if (mounted) {
        setState(
          () => error = 'Could not save onboarding. Check your API and database, then retry.',
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _bio.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Set up your profile')),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : interests.isEmpty
        ? _RetryScreen(
            message: error ?? 'No interests are available.',
            onRetry: _load,
          )
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                'A little about you',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _name,
                maxLength: 50,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Display name',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _bio,
                maxLength: 300,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Bio (optional)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Choose your interests',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 4),
              const Text('Select at least one. You can change these later.'),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: interests.map((item) {
                  final id = item['interestId'] as String;
                  return FilterChip(
                    label: Text(item['name'] as String),
                    selected: selected.contains(id),
                    onSelected: (value) => setState(() {
                      value ? selected.add(id) : selected.remove(id);
                    }),
                  );
                }).toList(),
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: saving ? null : _save,
                child: saving
                    ? const CircularProgressIndicator()
                    : const Text('Save and continue'),
              ),
            ],
          ),
  );
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? profile;
  bool loading = true;
  String? error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await widget.api.request('GET', '/users/me');
      if (mounted) {
        setState(() {
          profile = p;
          loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          error = 'Could not load your profile.';
          loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Activity Discovery'),
      actions: [
        NotificationBadgeButton(api: widget.api),
        IconButton(
          tooltip: 'My profile & interests',
          icon: const Icon(Icons.person_outline),
          onPressed: () async {
            await Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => ProfileScreen(api: widget.api)),
            );
            _load();
          },
        ),
        IconButton(
          tooltip: 'Sign out',
          onPressed: () => Supabase.instance.client.auth.signOut(),
          icon: const Icon(Icons.logout),
        ),
      ],
    ),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : error != null
        ? _RetryScreen(message: error!, onRetry: _load)
        : Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.explore_outlined, size: 56),
                  const SizedBox(height: 16),
                  Text(
                    'Welcome, ${profile?['displayName'] ?? 'friend'}',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Find an activity nearby or make a plan with others.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) =>
                            ActivityDiscoveryScreen(api: widget.api),
                      ),
                    ),
                    icon: const Icon(Icons.explore_outlined),
                    label: const Text('Discover activities'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ActivityDiscoveryScreen(
                          api: widget.api,
                          openCreateOnStart: true,
                        ),
                      ),
                    ),
                    icon: const Icon(Icons.add),
                    label: const Text('Create an activity'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => ProfileScreen(api: widget.api),
                        ),
                      );
                      _load();
                    },
                    icon: const Icon(Icons.person_outline),
                    label: const Text('My profile & interests'),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () async {
                      await Supabase.instance.client.auth.signOut();
                    },
                    child: const Text('Sign out'),
                  ),
                ],
              ),
            ),
          ),
  );
}

class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 12),
          Text(label),
        ],
      ),
    ),
  );
}

class _RetryScreen extends StatefulWidget {
  const _RetryScreen({
    required this.message,
    required this.onRetry,
    this.currentUrl,
    this.onUpdateUrl,
    this.onSignOut,
  });

  final String message;
  final Future<void> Function() onRetry;
  final String? currentUrl;
  final ValueChanged<String>? onUpdateUrl;
  final Future<void> Function()? onSignOut;

  @override
  State<_RetryScreen> createState() => _RetryScreenState();
}

class _RetryScreenState extends State<_RetryScreen> {
  bool _isRetrying = false;

  void _showChangeUrlDialog() {
    final controller = TextEditingController(text: widget.currentUrl ?? '');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Configure API Base URL'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Enter the backend API endpoint URL reachable by this device:',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                labelText: 'API Base URL',
                hintText: 'http://<PC_IP>:3000/api/v1',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                ActionChip(
                  label: const Text('localhost:3000 (USB)'),
                  onPressed: () =>
                      controller.text = 'http://localhost:3000/api/v1',
                ),
                ActionChip(
                  label: const Text('10.0.2.2:3000 (Emulator)'),
                  onPressed: () =>
                      controller.text = 'http://10.0.2.2:3000/api/v1',
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final newUrl = controller.text.trim();
              if (newUrl.isNotEmpty && widget.onUpdateUrl != null) {
                Navigator.pop(ctx);
                widget.onUpdateUrl!(newUrl);
              }
            },
            child: const Text('Save & Reconnect'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.cloud_off_rounded,
              size: 56,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 16),
            const Text(
              'Connection Error',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              widget.message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            if (widget.currentUrl != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: SelectableText(
                  'Target: ${widget.currentUrl}',
                  style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
                ),
              ),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _isRetrying
                    ? null
                    : () async {
                        setState(() => _isRetrying = true);
                        try {
                          await widget.onRetry();
                        } finally {
                          if (mounted) setState(() => _isRetrying = false);
                        }
                      },
                icon: _isRetrying
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
                label: Text(_isRetrying ? 'Retrying…' : 'Retry'),
              ),
            ),
            if (widget.onUpdateUrl != null && widget.currentUrl != null) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _showChangeUrlDialog,
                  icon: const Icon(Icons.settings_ethernet),
                  label: const Text('Change Server URL'),
                ),
              ),
            ],
            if (widget.onSignOut != null) ...[
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: widget.onSignOut,
                icon: const Icon(Icons.logout),
                label: const Text('Sign Out'),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}
