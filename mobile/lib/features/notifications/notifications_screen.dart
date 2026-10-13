import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../activities/activity_screens.dart';
import '../chat/chat_screen.dart';

/// Notification Badge Icon button that shows unread count badge
/// and navigates to the notifications screen.
class NotificationBadgeButton extends StatefulWidget {
  const NotificationBadgeButton({super.key, required this.api, this.color});

  final ApiClient api;
  final Color? color;

  @override
  State<NotificationBadgeButton> createState() =>
      _NotificationBadgeButtonState();
}

class _NotificationBadgeButtonState extends State<NotificationBadgeButton> {
  int _unreadCount = 0;

  @override
  void initState() {
    super.initState();
    _loadUnreadCount();
  }

  Future<void> _loadUnreadCount() async {
    try {
      final res = await widget.api.request(
        'GET',
        '/notifications/unread-count',
      );
      if (mounted && res is Map && res['unreadCount'] != null) {
        setState(() {
          _unreadCount = (res['unreadCount'] as num).toInt();
        });
      }
    } catch (_) {
      // Gracefully ignore network errors for badge polling
    }
  }

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip:
          'Notifications (${_unreadCount > 0 ? "$_unreadCount unread" : "No unread"})',
      icon: Badge(
        isLabelVisible: _unreadCount > 0,
        label: Text(
          _unreadCount > 99 ? '99+' : '$_unreadCount',
          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
        ),
        child: Icon(
          _unreadCount > 0
              ? Icons.notifications_active
              : Icons.notifications_outlined,
          color: widget.color,
        ),
      ),
      onPressed: () async {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => NotificationsScreen(api: widget.api),
          ),
        );
        if (mounted) {
          _loadUnreadCount();
        }
      },
    );
  }
}

