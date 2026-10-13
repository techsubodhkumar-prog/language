import 'dart:async';

import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/network/api_client.dart';

class ChatMessageModel {
  const ChatMessageModel({
    required this.messageId,
    required this.activityId,
    required this.senderId,
    required this.senderSupabaseUserId,
    required this.senderName,
    this.senderAvatarUrl,
    required this.content,
    required this.createdAt,
  });

  final String messageId;
  final String activityId;
  final String senderId;
  final String senderSupabaseUserId;
  final String senderName;
  final String? senderAvatarUrl;
  final String content;
  final DateTime createdAt;

  factory ChatMessageModel.fromJson(Map<String, dynamic> json) {
    return ChatMessageModel(
      messageId: (json['messageId'] as String?) ?? '',
      activityId: (json['activityId'] as String?) ?? '',
      senderId: (json['senderId'] as String?) ?? '',
      senderSupabaseUserId: (json['senderSupabaseUserId'] as String?) ?? '',
      senderName: (json['senderName'] as String?) ?? 'Member',
      senderAvatarUrl: json['senderAvatarUrl'] as String?,
      content: (json['content'] as String?) ?? '',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
    'messageId': messageId,
    'activityId': activityId,
    'senderId': senderId,
    'senderSupabaseUserId': senderSupabaseUserId,
    'senderName': senderName,
    if (senderAvatarUrl != null) 'senderAvatarUrl': senderAvatarUrl,
    'content': content,
    'createdAt': createdAt.toIso8601String(),
  };
}

class ActivityChatScreen extends StatefulWidget {
  const ActivityChatScreen({
    super.key,
    required this.api,
    required this.activityId,
    this.activityTitle = 'Activity Chat',
    this.currentUserId,
    this.enableRealtime = true,
  });

  final ApiClient api;
  final String activityId;
  final String activityTitle;
  final String? currentUserId;
  final bool enableRealtime;

  @override
  State<ActivityChatScreen> createState() => _ActivityChatScreenState();
}

class _ActivityChatScreenState extends State<ActivityChatScreen> {
  final List<ChatMessageModel> _messages = [];
  final Set<String> _seenMessageIds = {};
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  bool _loading = true;
  bool _loadingMore = false;
  bool _sending = false;
  bool _hasMore = false;
  bool _unauthorized = false;
  String? _error;
  String? _connectionStatus;

  io.Socket? _socket;
  String? _myUserId;

  String? _getSupabaseUserId() {
    try {
      return Supabase.instance.client.auth.currentSession?.user.id;
    } catch (_) {
      return null;
    }
  }

  String? _getSupabaseToken() {
    try {
      return Supabase.instance.client.auth.currentSession?.accessToken;
    } catch (_) {
      return null;
    }
  }

