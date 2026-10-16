import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../chat/chat_screen.dart';
import '../notifications/notifications_screen.dart';

class PlayScreen extends StatefulWidget {
  const PlayScreen({
    super.key,
    required this.api,
    required this.onOpenCategories,
  });

  final ApiClient api;
  final VoidCallback onOpenCategories;

  @override
  State<PlayScreen> createState() => _PlayScreenState();
}

class _PlayScreenState extends State<PlayScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _myChats = [];

  @override
  void initState() {
    super.initState();
    _loadChats();
  }

  Future<void> _loadChats() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // 1. Fetch activities hosted or joined
      final membershipsRes = await widget.api.request('GET', '/memberships/me');
      final memberships = (membershipsRes['items'] as List<dynamic>?) ?? [];

      // 2. Fetch public scheduled activities
      final activitiesRes = await widget.api.request(
        'GET',
        '/activities?limit=50&offset=0',
      );
      final allActivities = (activitiesRes['items'] as List<dynamic>?) ?? [];

      // Filter activities where user is host or approved member
      final joinedActivityIds = memberships
          .where((m) => m['status'] == 'approved')
          .map((m) => m['activityId'] as String?)
          .whereType<String>()
          .toSet();

      final activeList = <Map<String, dynamic>>[];
      for (final a in allActivities) {
        final id = a['activityId'] as String?;
        final isHost = a['isHost'] == true;
        if (id != null && (isHost || joinedActivityIds.contains(id))) {
          activeList.add(Map<String, dynamic>.from(a as Map));
        }
      }

      if (mounted) {
        setState(() {
          _myChats = activeList;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Could not load your activity chats. Pull down to refresh.';
        });
      }
    }
  }

  void _openChat(Map<String, dynamic> activity) {
    final activityId = activity['activityId'] as String;
    final title = (activity['title'] as String?) ?? 'Activity Chat';

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ActivityChatScreen(
          api: widget.api,
          activityId: activityId,
          activityTitle: title,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Play & Messages',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 18,
                color: AppTheme.deepNavy,
              ),
            ),
            Text(
              'Live group chats & team coordination',
              style: TextStyle(
                fontSize: 12,
                color: Color(0xFF64748B),
                fontWeight: FontWeight.normal,
              ),
            ),
          ],
        ),
        actions: [
          NotificationBadgeButton(api: widget.api),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh chats',
            onPressed: _loadChats,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadChats,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
          children: [
            // Quick Broadcast Banner
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1E3A8A), Color(0xFF3B82F6)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(18),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF3B82F6).withValues(alpha: 0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.play_circle_filled,
                          color: Colors.white,
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text(
                          'Send Message to Teammates',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Pick any sport or activity category to select team size, location, and broadcast instant messages to users with matching profiles!',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: widget.onOpenCategories,
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: AppTheme.primary,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 10,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    icon: const Icon(Icons.grid_view_rounded, size: 18),
                    label: const Text(
                      'Browse Categories & Send Msg',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Active chats heading
            Row(
              children: [
                const Icon(
                  Icons.chat_bubble_outline,
                  size: 20,
                  color: AppTheme.deepNavy,
                ),
                const SizedBox(width: 8),
                const Text(
                  'Active Group Chats',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.deepNavy,
                  ),
                ),
                const Spacer(),
                if (!_loading && _myChats.isNotEmpty)
                  Text(
                    '${_myChats.length} active',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF64748B),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),

            if (_loading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (_error != null)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    Text(_error!, style: TextStyle(color: Colors.red.shade800)),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _loadChats,
                      child: const Text('Try Again'),
                    ),
                  ],
                ),
              )
            else if (_myChats.isEmpty)
              Container(
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withValues(alpha: 0.1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.forum_outlined,
                        size: 36,
                        color: AppTheme.primary,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'No Active Group Chats Yet',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                        color: AppTheme.deepNavy,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'When you create an activity or join one, the live group chat will appear here for real-time messaging.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: widget.onOpenCategories,
                      child: const Text('Start an Activity Now'),
                    ),
                  ],
                ),
              )
            else
              ..._myChats.map((chat) {
                final isHost = chat['isHost'] == true;
                final title = (chat['title'] as String?) ?? 'Activity';
                final category = (chat['category'] as String?) ?? 'Domain';
                final location = (chat['locationName'] as String?) ?? '';
                final participants = chat['participantCount'] ?? 1;
                final capacity = chat['maxParticipants'] ?? 1;

                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  elevation: 0,
                  color: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 6,
                    ),
                    leading: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppTheme.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.group_rounded,
                        color: AppTheme.primary,
                      ),
                    ),
                    title: Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                        color: AppTheme.deepNavy,
                      ),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF1F5F9),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                category,
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF475569),
                                ),
                              ),
                            ),
                            if (location.isNotEmpty) ...[
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  location,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12),
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '$participants/$capacity players · ${isHost ? 'Host' : 'Member'}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                    trailing: FilledButton.tonal(
                      onPressed: () => _openChat(chat),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text('Chat'),
                    ),
                    onTap: () => _openChat(chat),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
