import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:activity_discovery/main.dart';
import 'package:activity_discovery/features/auth/auth_flow.dart';
import 'package:activity_discovery/features/profile/profile_screen.dart';
import 'package:activity_discovery/features/activities/activity_screens.dart';
import 'package:activity_discovery/features/chat/chat_screen.dart';
import 'package:activity_discovery/features/notifications/notifications_screen.dart';

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

  testWidgets('Password visibility control toggles password field obscurity', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: AuthScreen()));
    final passwordFinder = find.byType(TextFormField).at(1);
    final toggleButton = find.byTooltip('Show password');

    TextField field = tester.widget<TextField>(
      find.descendant(of: passwordFinder, matching: find.byType(TextField)),
    );
    expect(field.obscureText, isTrue);
    expect(toggleButton, findsOneWidget);

    await tester.tap(toggleButton);
    await tester.pump();

    field = tester.widget<TextField>(
      find.descendant(of: passwordFinder, matching: find.byType(TextField)),
    );
    expect(field.obscureText, isFalse);
    expect(find.byTooltip('Hide password'), findsOneWidget);

    await tester.tap(find.byTooltip('Hide password'));
    await tester.pump();

    field = tester.widget<TextField>(
      find.descendant(of: passwordFinder, matching: find.byType(TextField)),
    );
    expect(field.obscureText, isTrue);
  });

  testWidgets(
    'AuthScreen switches between login and registration flows with appropriate validation',
    (WidgetTester tester) async {
      await tester.pumpWidget(const MaterialApp(home: AuthScreen()));

      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.text('Sign in'), findsOneWidget);
      expect(find.text('New here? Create an account'), findsOneWidget);

      await tester.tap(find.text('New here? Create an account'));
      await tester.pump();

      expect(find.text('Create your account'), findsOneWidget);
      expect(find.text('Create account'), findsOneWidget);
      expect(find.text('Already have an account? Sign in'), findsOneWidget);

      await tester.enterText(
        find.byType(TextFormField).at(0),
        'user@example.com',
      );
      await tester.enterText(find.byType(TextFormField).at(1), 'short');
      await tester.tap(find.text('Create account'));
      await tester.pump();

      expect(find.text('Use at least 8 characters'), findsOneWidget);
    },
  );

  testWidgets(
    'ProfileScreen loads existing profile and interests and saves updates',
    (WidgetTester tester) async {
      final api = _FakeApiClient(
        profile: {
          'userId': 'usr-1',
          'displayName': 'Alex',
          'bio': 'Active member',
        },
        userInterests: [
          {'interestId': 'cricket', 'name': 'Cricket', 'category': 'sports'},
        ],
      );

      var updated = false;
      await tester.pumpWidget(
        MaterialApp(
          home: ProfileScreen(api: api, onProfileUpdated: () => updated = true),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Alex'), findsOneWidget);
      expect(find.text('Active member'), findsOneWidget);
      expect(find.text('Cricket'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField).first, 'Alex Updated');
      await tester.tap(find.text('Football'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Save Changes'));
      await tester.pumpAndSettle();

      expect(updated, isTrue);
      expect(
        api.calls,
        containsAll(['/users/me', '/interests', '/interests/me']),
      );
      expect(api.savedBodies['/users/me']?['displayName'], 'Alex Updated');
    },
  );

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

  testWidgets(
    'Activity details submits a join request and shows pending state',
    (tester) async {
      final api = _FakeActivityApi();
      await tester.pumpWidget(
        MaterialApp(
          home: ActivityDetailsScreen(api: api, activityId: 'activity-1'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Request to join'), findsOneWidget);
      await tester.tap(find.text('Request to join'));
      await tester.pumpAndSettle();
      expect(find.text('Pending approval'), findsOneWidget);
      expect(api.calls, contains('POST /activities/activity-1/join'));
      expect(find.text('Cancel request'), findsOneWidget);
    },
  );

  testWidgets(
    'Host can review a pending request and view approved participants',
    (tester) async {
      final api = _FakeActivityApi(isHost: true, hasRequest: true);
      await tester.pumpWidget(
        MaterialApp(
          home: ActivityDetailsScreen(api: api, activityId: 'activity-1'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Join requests (1)'), findsOneWidget);
      expect(find.text('Riya'), findsOneWidget);
      await tester.drag(find.byType(ListView), const Offset(0, -400));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Approve request'));
      await tester.pumpAndSettle();
      expect(
        api.calls,
        contains('POST /activities/activity-1/requests/request-1/approve'),
      );
      expect(find.text('Participants (2)'), findsOneWidget);
    },
  );

  testWidgets('Host can reject a pending request', (tester) async {
    final api = _FakeActivityApi(isHost: true, hasRequest: true);
    await tester.pumpWidget(
      MaterialApp(
        home: ActivityDetailsScreen(api: api, activityId: 'activity-1'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, -400));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Reject request'));
    await tester.pumpAndSettle();
    expect(
      api.calls,
      contains('POST /activities/activity-1/requests/request-1/reject'),
    );
    expect(find.text('Join requests (0)'), findsOneWidget);
  });

  testWidgets(
    'Full activity disables the join action and shows remaining capacity',
    (tester) async {
      final api = _FakeActivityApi(full: true);
      await tester.pumpWidget(
        MaterialApp(
          home: ActivityDetailsScreen(api: api, activityId: 'activity-1'),
        ),
      );
      await tester.pumpAndSettle();
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Activity full'),
      );
      expect(button.onPressed, isNull);
      expect(find.textContaining('0 places remaining'), findsWidgets);
    },
  );

  testWidgets('Host or approved participant sees Group chat entry point', (
    tester,
  ) async {
    final api = _FakeActivityApi(isHost: true);
    await tester.pumpWidget(
      MaterialApp(
        home: ActivityDetailsScreen(api: api, activityId: 'activity-1'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Group chat'), findsOneWidget);
    expect(find.byTooltip('Group chat'), findsOneWidget);
  });

  testWidgets('Chat screen renders empty state when no messages exist', (
    tester,
  ) async {
    final api = _FakeChatApi(messages: []);
    await tester.pumpWidget(
      MaterialApp(
        home: ActivityChatScreen(
          api: api,
          activityId: 'activity-1',
          activityTitle: 'Morning run chat',
          enableRealtime: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Morning run chat'), findsOneWidget);
    expect(find.text('No messages yet.'), findsOneWidget);
    expect(
      find.text('Say hello to start coordinating with the group!'),
      findsOneWidget,
    );
  });

  testWidgets(
    'Chat screen renders messages with sent and received distinctions',
    (tester) async {
      final api = _FakeChatApi(
        messages: [
          {
            'messageId': 'msg-1',
            'activityId': 'activity-1',
            'senderId': 'prof-other',
            'senderSupabaseUserId': 'user-other',
            'senderName': 'Riya',
            'content': 'Hey everyone!',
            'createdAt': DateTime.now()
                .subtract(const Duration(minutes: 5))
                .toIso8601String(),
          },
          {
            'messageId': 'msg-2',
            'activityId': 'activity-1',
            'senderId': 'prof-me',
            'senderSupabaseUserId': 'user-me',
            'senderName': 'Me',
            'content': 'Hello Riya, ready for the run!',
            'createdAt': DateTime.now().toIso8601String(),
          },
        ],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ActivityChatScreen(
            api: api,
            activityId: 'activity-1',
            currentUserId: 'user-me',
            enableRealtime: false,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Hey everyone!'), findsOneWidget);
      expect(find.text('Riya'), findsOneWidget);
      expect(find.text('Hello Riya, ready for the run!'), findsOneWidget);
    },
  );

  testWidgets('Sending a message posts to API and updates conversation', (
    tester,
  ) async {
    final api = _FakeChatApi(messages: []);
    await tester.pumpWidget(
      MaterialApp(
        home: ActivityChatScreen(
          api: api,
          activityId: 'activity-1',
          currentUserId: 'user-me',
          enableRealtime: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'See you at 7am');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();
    expect(find.text('See you at 7am'), findsOneWidget);
    expect(api.sentBodies, contains(containsPair('content', 'See you at 7am')));
  });

  testWidgets('Chat ignores empty or whitespace messages', (tester) async {
    final api = _FakeChatApi(messages: []);
    await tester.pumpWidget(
      MaterialApp(
        home: ActivityChatScreen(
          api: api,
          activityId: 'activity-1',
          enableRealtime: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '   ');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pump();
    expect(api.sentBodies, isEmpty);
  });

  testWidgets('Chat displays error state on failure and allows retry', (
    tester,
  ) async {
    final api = _FakeChatApi(fail: true);
    await tester.pumpWidget(
      MaterialApp(
        home: ActivityChatScreen(
          api: api,
          activityId: 'activity-1',
          enableRealtime: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not load messages'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('Unauthorized user shows Access Restricted state', (
    tester,
  ) async {
    final api = _FakeChatApi(forbidden: true);
    await tester.pumpWidget(
      MaterialApp(
        home: ActivityChatScreen(
          api: api,
          activityId: 'activity-1',
          enableRealtime: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Access Restricted'), findsOneWidget);
    expect(
      find.textContaining('Only the host and approved participants'),
      findsOneWidget,
    );
    expect(find.text('Back to activity'), findsOneWidget);
  });

  testWidgets('Chat screen dedupes messages with same message ID', (
    tester,
  ) async {
    final msg = {
      'messageId': 'dup-1',
      'activityId': 'activity-1',
      'senderId': 'p1',
      'senderSupabaseUserId': 'u1',
      'senderName': 'Sam',
      'content': 'Single message',
      'createdAt': DateTime.now().toIso8601String(),
    };
    final api = _FakeChatApi(messages: [msg, msg]);
    await tester.pumpWidget(
      MaterialApp(
        home: ActivityChatScreen(
          api: api,
          activityId: 'activity-1',
          enableRealtime: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Single message'), findsOneWidget);
  });

  testWidgets('Chat screen handles pagination when more messages exist', (
    tester,
  ) async {
    final messages = List.generate(
      4,
      (i) => {
        'messageId': 'page-msg-$i',
        'activityId': 'activity-1',
        'senderId': 'p$i',
        'senderSupabaseUserId': 'u$i',
        'senderName': 'User $i',
        'content': 'Historical message $i',
        'createdAt': DateTime.now()
            .subtract(Duration(minutes: 20 - i))
            .toIso8601String(),
      },
    );
    final api = _FakeChatApi(messages: messages, hasMore: true);
    await tester.pumpWidget(
      MaterialApp(
        home: ActivityChatScreen(
          api: api,
          activityId: 'activity-1',
          enableRealtime: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Historical message 0'), findsOneWidget);
    expect(find.text('Historical message 3'), findsOneWidget);
  });

  testWidgets(
    'Notification badge displays unread count and navigates to screen',
    (tester) async {
      final api = _FakeNotificationsApi(unreadCount: 3);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            appBar: AppBar(actions: [NotificationBadgeButton(api: api)]),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('3'), findsOneWidget);
      expect(find.byIcon(Icons.notifications_active), findsOneWidget);

      await tester.tap(find.byType(NotificationBadgeButton));
      await tester.pumpAndSettle();
      expect(find.byType(NotificationsScreen), findsOneWidget);
    },
  );

  testWidgets(
    'Notifications screen displays list with unread indicators and handles mark all read',
    (tester) async {
      final notifications = [
        {
          'notificationId': 'n-1',
          'type': 'join_request',
          'title': 'New Join Request',
          'message': 'Jane requested to join Sunset Hike.',
          'activityId': 'act-1',
          'isRead': false,
          'readAt': null,
          'createdAt': DateTime.now()
              .subtract(const Duration(minutes: 5))
              .toIso8601String(),
        },
        {
          'notificationId': 'n-2',
          'type': 'activity_reminder',
          'title': 'Activity Reminder',
          'message': 'Morning Yoga starts in 2 hours.',
          'activityId': 'act-2',
          'isRead': true,
          'readAt': DateTime.now()
              .subtract(const Duration(hours: 1))
              .toIso8601String(),
          'createdAt': DateTime.now()
              .subtract(const Duration(hours: 2))
              .toIso8601String(),
        },
      ];

      final api = _FakeNotificationsApi(items: notifications, unreadCount: 1);
      await tester.pumpWidget(MaterialApp(home: NotificationsScreen(api: api)));
      await tester.pumpAndSettle();

      expect(find.text('New Join Request'), findsOneWidget);
      expect(find.text('Jane requested to join Sunset Hike.'), findsOneWidget);
      expect(find.text('Activity Reminder'), findsOneWidget);
      expect(find.text('Mark all read'), findsOneWidget);

      await tester.tap(find.text('Mark all read'));
      await tester.pumpAndSettle();

      expect(api.calls.any((c) => c.contains('/read-all')), isTrue);
    },
  );

  testWidgets(
    'Notifications screen displays empty state when no notifications',
    (tester) async {
      final api = _FakeNotificationsApi(items: [], unreadCount: 0);
      await tester.pumpWidget(MaterialApp(home: NotificationsScreen(api: api)));
      await tester.pumpAndSettle();

      expect(find.text('No notifications yet'), findsOneWidget);
    },
  );

  testWidgets('Notifications screen displays error and handles retry', (
    tester,
  ) async {
    final api = _FakeNotificationsApi(fail: true);
    await tester.pumpWidget(MaterialApp(home: NotificationsScreen(api: api)));
    await tester.pumpAndSettle();

    expect(find.text('Retry'), findsOneWidget);
  });
}

class _FakeApiClient extends ApiClient {
  _FakeApiClient({this.profile, this.userInterests})
    : super('https://api.example.test');

  final Map<String, dynamic>? profile;
  final List<Map<String, dynamic>>? userInterests;
  final List<String> calls = [];
  final Map<String, dynamic> savedBodies = {};

  @override
  Future<dynamic> request(String method, String path, {Object? body}) async {
    calls.add(path);
    if (method == 'GET' && path == '/interests') {
      return {
        'interests': [
          {'interestId': 'cricket', 'name': 'Cricket', 'category': 'sports'},
          {'interestId': 'football', 'name': 'Football', 'category': 'sports'},
        ],
      };
    }
    if (method == 'GET' && path == '/users/me') {
      return profile ??
          {
            'userId': 'usr-1',
            'displayName': 'Alex Rivera',
            'bio': 'Loves team sports and walks',
          };
    }
    if (method == 'GET' &&
        (path == '/interests/me' || path == '/users/me/interests')) {
      return {
        'count': (userInterests ?? []).length,
        'interests':
            userInterests ??
            [
              {
                'interestId': 'cricket',
                'name': 'Cricket',
                'category': 'sports',
              },
            ],
      };
    }
    if ((method == 'PUT' || method == 'PATCH') &&
        body is Map<String, dynamic>) {
      savedBodies[path] = body;
      return body;
    }
    return <String, dynamic>{};
  }
}

final _categories = <Map<String, dynamic>>[
  {'interestId': 'running', 'name': 'Running', 'category': 'fitness'},
];

class _FakeActivityApi extends ApiClient {
  _FakeActivityApi({
    this.empty = false,
    this.failActivities = false,
    this.isHost = false,
    this.hasRequest = false,
    this.full = false,
  }) : super('https://api.example.test');
  final bool empty;
  final bool failActivities;
  final bool isHost;
  final bool hasRequest;
  final bool full;
  String membershipStatus = 'none';
  bool requestApproved = false;
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
    'participantCount': 1,
    'remainingPlaces': 3,
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
    if (path.endsWith('/membership') && method == 'GET') {
      return {'status': membershipStatus};
    }
    if (path.endsWith('/join') && method == 'POST') {
      membershipStatus = 'requested';
      return {'status': membershipStatus};
    }
    if (path.contains('/requests') &&
        path.endsWith('/approve') &&
        method == 'POST') {
      requestApproved = true;
      return {'status': 'approved'};
    }
    if (path.contains('/requests') &&
        path.endsWith('/reject') &&
        method == 'POST') {
      requestApproved = true;
      return {'status': 'rejected'};
    }
    if (path.endsWith('/requests') && method == 'GET') {
      return {
        'items': hasRequest && !requestApproved
            ? [
                {'membershipId': 'request-1', 'displayName': 'Riya'},
              ]
            : <dynamic>[],
      };
    }
    if (path.endsWith('/participants') && method == 'GET') {
      return {
        'items': membershipStatus == 'approved' || requestApproved
            ? [
                {'displayName': 'Sam', 'role': 'host'},
                {'displayName': 'Riya', 'role': 'participant'},
              ]
            : [
                {'displayName': 'Sam', 'role': 'host'},
              ],
      };
    }
    if (path.endsWith('/membership') && method == 'DELETE') {
      membershipStatus = 'withdrawn';
      return {'status': membershipStatus};
    }
    if (path == '/interests') return {'interests': _categories};
    if (path.startsWith('/activities?')) {
      if (failActivities) throw const ApiException(503, 'offline');
      return {
        'items': empty ? <dynamic>[] : [activity],
        'pagination': {'limit': 20, 'offset': 0, 'total': empty ? 0 : 1},
      };
    }
    if (path.startsWith('/activities/')) {
      return {
        ...activity,
        'isHost': isHost,
        'participantCount': full
            ? 4
            : membershipStatus == 'approved' || requestApproved
            ? 2
            : 1,
        'remainingPlaces': full
            ? 0
            : membershipStatus == 'approved' || requestApproved
            ? 2
            : 3,
      };
    }
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

class _FakeChatApi extends ApiClient {
  _FakeChatApi({
    this.messages = const [],
    this.fail = false,
    this.forbidden = false,
    this.hasMore = false,
  }) : super('https://api.example.test');

  final List<Map<String, dynamic>> messages;
  final bool fail;
  final bool forbidden;
  final bool hasMore;
  final List<String> calls = [];
  final List<Map<String, dynamic>> sentBodies = [];

  @override
  Future<dynamic> request(String method, String path, {Object? body}) async {
    calls.add('$method $path');
    if (fail) throw const ApiException(500, 'Server error');
    if (forbidden) throw const ApiException(403, 'Forbidden');

    if (method == 'GET' && path.contains('/messages')) {
      return {
        'items': messages,
        'pagination': {
          'limit': 50,
          'offset': 0,
          'total': messages.length,
          'hasMore': hasMore,
        },
      };
    }
    if (method == 'POST' && path.contains('/messages')) {
      final bodyMap = body as Map<String, dynamic>;
      sentBodies.add(bodyMap);
      return {
        'messageId': 'msg-new-${calls.length}',
        'activityId': 'activity-1',
        'senderId': 'user-1-prof',
        'senderSupabaseUserId': 'user-me',
        'senderName': 'Me',
        'content': bodyMap['content'],
        'createdAt': DateTime.now().toIso8601String(),
      };
    }
    return <String, dynamic>{};
  }
}

class _FakeNotificationsApi extends ApiClient {
  _FakeNotificationsApi({
    this.items = const [],
    this.unreadCount = 0,
    this.fail = false,
  }) : super('https://api.example.test');

  final List<Map<String, dynamic>> items;
  final int unreadCount;
  final bool fail;
  final List<String> calls = [];

  @override
  Future<dynamic> request(String method, String path, {Object? body}) async {
    calls.add('$method $path');
    if (fail) throw const ApiException(500, 'Server error');
    if (path.startsWith('/notifications/unread-count')) {
      return {'unreadCount': unreadCount};
    }
    if (method == 'GET' && path.startsWith('/notifications')) {
      return {
        'items': items,
        'unreadCount': unreadCount,
        'pagination': {
          'limit': 20,
          'offset': 0,
          'total': items.length,
          'hasMore': false,
        },
      };
    }
    if (method == 'PATCH' && path.contains('/read-all')) {
      return {'updatedCount': unreadCount};
    }
    if (method == 'PATCH' && path.contains('/read')) {
      return {'readAt': DateTime.now().toIso8601String()};
    }
    if (method == 'DELETE' && path.startsWith('/notifications/')) {
      return {'dismissed': true};
    }
    return <String, dynamic>{};
  }
}