  @override
  void initState() {
    super.initState();
    _myUserId = widget.currentUserId ?? _getSupabaseUserId();
    _scrollController.addListener(_onScroll);
    _loadInitialHistory();
    if (widget.enableRealtime) {
      _initSocket();
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _textController.dispose();
    _disposeSocket();
    super.dispose();
  }

  void _disposeSocket() {
    try {
      if (_socket != null) {
        _socket!.emit('leave_activity', {'activityId': widget.activityId});
        _socket!.disconnect();
        _socket!.dispose();
        _socket = null;
      }
    } catch (_) {}
  }

  void _initSocket() {
    try {
      final token = _getSupabaseToken();
      if (token == null || token.isEmpty) return;

      final uri = Uri.tryParse(widget.api.baseUrl);
      if (uri == null) return;
      final serverUrl = '${uri.scheme}://${uri.host}:${uri.port}';

      _socket = io.io(
        serverUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .enableAutoConnect()
            .setAuth({'token': token})
            .build(),
      );

      _socket!.onConnect((_) {
        if (!mounted) return;
        setState(() => _connectionStatus = 'Connected');
        _socket!.emit('join_activity', {'activityId': widget.activityId});
        // Resynchronize message history on connect/reconnect
        _resyncHistory();
      });

      _socket!.onConnectError((_) {
        if (!mounted) return;
        setState(() => _connectionStatus = 'Connecting…');
      });

      _socket!.onDisconnect((_) {
        if (!mounted) return;
        setState(() => _connectionStatus = 'Reconnecting…');
      });

      _socket!.on('new_message', (data) {
        if (data is Map<String, dynamic>) {
          _handleIncomingMessage(data);
        } else if (data is Map) {
          _handleIncomingMessage(Map<String, dynamic>.from(data));
        }
      });

      _socket!.on('message_created', (data) {
        if (data is Map<String, dynamic>) {
          _handleIncomingMessage(data);
        } else if (data is Map) {
          _handleIncomingMessage(Map<String, dynamic>.from(data));
        }
      });

      _socket!.on('chat:error', (err) {
        if (!mounted) return;
        if (err is Map && err['message'] != null) {
          final msg = err['message'].toString();
          if (msg.contains('Unauthorized') || msg.contains('approved')) {
            setState(() {
              _unauthorized = true;
              _error = msg;
            });
          }
        }
      });
    } catch (_) {
      // Gracefully fall back to HTTP polling/resync if sockets fail
    }
  }

  void _handleIncomingMessage(Map<String, dynamic> data) {
    if (!mounted) return;
    try {
      final message = ChatMessageModel.fromJson(data);
      if (message.activityId != widget.activityId) return;

      if (_seenMessageIds.contains(message.messageId)) {
        return; // Deduplicate
      }

      setState(() {
        _seenMessageIds.add(message.messageId);
        _messages.add(message);
        _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      });

      _scrollToBottom();
    } catch (_) {}
  }

  void _onScroll() {
    if (_scrollController.hasClients &&
        _scrollController.position.pixels <= 100 &&
        !_loadingMore &&
        _hasMore) {
      _loadMoreHistory();
    }
  }

  Future<void> _loadInitialHistory() async {
    setState(() {
      _loading = true;
      _error = null;
      _unauthorized = false;
    });

    try {
      final res = await widget.api.request(
        'GET',
        '/activities/${widget.activityId}/messages?limit=50&offset=0',
      );

      if (!mounted) return;
      final rawItems = (res['items'] as List<dynamic>?) ?? [];
      final parsed = rawItems
          .map(
            (m) =>
                ChatMessageModel.fromJson(Map<String, dynamic>.from(m as Map)),
          )
          .toList();

      final pagination = (res['pagination'] as Map<String, dynamic>?) ?? {};
      final hasMore = pagination['hasMore'] as bool? ?? false;

      setState(() {
        _messages.clear();
        _seenMessageIds.clear();
        for (final msg in parsed) {
          if (_seenMessageIds.add(msg.messageId)) {
            _messages.add(msg);
          }
        }
        _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
        _hasMore = hasMore;
        _loading = false;
      });

      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      final isAuthError =
          e is ApiException && (e.statusCode == 403 || e.statusCode == 401);
      setState(() {
        _loading = false;
        _unauthorized = isAuthError;
        _error = isAuthError
            ? 'Only the host and approved participants can access this activity chat.'
            : 'Could not load messages. Please check connection and retry.';
      });
    }
  }

  Future<void> _resyncHistory() async {
    try {
      final res = await widget.api.request(
        'GET',
        '/activities/${widget.activityId}/messages?limit=50&offset=0',
      );
      if (!mounted) return;
      final rawItems = (res['items'] as List<dynamic>?) ?? [];
      bool hasNew = false;
      for (final raw in rawItems) {
        final msg = ChatMessageModel.fromJson(
          Map<String, dynamic>.from(raw as Map),
        );
        if (_seenMessageIds.add(msg.messageId)) {
          _messages.add(msg);
          hasNew = true;
        }
      }
      if (hasNew) {
        _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
        setState(() {});
        _scrollToBottom();
      }
    } catch (_) {}
  }

  Future<void> _loadMoreHistory() async {
    if (_loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);

    try {
      final offset = _messages.length;
      final res = await widget.api.request(
        'GET',
        '/activities/${widget.activityId}/messages?limit=50&offset=$offset',
      );

      if (!mounted) return;
      final rawItems = (res['items'] as List<dynamic>?) ?? [];
      final parsed = rawItems
          .map(
            (m) =>
                ChatMessageModel.fromJson(Map<String, dynamic>.from(m as Map)),
          )
          .toList();

      final pagination = (res['pagination'] as Map<String, dynamic>?) ?? {};
      final hasMore = pagination['hasMore'] as bool? ?? false;

      setState(() {
        for (final msg in parsed) {
          if (_seenMessageIds.add(msg.messageId)) {
            _messages.add(msg);
          }
        }
        _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
        _hasMore = hasMore;
        _loadingMore = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _sendMessage() async {
    final text = _textController.text.trim();
    if (text.isEmpty || _sending) return;

    if (text.length > 2000) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Message cannot exceed 2000 characters.')),
      );
      return;
    }

    setState(() => _sending = true);
    _textController.clear();

    try {
      final res = await widget.api.request(
        'POST',
        '/activities/${widget.activityId}/messages',
        body: {'content': text},
      );

      if (res is Map) {
        final message = ChatMessageModel.fromJson(
          Map<String, dynamic>.from(res),
        );
        if (_seenMessageIds.add(message.messageId)) {
          if (mounted) {
            setState(() {
              _messages.add(message);
              _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
            });
          }
        }
      }

      if (mounted) {
        setState(() => _sending = false);
        _scrollToBottom();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      final isForbidden = e is ApiException && e.statusCode == 403;
      final isRateLimited = e is ApiException && e.statusCode == 429;
      final errorText = isForbidden
          ? 'You are no longer authorized to send messages in this chat.'
          : isRateLimited
          ? 'Too many messages. Please slow down.'
          : 'Failed to send message. Please retry.';

      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(errorText)));
      if (isForbidden) {
        setState(() {
          _unauthorized = true;
          _error = errorText;
        });
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  String _formatTime(DateTime date) {
    final hour = date.hour.toString().padLeft(2, '0');
    final minute = date.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    if (_unauthorized) {
      return Scaffold(
        appBar: AppBar(title: Text(widget.activityTitle)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.lock_outline, size: 56, color: Colors.orange),
                const SizedBox(height: 16),
                Text(
                  'Access Restricted',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  _error ?? 'Only the activity host and approved participants can access this chat.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Back to activity'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.activityTitle,
              style: const TextStyle(fontSize: 18),
              overflow: TextOverflow.ellipsis,
            ),
            if (_connectionStatus != null)
              Text(
                _connectionStatus!,
                style: TextStyle(
                  fontSize: 12,
                  color: _connectionStatus == 'Connected'
                      ? Colors.green
                      : Colors.orange,
                ),
              ),
          ],
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (_loadingMore) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                            const SizedBox(height: 12),
                            FilledButton.tonal(
                              onPressed: _loadInitialHistory,
                              child: const Text('Retry'),
                            ),
                          ],
                        ),
                      ),
                    )
                  : _messages.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.chat_bubble_outline,
                              size: 48,
                              color: Colors.grey,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'No messages yet.',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              'Say hello to start coordinating with the group!',
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    )
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      itemCount: _messages.length,
                      itemBuilder: (context, index) {
                        final msg = _messages[index];
                        final isMe =
                            _myUserId != null &&
                            msg.senderSupabaseUserId == _myUserId;
                        return _MessageBubble(
                          message: msg,
                          isMe: isMe,
                          formattedTime: _formatTime(msg.createdAt),
                        );
                      },
                    ),
            ),
            const Divider(height: 1),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              color: Theme.of(context).colorScheme.surface,
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      textCapitalization: TextCapitalization.sentences,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: 2000,
                      buildCounter: (
                        _, {
                        required currentLength,
                        maxLength,
                        required isFocused,
                      }) => null,
                      decoration: const InputDecoration(
                        hintText: 'Type a message…',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(24)),
                        ),
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _sendMessage,
                    icon: _sending
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.isMe,
    required this.formattedTime,
  });

  final ChatMessageModel message;
  final bool isMe;
  final String formattedTime;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bubbleColor = isMe
        ? theme.colorScheme.primary
        : theme.colorScheme.surfaceContainerHighest;
    final textColor = isMe
        ? theme.colorScheme.onPrimary
        : theme.colorScheme.onSurfaceVariant;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: isMe
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          if (!isMe)
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 2),
              child: Text(
                message.senderName,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.75,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: bubbleColor,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(isMe ? 16 : 4),
                bottomRight: Radius.circular(isMe ? 4 : 16),
              ),
            ),
            child: Text(
              message.content,
              style: TextStyle(color: textColor, fontSize: 15),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
            child: Text(
              formattedTime,
              style: TextStyle(fontSize: 11, color: theme.colorScheme.outline),
            ),
          ),
        ],
      ),
    );
  }
}
