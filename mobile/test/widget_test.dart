import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:activity_discovery/main.dart';
import 'package:activity_discovery/features/auth/auth_flow.dart';

void main() {
  testWidgets('App explains required Supabase client configuration', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const ActivityDiscoveryApp());
    expect(
      find.textContaining('Set SUPABASE_URL and SUPABASE_ANON_KEY'),
      findsOneWidget,
    );
    expect(find.textContaining('service-role key'), findsOneWidget);
  });

  testWidgets('Sign-in validates email before contacting Supabase', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: AuthScreen()));
    await tester.enterText(find.byType(TextFormField).at(0), 'not-an-email');
    await tester.enterText(
      find.byType(TextFormField).at(1),
      'long-enough-password',
    );
    await tester.tap(find.text('Sign in'));
    await tester.pump();

    expect(find.text('Enter a valid email'), findsOneWidget);
  });

  testWidgets('Onboarding validates and saves profile and interests', (
    WidgetTester tester,
  ) async {
    final api = _FakeApiClient();
    var completed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: OnboardingScreen(api: api, onComplete: () => completed = true),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Save and continue'));
    await tester.pump();
    expect(find.text('Name must be at least 2 characters.'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, 'Sam');
    await tester.tap(find.text('Cricket'));
    await tester.tap(find.text('Save and continue'));
    await tester.pumpAndSettle();

    expect(completed, isTrue);
    expect(api.calls, containsAll(['/users/me', '/interests/me']));
  });
}

class _FakeApiClient extends ApiClient {
  _FakeApiClient() : super('https://api.example.test');

  final List<String> calls = [];

  @override
  Future<dynamic> request(String method, String path, {Object? body}) async {
    if (method == 'GET' && path == '/interests') {
      return {
        'interests': [
          {'interestId': 'cricket', 'name': 'Cricket', 'category': 'sports'},
        ],
      };
    }
    calls.add(path);
    return <String, dynamic>{};
  }
}
