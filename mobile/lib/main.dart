import 'package:flutter/material.dart';

import 'core/constants/app_constants.dart';
import 'core/presentation/app_shell.dart';
import 'core/theme/app_theme.dart';

void main() {
  runApp(const ActivityDiscoveryApp());
}

class ActivityDiscoveryApp extends StatelessWidget {
  const ActivityDiscoveryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const AppShell(),
    );
  }
}
