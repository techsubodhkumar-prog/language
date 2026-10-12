import 'package:flutter_test/flutter_test.dart';

import 'package:activity_discovery/main.dart';
import 'package:activity_discovery/core/constants/app_constants.dart';

void main() {
  testWidgets('App renders Activity Discovery Platform shell', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const ActivityDiscoveryApp());

    // Verify application title is rendered in AppBar
    expect(find.text(AppConstants.appName), findsOneWidget);

    // Verify tagline and milestone text
    expect(find.text(AppConstants.appTagline), findsOneWidget);
    expect(find.text(AppConstants.milestone), findsOneWidget);

    // Verify bottom navigation bar items
    expect(find.text('Explore'), findsOneWidget);
    expect(find.text('Create'), findsOneWidget);
    expect(find.text('Inbox'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);

    // Test tab navigation
    await tester.tap(find.text('Create'));
    await tester.pump();
    expect(find.text('Create Activity'), findsOneWidget);

    await tester.tap(find.text('Inbox'));
    await tester.pump();
    expect(find.text('Inbox'), findsWidgets);

    await tester.tap(find.text('Profile'));
    await tester.pump();
    expect(find.text('Profile'), findsWidgets);
  });
}
