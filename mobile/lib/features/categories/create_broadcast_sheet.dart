import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../chat/chat_screen.dart';

class CreateBroadcastSheet extends StatefulWidget {
  const CreateBroadcastSheet({
    super.key,
    required this.api,
    required this.categoryName,
    required this.subItemName,
    this.onActivityCreated,
  });

  final ApiClient api;
  final String categoryName;
  final String subItemName;
  final VoidCallback? onActivityCreated;

  static Future<void> show({
    required BuildContext context,
    required ApiClient api,
    required String categoryName,
    required String subItemName,
    VoidCallback? onActivityCreated,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => CreateBroadcastSheet(
        api: api,
        categoryName: categoryName,
        subItemName: subItemName,
        onActivityCreated: onActivityCreated,
      ),
    );
  }

  @override
  State<CreateBroadcastSheet> createState() => _CreateBroadcastSheetState();
}

class _CreateBroadcastSheetState extends State<CreateBroadcastSheet> {
  final _formKey = GlobalKey<FormState>();
  final _locationController = TextEditingController();
  final _messageController = TextEditingController();

  int _teamNumber = 10;
  DateTime _selectedDate = DateTime.now().add(const Duration(hours: 4));
  bool _submitting = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _initDefaults();
  }

  void _initDefaults() {
    final sub = widget.subItemName.toLowerCase();
    if (sub.contains('football') || sub.contains('soccer')) {
      _teamNumber = 10;
      _locationController.text = 'Sports Turf Arena';
      _messageController.text =
          'Looking for players for a friendly football match! Join the team.';
    } else if (sub.contains('cricket')) {
      _teamNumber = 11;
      _locationController.text = 'Cricket Ground';
      _messageController.text =
          'Need cricket players for weekend match. Bring your gear!';
    } else if (sub.contains('badminton') || sub.contains('table tennis')) {
      _teamNumber = 4;
      _locationController.text = 'Indoor Sports Complex';
      _messageController.text = 'Looking for doubles partners!';
    } else if (sub.contains('basketball') || sub.contains('volleyball')) {
      _teamNumber = 10;
      _locationController.text = 'Community Court';
      _messageController.text = 'Join us for a friendly match!';
    } else if (sub.contains('trip') ||
        sub.contains('travel') ||
        sub.contains('hike')) {
      _teamNumber = 6;
      _locationController.text = 'Main City Center';
      _messageController.text =
          'Planning a group trip! Looking for travel companions.';
    } else {
      _teamNumber = 6;
      _locationController.text = 'Central Meetup Point';
      _messageController.text =
          'Looking for companions for ${widget.subItemName}. Let\'s connect!';
    }
  }

  @override
  void dispose() {
    _locationController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: _selectedDate.isAfter(now) ? _selectedDate : now,
      firstDate: now,
      lastDate: now.add(const Duration(days: 90)),
    );
    if (pickedDate == null || !mounted) return;

    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_selectedDate),
    );
    if (pickedTime == null || !mounted) return;

    setState(() {
      _selectedDate = DateTime(
        pickedDate.year,
        pickedDate.month,
        pickedDate.day,
        pickedTime.hour,
        pickedTime.minute,
      );
    });
  }

  Future<void> _sendBroadcast() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      // 1. Resolve categoryId from backend interests
      final interestsRes = await widget.api.request('GET', '/interests');
      final list = (interestsRes['interests'] as List<dynamic>?) ?? [];

      String? targetCategoryId;
      // Match exact subItemName first
      for (final item in list) {
        if ((item['name'] as String?)?.toLowerCase() ==
            widget.subItemName.toLowerCase()) {
          targetCategoryId = item['interestId'] as String?;
          break;
        }
      }
      // If not matched, match by category
      if (targetCategoryId == null) {
        for (final item in list) {
          if ((item['category'] as String?)?.toLowerCase() ==
              widget.categoryName.toLowerCase()) {
            targetCategoryId = item['interestId'] as String?;
            break;
          }
        }
      }
      // Fallback to first available interest
      targetCategoryId ??= list.isNotEmpty
          ? list.first['interestId'] as String?
          : null;

      if (targetCategoryId == null) {
        throw Exception('Could not locate interest domain on the server.');
      }

      // Ensure startsAt is at least 5 minutes in future
      final safeStart =
          _selectedDate.isAfter(DateTime.now().add(const Duration(minutes: 5)))
          ? _selectedDate
          : DateTime.now().add(const Duration(hours: 2));

      final body = {
        'title': '${widget.subItemName} Session',
        'description': _messageController.text.trim(),
        'categoryId': targetCategoryId,
        'locationName': _locationController.text.trim(),
        'locationDescription': 'Meetup for ${widget.subItemName}',
        'startsAt': safeStart.toUtc().toIso8601String(),
        'maxParticipants': _teamNumber,
        'minParticipants': 1,
        'visibility': 'public',
        'joinPolicy': 'auto_join',
      };

      final created = await widget.api.request(
        'POST',
        '/activities',
        body: body,
      );
      final activityId = created['activityId'] as String?;

      if (!mounted) return;

      Navigator.of(context).pop();
      widget.onActivityCreated?.call();

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.success,
          behavior: SnackBarBehavior.floating,
          content: Row(
            children: [
              const Icon(Icons.check_circle_outline, color: Colors.white),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Message sent! Activity broadcasted to users interested in ${widget.subItemName}.',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          duration: const Duration(seconds: 4),
        ),
      );

      if (activityId != null) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ActivityChatScreen(
              api: widget.api,
              activityId: activityId,
              activityTitle: '${widget.subItemName} Chat',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _errorMessage = e is ApiException ? e.message : 'Could not broadcast message. Please check connection and try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final theme = Theme.of(context);

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(20, 16, 20, 24 + bottomInset),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 44,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Title and domain tag
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.campaign_rounded,
                      color: AppTheme.primary,
                      size: 26,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.subItemName,
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: AppTheme.deepNavy,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: Colors.grey.shade300),
                          ),
                          child: Text(
                            widget.categoryName,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: Colors.grey.shade700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // 1. Team number / Capacity selector
              Text(
                'Team Number / Players Needed',
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.deepNavy,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.group_outlined, color: AppTheme.primary),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        '$_teamNumber participants needed',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.remove_circle_outline),
                      color: _teamNumber > 2 ? AppTheme.primary : Colors.grey,
                      onPressed: _teamNumber > 2
                          ? () => setState(() => _teamNumber--)
                          : null,
                    ),
                    IconButton(
                      icon: const Icon(Icons.add_circle_outline),
                      color: _teamNumber < 50 ? AppTheme.primary : Colors.grey,
                      onPressed: _teamNumber < 50
                          ? () => setState(() => _teamNumber++)
                          : null,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // Quick presets
              Wrap(
                spacing: 8,
                children: [2, 4, 6, 10, 11, 20].map((count) {
                  final selected = _teamNumber == count;
                  return ChoiceChip(
                    label: Text('$count'),
                    selected: selected,
                    selectedColor: AppTheme.primary.withValues(alpha: 0.15),
                    labelStyle: TextStyle(
                      color: selected ? AppTheme.primary : AppTheme.deepNavy,
                      fontWeight: selected
                          ? FontWeight.bold
                          : FontWeight.normal,
                    ),
                    onSelected: (_) => setState(() => _teamNumber = count),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),

              // 2. Location input
              Text(
                'Location / Venue',
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.deepNavy,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _locationController,
                decoration: InputDecoration(
                  prefixIcon: const Icon(
                    Icons.location_on_outlined,
                    color: AppTheme.primary,
                  ),
                  hintText: 'e.g. Sports Turf Ground, Central Park',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                ),
                validator: (val) => (val == null || val.trim().isEmpty)
                    ? 'Please enter a location'
                    : null,
              ),
              const SizedBox(height: 16),

              // 3. Date & Time selector
              Text(
                'Date & Time',
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.deepNavy,
                ),
              ),
              const SizedBox(height: 8),
              InkWell(
                onTap: _pickDate,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 14,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.calendar_today_outlined,
                        color: AppTheme.primary,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          '${_selectedDate.day}/${_selectedDate.month}/${_selectedDate.year} at ${_selectedDate.hour.toString().padLeft(2, '0')}:${_selectedDate.minute.toString().padLeft(2, '0')}',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const Icon(
                        Icons.arrow_forward_ios,
                        size: 14,
                        color: Colors.grey,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // 4. Message to broadcast
              Text(
                'Send Message to Matching Domain Profiles',
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.deepNavy,
                ),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _messageController,
                maxLines: 3,
                decoration: InputDecoration(
                  prefixIcon: const Padding(
                    padding: EdgeInsets.only(bottom: 36),
                    child: Icon(
                      Icons.chat_bubble_outline,
                      color: AppTheme.primary,
                    ),
                  ),
                  hintText: 'Invite message broadcasted to active users...',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                validator: (val) => (val == null || val.trim().isEmpty)
                    ? 'Please enter a message'
                    : null,
              ),

              if (_errorMessage != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade200),
                  ),
                  child: Text(
                    _errorMessage!,
                    style: TextStyle(color: Colors.red.shade800, fontSize: 13),
                  ),
                ),
              ],
              const SizedBox(height: 20),

              // Send Broadcast Button
              FilledButton.icon(
                onPressed: _submitting ? null : _sendBroadcast,
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.send_rounded),
                label: Text(
                  _submitting
                      ? 'Broadcasting...'
                      : 'Send Msg & Broadcast to Players',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