/// Full screen displaying persistent authenticated user notifications.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  List<Map<String, dynamic>> _items = [];
  int _unreadCount = 0;
  bool _hasMore = false;
  int _offset = 0;
  static const int _limit = 20;

  @override
  void initState() {
    super.initState();
    _fetchNotifications();
  }

  Future<void> _fetchNotifications({bool refresh = false}) async {
    if (refresh) {
      _offset = 0;
    }
    setState(() {
      if (refresh) {
        _loading = true;
      }
      _error = null;
    });

    try {
      final res = await widget.api.request(
        'GET',
        '/notifications?limit=$_limit&offset=$_offset&unreadOnly=false',
      );

      if (!mounted) return;

      if (res is Map) {
        final rawItems = (res['items'] as List?) ?? [];
        final parsedItems = rawItems
            .map((item) => Map<String, dynamic>.from(item as Map))
            .toList();

        final pagination = res['pagination'] as Map?;
        final unread = (res['unreadCount'] as num?)?.toInt() ?? 0;
        final hasMore = (pagination?['hasMore'] as bool?) ?? false;

        setState(() {
          if (refresh || _offset == 0) {
            _items = parsedItems;
          } else {
            _items.addAll(parsedItems);
          }
          _unreadCount = unread;
          _hasMore = hasMore;
          _loading = false;
          _loadingMore = false;
        });
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadingMore = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadingMore = false;
        _error = 'Could not load notifications. Check your connection.';
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    _offset += _limit;
    await _fetchNotifications();
  }

  Future<void> _markAsRead(Map<String, dynamic> item) async {
    final id = item['notificationId'] as String?;
    if (id == null) return;

    final wasUnread = item['isRead'] != true && item['readAt'] == null;
    if (!wasUnread) return;

    // Optimistic update
    setState(() {
      item['isRead'] = true;
      item['readAt'] = DateTime.now().toIso8601String();
      if (_unreadCount > 0) _unreadCount--;
    });

    try {
      await widget.api.request('PATCH', '/notifications/$id/read');
    } catch (_) {
      // Soft failure; state is already marked read locally
    }
  }

  Future<void> _markAllAsRead() async {
    if (_unreadCount == 0) return;

    // Optimistic update
    setState(() {
      for (final item in _items) {
        item['isRead'] = true;
        item['readAt'] ??= DateTime.now().toIso8601String();
      }
      _unreadCount = 0;
    });

    try {
      await widget.api.request('PATCH', '/notifications/read-all');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('All notifications marked as read')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not mark all notifications as read'),
          ),
        );
      }
    }
  }

  Future<void> _dismissNotification(Map<String, dynamic> item) async {
    final id = item['notificationId'] as String?;
    if (id == null) return;

    final wasUnread = item['isRead'] != true && item['readAt'] == null;

    setState(() {
      _items.removeWhere((n) => n['notificationId'] == id);
      if (wasUnread && _unreadCount > 0) {
        _unreadCount--;
      }
    });

    try {
      await widget.api.request('DELETE', '/notifications/$id');
    } catch (_) {
      // Safe fallback
    }
  }

  void _onNotificationTap(Map<String, dynamic> item) async {
    await _markAsRead(item);

    final activityId = item['activityId'] as String?;
    final type = item['type'] as String?;
    final title = item['title'] as String? ?? 'Activity';

    if (!mounted || activityId == null || activityId.isEmpty) return;

    if (type == 'chat_message') {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ActivityChatScreen(
            api: widget.api,
            activityId: activityId,
            activityTitle: title,
          ),
        ),
      );
    } else {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) =>
              ActivityDetailsScreen(api: widget.api, activityId: activityId),
        ),
      );
    }
  }

  IconData _getTypeIcon(String? type) {
    switch (type) {
      case 'join_request':
        return Icons.person_add_alt_1;
      case 'request_approved':
        return Icons.check_circle_outline;
      case 'request_rejected':
        return Icons.highlight_off;
      case 'activity_cancelled':
        return Icons.event_busy;
      case 'activity_reminder':
        return Icons.alarm;
      case 'chat_message':
        return Icons.chat_bubble_outline;
      default:
        return Icons.notifications_none;
    }
  }

  Color _getTypeColor(BuildContext context, String? type) {
    final theme = Theme.of(context);
    switch (type) {
      case 'join_request':
        return theme.colorScheme.primary;
      case 'request_approved':
        return Colors.green.shade600;
      case 'request_rejected':
        return Colors.orange.shade700;
      case 'activity_cancelled':
        return theme.colorScheme.error;
      case 'activity_reminder':
        return Colors.deepPurple;
      case 'chat_message':
        return Colors.teal;
      default:
        return theme.colorScheme.onSurfaceVariant;
    }
  }

  String _formatDate(String? raw) {
    if (raw == null) return '';
    try {
      final dt = DateTime.parse(raw).toLocal();
      final now = DateTime.now();
      final diff = now.difference(dt);

      if (diff.inMinutes < 1) return 'Just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (_unreadCount > 0)
            TextButton.icon(
              onPressed: _markAllAsRead,
              icon: const Icon(Icons.done_all, size: 18),
              label: const Text('Mark all read'),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.error_outline,
                      size: 48,
                      color: theme.colorScheme.error,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: () => _fetchNotifications(refresh: true),
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            )
          : _items.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.notifications_none,
                    size: 64,
                    color: theme.colorScheme.outline,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No notifications yet',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'You will see join requests, reminders, and activity updates here.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.outline,
                    ),
                  ),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: () => _fetchNotifications(refresh: true),
              child: ListView.separated(
                itemCount: _items.length + (_hasMore ? 1 : 0),
                separatorBuilder: (_, index) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  if (index == _items.length) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Center(
                        child: _loadingMore
                            ? const CircularProgressIndicator()
                            : OutlinedButton(
                                onPressed: _loadMore,
                                child: const Text('Load older notifications'),
                              ),
                      ),
                    );
                  }

                  final item = _items[index];
                  final isUnread =
                      item['isRead'] != true && item['readAt'] == null;
                  final type = item['type'] as String?;
                  final title = item['title'] as String? ?? 'Notification';
                  final message = item['message'] as String? ?? '';
                  final createdAt = item['createdAt'] as String?;
                  final typeColor = _getTypeColor(context, type);

                  return Dismissible(
                    key: Key(item['notificationId'] ?? '$index'),
                    direction: DismissDirection.endToStart,
                    background: Container(
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      color: theme.colorScheme.errorContainer,
                      child: Icon(
                        Icons.delete_outline,
                        color: theme.colorScheme.onErrorContainer,
                      ),
                    ),
                    onDismissed: (_) => _dismissNotification(item),
                    child: ListTile(
                      tileColor: isUnread
                          ? theme.colorScheme.primaryContainer.withAlpha(40)
                          : null,
                      leading: CircleAvatar(
                        backgroundColor: typeColor.withAlpha(35),
                        child: Icon(
                          _getTypeIcon(type),
                          color: typeColor,
                          size: 22,
                        ),
                      ),
                      title: Row(
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              style: TextStyle(
                                fontWeight: isUnread
                                    ? FontWeight.bold
                                    : FontWeight.w500,
                                fontSize: 14,
                              ),
                            ),
                          ),
                          if (isUnread)
                            Container(
                              width: 8,
                              height: 8,
                              margin: const EdgeInsets.only(left: 6),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.primary,
                                shape: BoxShape.circle,
                              ),
                            ),
                        ],
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 3),
                          Text(
                            message,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: isUnread
                                  ? theme.colorScheme.onSurface
                                  : theme.colorScheme.onSurfaceVariant,
                            ),
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _formatDate(createdAt),
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.outline,
                            ),
                          ),
                        ],
                      ),
                      isThreeLine: true,
                      onTap: () => _onNotificationTap(item),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
