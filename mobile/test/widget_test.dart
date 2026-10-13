import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:activity_discovery/main.dart';
import 'package:activity_discovery/features/auth/auth_flow.dart';
import 'package:activity_discovery/features/activities/activity_screens.dart';

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

  testWidgets(
    'Activity form validates required fields, dates, and total capacity',
    (tester) async {
      final api = _FakeActivityApi();
      await tester.pumpWidget(
        MaterialApp(
          home: ActivityFormScreen(api: api, categories: _categories),
        ),
      );
      await tester.ensureVisible(find.text('Publish activity'));
      await tester.tap(find.text('Publish activity'));
      await tester.pumpAndSettle();
      expect(find.text('Enter at least 3 characters'), findsOneWidget);
      expect(find.text('Enter a whole number from 1 to 100'), findsOneWidget);

      Future<void> enterField(int index, String value) async {
        final field = find.byType(TextFormField).at(index);
        await tester.ensureVisible(field);
        await tester.enterText(field, value);
      }

      await enterField(0, 'Run club');
      await enterField(1, 'Easy run');
      await enterField(2, 'City park');
      await enterField(3, 'North entrance');
      final category = find.byType(DropdownButtonFormField<String>).first;
      await tester.ensureVisible(category);
      await tester.tap(find.byType(DropdownButtonFormField<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Running').last);
      await tester.pumpAndSettle();
      await enterField(4, '6');
      await tester.ensureVisible(find.text('Publish activity'));
      await tester.tap(find.text('Publish activity'));
      await tester.pumpAndSettle();
      expect(find.text('Choose a future date and start time.'), findsOneWidget);

      await enterField(4, '0');
      await tester.ensureVisible(find.text('Publish activity'));
      await tester.tap(find.text('Publish activity'));
      await tester.pumpAndSettle();
      expect(find.text('Enter a whole number from 1 to 100'), findsOneWidget);
      expect(api.calls, isEmpty);
    },
  );

  testWidgets('Activity card renders capacity and opens the details screen', (
    tester,
  ) async {
    final api = _FakeActivityApi();
    await tester.pumpWidget(
      MaterialApp(home: ActivityDiscoveryScreen(api: api)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Morning run'), findsOneWidget);
    expect(find.text('4 people total · host included'), findsOneWidget);
    await tester.tap(find.text('Morning run'));
    await tester.pumpAndSettle();
    expect(find.text('Activity details'), findsOneWidget);
    expect(find.text('A relaxed group run.'), findsOneWidget);
  });

  testWidgets('Activity discovery shows a loading state while fetching', (
    tester,
  ) async {
    final api = _DelayedActivityApi();
    await tester.pumpWidget(
      MaterialApp(home: ActivityDiscoveryScreen(api: api)),
    );
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    api.complete();
    await tester.pumpAndSettle();
    expect(find.text('Morning run'), findsOneWidget);
  });

  testWidgets('Activity discovery shows empty and error states', (
    tester,
  ) async {
    final emptyApi = _FakeActivityApi(empty: true);
    await tester.pumpWidget(
      MaterialApp(home: ActivityDiscoveryScreen(api: emptyApi)),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('No activities match'), findsOneWidget);

    final failedApi = _FakeActivityApi(failActivities: true);
    await tester.pumpWidget(
      MaterialApp(
        home: ActivityDiscoveryScreen(key: UniqueKey(), api: failedApi),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not load activities'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
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

final _categories = <Map<String, dynamic>>[
  {'interestId': 'running', 'name': 'Running', 'category': 'fitness'},
];

class _FakeActivityApi extends ApiClient {
  _FakeActivityApi({this.empty = false, this.failActivities = false})
    : super('https://api.example.test');
  final bool empty;
  final bool failActivities;
  final List<String> calls = [];

  static final activity = <String, dynamic>{
    'activityId': '00000000-0000-4000-8000-000000000001',
    'title': 'Morning run',
    'description': 'A relaxed group run.',
    'categoryId': 'running',
    'category': 'Running',
    'locationName': 'City park',
    'locationDescription': 'North entrance',
    'startsAt': DateTime.now()
        .add(const Duration(days: 1))
        .toUtc()
        .toIso8601String(),
    'endsAt': null,
    'minParticipants': 1,
    'maxParticipants': 4,
    'estimatedCost': null,
    'visibility': 'public',
    'joinPolicy': 'approval',
    'status': 'scheduled',
    'hostName': 'Sam',
    'isHost': false,
  };

  @override
  Future<dynamic> request(String method, String path, {Object? body}) async {
    calls.add('$method $path');
    if (path == '/interests') return {'interests': _categories};
    if (path.startsWith('/activities?')) {
      if (failActivities) throw const ApiException(503, 'offline');
      return {
        'items': empty ? <dynamic>[] : [activity],
        'pagination': {'limit': 20, 'offset': 0, 'total': empty ? 0 : 1},
      };
    }
    if (path.startsWith('/activities/')) return activity;
    return {'activity': activity};
  }
}

class _DelayedActivityApi extends ApiClient {
  _DelayedActivityApi() : super('https://api.example.test');
  final Completer<dynamic> result = Completer<dynamic>();
  void complete() => result.complete({
    'items': [_FakeActivityApi.activity],
    'pagination': {'limit': 20, 'offset': 0, 'total': 1},
  });

  @override
  Future<dynamic> request(String method, String path, {Object? body}) async {
    if (path == '/interests') return {'interests': _categories};
    return result.future;
  }
}
