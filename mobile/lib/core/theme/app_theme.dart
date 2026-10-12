import 'package:flutter/material.dart';

/// App theme adhering to the UI/UX design specification:
/// - Primary: #356AE6
/// - Deep Navy: #172B4D
/// - Accent Teal: #17A398
/// - Canvas: #F5F7FB
/// - Success: #198754
/// - Warning: #B7791F
/// - Danger: #C53030
class AppTheme {
  static const Color primary = Color(0xFF356AE6);
  static const Color deepNavy = Color(0xFF172B4D);
  static const Color accentTeal = Color(0xFF17A398);
  static const Color canvas = Color(0xFFF5F7FB);
  static const Color surface = Colors.white;
  static const Color success = Color(0xFF198754);
  static const Color warning = Color(0xFFB7791F);
  static const Color danger = Color(0xFFC53030);

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: canvas,
      colorScheme: const ColorScheme(
        brightness: Brightness.light,
        primary: primary,
        onPrimary: Colors.white,
        secondary: accentTeal,
        onSecondary: Colors.white,
        error: danger,
        onError: Colors.white,
        surface: surface,
        onSurface: deepNavy,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: surface,
        foregroundColor: deepNavy,
        elevation: 0,
        centerTitle: false,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: primary,
        unselectedItemColor: Color(0xFF7A869A),
        showUnselectedLabels: true,
        type: BottomNavigationBarType.fixed,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFFEBECF0)),
        ),
      ),
    );
  }
}
