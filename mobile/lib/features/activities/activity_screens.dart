import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';

class ActivityDiscoveryScreen extends StatefulWidget {
  const ActivityDiscoveryScreen({
    super.key,
    required this.api,
    this.openCreateOnStart = false,
  });
  final ApiClient api;
  final bool openCreateOnStart;
  @override
  State<ActivityDiscoveryScreen> createState() =>
      _ActivityDiscoveryScreenState();
}

class _ActivityDiscoveryScreenState extends State<ActivityDiscoveryScreen> {
  bool loading = true;
  String? error;
  List<Map<String, dynamic>> activities = [];
  List<Map<String, dynamic>> categories = [];
  String? categoryId;
  DateTime? selectedDate;
  final location = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadCategories().then((_) {
      if (widget.openCreateOnStart && mounted) _openCreate();
    });
    _load();
  }

  @override
  void dispose() {
    location.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    try {
      final data = await widget.api.request('GET', '/interests');
      if (mounted) {
        setState(
          () => categories = List<Map<String, dynamic>>.from(
            data['interests'] as List,
          ),
        );
      }
    } catch (_) {
      // Activity feed remains useful even if category labels cannot load.
    }
  }

  String _filterPath() {
    final query = <String, String>{'limit': '20', 'offset': '0'};
    if (categoryId != null) query['categoryId'] = categoryId!;
    if (selectedDate != null) {
      final day = selectedDate!;
      query['from'] = DateTime(
        day.year,
        day.month,
        day.day,
      ).toUtc().toIso8601String();
      query['to'] = DateTime(
        day.year,
        day.month,
        day.day,
        23,
        59,
        59,
      ).toUtc().toIso8601String();
    }
    if (location.text.trim().isNotEmpty) {
      query['location'] = location.text.trim();
    }
    final encoded = query.entries
        .map(
          (e) =>
              '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}',
        )
        .join('&');
    return '/activities?$encoded';
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.request('GET', _filterPath());
      if (mounted) {
        setState(() {
          activities = List<Map<String, dynamic>>.from(data['items'] as List);
          loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          error = 'Could not load activities. Check your connection and retry.';
          loading = false;
        });
      }
    }
  }

  Future<void> _openCreate() async {
    if (categories.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Categories are unavailable. Please try again later.'),
        ),
      );
      return;
    }
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            ActivityFormScreen(api: widget.api, categories: categories),
      ),
    );
    if (saved == true) {
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Activity published.')));
      }
    }
  }

  Future<void> _openDetails(Map<String, dynamic> activity) async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ActivityDetailsScreen(
          api: widget.api,
          activityId: activity['activityId'] as String,
        ),
      ),
    );
    if (changed == true) {
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Activity updated.')));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Discover activities'),
      actions: [
        IconButton(
          tooltip: 'Refresh activities',
          onPressed: _load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: _openCreate,
      icon: const Icon(Icons.add),
      label: const Text('Create activity'),
    ),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(
            children: [
              DropdownButtonFormField<String>(
                initialValue: categoryId,
                decoration: const InputDecoration(
                  labelText: 'Category',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: [
                  const DropdownMenuItem(
                    value: null,
                    child: Text('All categories'),
                  ),
                  ...categories.map(
                    (c) => DropdownMenuItem(
                      value: c['interestId'] as String,
                      child: Text(c['name'] as String),
                    ),
                  ),
                ],
                onChanged: (value) {
                  setState(() => categoryId = value);
                  _load();
                },
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: location,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => _load(),
                      decoration: const InputDecoration(
                        labelText: 'Location or venue',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Filter by date',
                    icon: const Icon(Icons.calendar_month),
                    onPressed: () async {
                      final picked = await showDatePicker(
                        context: context,
                        firstDate: DateTime.now(),
                        lastDate: DateTime.now().add(const Duration(days: 365)),
                        initialDate: selectedDate ?? DateTime.now(),
                      );
                      if (picked != null && mounted) {
                        setState(() => selectedDate = picked);
                        _load();
                      }
                    },
                  ),
                  if (selectedDate != null)
                    IconButton(
                      tooltip: 'Clear date',
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        setState(() => selectedDate = null);
                        _load();
                      },
                    ),
                ],
              ),
              if (selectedDate != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Date: ${MaterialLocalizations.of(context).formatMediumDate(selectedDate!)}',
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : error != null
              ? _MessageState(
                  message: error!,
                  action: FilledButton(
                    onPressed: _load,
                    child: const Text('Retry'),
                  ),
                )
              : activities.isEmpty
              ? const _MessageState(
                  message: 'No activities match these filters yet. Try another search or create one.',
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                    itemCount: activities.length,
                    itemBuilder: (context, index) => ActivityCard(
                      activity: activities[index],
                      onTap: () => _openDetails(activities[index]),
                    ),
                  ),
                ),
        ),
      ],
    ),
  );
}

class ActivityCard extends StatelessWidget {
  const ActivityCard({super.key, required this.activity, this.onTap});
  final Map<String, dynamic> activity;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final startsAt = DateTime.tryParse('${activity['startsAt']}')?.toLocal();
    final dateLabel = startsAt == null
        ? 'Date to be confirmed'
        : MaterialLocalizations.of(context).formatFullDate(startsAt);
    final timeLabel = startsAt == null
        ? ''
        : MaterialLocalizations.of(context)
              .formatTimeOfDay(TimeOfDay.fromDateTime(startsAt));
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                activity['title'] as String? ?? 'Activity',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  _IconLabel(
                    Icons.category_outlined,
                    activity['category'] as String? ?? 'Activity',
                  ),
                  _IconLabel(
                    Icons.calendar_today_outlined,
                    '$dateLabel${timeLabel.isEmpty ? '' : ' · $timeLabel'}',
                  ),
                  _IconLabel(
                    Icons.place_outlined,
                    activity['locationName'] as String? ?? 'Location',
                  ),
                  _IconLabel(
                    Icons.people_outline,
                    '${activity['maxParticipants']} people total · host included',
                  ),
                ],
              ),
              if ((activity['hostName'] as String?)?.isNotEmpty == true) ...[
                const SizedBox(height: 8),
                Text('Hosted by ${activity['hostName']}'),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _IconLabel extends StatelessWidget {
  const _IconLabel(this.icon, this.text);
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 18, semanticLabel: text),
      const SizedBox(width: 5),
      Flexible(child: Text(text, overflow: TextOverflow.ellipsis)),
    ],
  );
}

class ActivityDetailsScreen extends StatefulWidget {
  const ActivityDetailsScreen({
    super.key,
    required this.api,
    required this.activityId,
  });
  final ApiClient api;
  final String activityId;
  @override
  State<ActivityDetailsScreen> createState() => _ActivityDetailsScreenState();
}

class _ActivityDetailsScreenState extends State<ActivityDetailsScreen> {
  Map<String, dynamic>? activity;
  Map<String, dynamic> membership = {'status': 'none'};
  List<Map<String, dynamic>> requests = [];
  List<Map<String, dynamic>> participants = [];
  String? error;
  bool loading = true;
  bool membershipLoading = false;
  bool membershipBusy = false;
  String? membershipError;
  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.api.request(
        'GET',
        '/activities/${widget.activityId}',
      );
      if (mounted) {
        setState(() {
          activity = Map<String, dynamic>.from(result);
          loading = false;
        });
        await _loadMembership();
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          error = 'Could not load this activity.';
          loading = false;
        });
      }
    }
  }

  Future<void> _loadMembership() async {
    setState(() {
      membershipLoading = true;
      membershipError = null;
    });
    try {
      final current = await widget.api.request(
        'GET',
        '/activities/${widget.activityId}/membership',
      );
      final nextMembership = Map<String, dynamic>.from(current as Map);
      final isHost = activity?['isHost'] == true;
      final status = nextMembership['status'];
      final nextRequests = isHost
          ? await widget.api.request(
              'GET',
              '/activities/${widget.activityId}/requests',
            )
          : {'items': <dynamic>[]};
      final nextParticipants = (isHost || status == 'approved')
          ? await widget.api.request(
              'GET',
              '/activities/${widget.activityId}/participants',
            )
          : {'items': <dynamic>[]};
      if (!mounted) return;
      setState(() {
        membership = nextMembership;
        requests = List<Map<String, dynamic>>.from(
          nextRequests['items'] as List,
        );
        participants = List<Map<String, dynamic>>.from(
          nextParticipants['items'] as List,
        );
        membershipLoading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          membershipLoading = false;
          membershipError = 'Could not load participation details.';
        });
      }
    }
  }

  Future<void> _membershipAction(
    String method,
    String path, {
    Object? body,
  }) async {
    setState(() {
      membershipBusy = true;
      membershipError = null;
    });
    try {
      await widget.api.request(method, path, body: body);
      await _load();
      if (mounted) setState(() => membershipBusy = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              method == 'DELETE'
                  ? 'Request updated.'
                  : 'Participation updated.',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          membershipBusy = false;
          membershipError = e is ApiException && e.statusCode == 409
              ? 'This activity is full or the request is no longer available.'
              : 'Could not update participation. Please retry.';
        });
      }
    }
  }

  Widget _membershipSection() {
    final currentStatus = membership['status'] as String? ?? 'none';
    final isHost = activity?['isHost'] == true;
    final open = activity?['status'] == 'scheduled';
    final capacity = activity?['maxParticipants'] as int? ?? 1;
    final total = activity?['participantCount'] as int? ?? 1;
    final remaining =
        (activity?['remainingPlaces'] as int?) ?? (capacity - total);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Divider(height: 32),
        Text(
          '$total of $capacity people · $remaining ${remaining == 1 ? 'place' : 'places'} remaining',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        if (membershipLoading)
          const Center(child: CircularProgressIndicator())
        else if (membershipError != null) ...[
          Text(
            membershipError!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          TextButton(onPressed: _loadMembership, child: const Text('Retry')),
        ] else if (!isHost && open && currentStatus == 'none')
          FilledButton(
            onPressed: membershipBusy || remaining <= 0
                ? null
                : () => _membershipAction(
                    'POST',
                    '/activities/${widget.activityId}/join',
                  ),
            child: Text(
              remaining <= 0
                  ? 'Activity full'
                  : activity?['joinPolicy'] == 'auto_join'
                  ? 'Join activity'
                  : 'Request to join',
            ),
          )
        else if (currentStatus == 'requested') ...[
          const Chip(
            avatar: Icon(Icons.hourglass_top),
            label: Text('Pending approval'),
          ),
          OutlinedButton(
            onPressed: membershipBusy
                ? null
                : () => _membershipAction(
                    'DELETE',
                    '/activities/${widget.activityId}/membership',
                  ),
            child: const Text('Cancel request'),
          ),
        ] else if (currentStatus == 'approved') ...[
          const Chip(
            avatar: Icon(Icons.check_circle_outline),
            label: Text('Joined'),
          ),
          if (!isHost)
            OutlinedButton(
              onPressed: membershipBusy
                  ? null
                  : () => _membershipAction(
                      'DELETE',
                      '/activities/${widget.activityId}/membership',
                    ),
              child: const Text('Leave activity'),
            ),
        ] else if (currentStatus == 'rejected') ...[
          const Chip(label: Text('Request declined')),
          if (!isHost && open && remaining > 0)
            OutlinedButton(
              onPressed: membershipBusy
                  ? null
                  : () => _membershipAction(
                      'POST',
                      '/activities/${widget.activityId}/join',
                    ),
              child: const Text('Request again'),
            ),
        ] else if (currentStatus == 'withdrawn' || currentStatus == 'left') ...[
          Chip(
            label: Text(
              currentStatus == 'left'
                  ? 'You left this activity'
                  : 'Request cancelled',
            ),
          ),
          if (!isHost && open && remaining > 0)
            OutlinedButton(
              onPressed: membershipBusy
                  ? null
                  : () => _membershipAction(
                      'POST',
                      '/activities/${widget.activityId}/join',
                    ),
              child: const Text('Request again'),
            ),
        ] else if (currentStatus == 'none' && !isHost && remaining <= 0)
          const Chip(label: Text('Activity full')),
        if (membershipBusy) const LinearProgressIndicator(),
        if (isHost) ...[
          const SizedBox(height: 16),
          Text(
            'Join requests (${requests.length})',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          if (requests.isEmpty)
            const Text('No pending requests.')
          else
            ...requests.map(
              (request) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const CircleAvatar(child: Icon(Icons.person_outline)),
                title: Text(request['displayName'] as String? ?? 'Participant'),
                subtitle: const Text('Pending approval'),
                trailing: Wrap(
                  spacing: 4,
                  children: [
                    IconButton(
                      tooltip: 'Approve request',
                      onPressed: membershipBusy
                          ? null
                          : () => _membershipAction(
                              'POST',
                              '/activities/${widget.activityId}/requests/${request['membershipId']}/approve',
                            ),
                      icon: const Icon(Icons.check),
                    ),
                    IconButton(
                      tooltip: 'Reject request',
                      onPressed: membershipBusy
                          ? null
                          : () => _membershipAction(
                              'POST',
                              '/activities/${widget.activityId}/requests/${request['membershipId']}/reject',
                            ),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
            ),
        ],
        if (isHost || currentStatus == 'approved') ...[
          const SizedBox(height: 12),
          Text(
            'Participants (${participants.length})',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          ...participants.map(
            (person) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
              title: Text(person['displayName'] as String? ?? 'Participant'),
              subtitle: Text(
                person['role'] == 'host' ? 'Host' : 'Approved participant',
              ),
            ),
          ),
        ],
      ],
    );
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _edit() async {
    late final List<Map<String, dynamic>> categories;
    try {
      final categoriesResponse = await widget.api.request('GET', '/interests');
      categories = List<Map<String, dynamic>>.from(
        categoriesResponse['interests'] as List,
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not load categories. Please retry.'),
          ),
        );
      }
      return;
    }
    if (!mounted || activity == null) return;
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ActivityFormScreen(
          api: widget.api,
          categories: categories,
          existing: activity,
        ),
      ),
    );
    if (changed == true) {
      await _load();
    }
  }

  Future<void> _cancel() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel activity?'),
        content: const Text('This will mark the activity as cancelled.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep activity'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel activity'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    try {
      await widget.api.request(
        'PATCH',
        '/activities/${widget.activityId}/cancel',
      );
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not cancel. Please try again.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Activity details'),
      actions: [
        if (activity?['isHost'] == true && activity?['status'] == 'scheduled')
          PopupMenuButton<String>(
            onSelected: (value) => value == 'edit' ? _edit() : _cancel(),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'edit', child: Text('Edit')),
              PopupMenuItem(value: 'cancel', child: Text('Cancel activity')),
            ],
          ),
      ],
    ),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : error != null
        ? _MessageState(
            message: error!,
            action: FilledButton(onPressed: _load, child: const Text('Retry')),
          )
        : activity == null
        ? const _MessageState(message: 'Activity not found.')
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              if (activity!['status'] == 'cancelled')
                const Chip(label: Text('Cancelled')),
              Text(
                activity!['title'] as String,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                '${activity!['category']} · Hosted by ${activity!['hostName']}',
              ),
              const SizedBox(height: 24),
              _DetailRow(
                Icons.calendar_month,
                _dateTimeLabel(
                  context,
                  activity!['startsAt'] as String,
                  activity!['endsAt'] as String?,
                ),
              ),
              _DetailRow(
                Icons.place_outlined,
                '${activity!['locationName']}\n${activity!['locationDescription']}',
              ),
              _DetailRow(
                Icons.people_outline,
                'Capacity: ${activity!['maxParticipants']} people total, host included\n${activity!['participantCount'] ?? 1} confirmed · ${activity!['remainingPlaces'] ?? ((activity!['maxParticipants'] as int) - 1)} places remaining\nMinimum: ${activity!['minParticipants']}',
              ),
              _DetailRow(
                Icons.verified_user_outlined,
                'Join policy: ${activity!['joinPolicy'] == 'approval' ? 'Host approval' : 'Auto-join'}',
              ),
              if (activity!['estimatedCost'] != null)
                _DetailRow(
                  Icons.payments_outlined,
                  'Estimated cost: ${activity!['estimatedCost']} per person',
                ),
              const SizedBox(height: 16),
              Text(
                'About this activity',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(activity!['description'] as String),
              _membershipSection(),
            ],
          ),
  );
}

String _dateTimeLabel(BuildContext context, String start, String? end) {
  final begins = DateTime.tryParse(start)?.toLocal();
  if (begins == null) return 'Time to be confirmed';
  final date = MaterialLocalizations.of(context).formatFullDate(begins);
  final from = MaterialLocalizations.of(context)
      .formatTimeOfDay(TimeOfDay.fromDateTime(begins));
  if (end == null) return '$date · $from';
  final finish = DateTime.tryParse(end)?.toLocal();
  if (finish == null) return '$date · $from';
  return '$date · $from – ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(finish))}';
}

class _DetailRow extends StatelessWidget {
  const _DetailRow(this.icon, this.label);
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, semanticLabel: label),
        const SizedBox(width: 12),
        Expanded(child: Text(label)),
      ],
    ),
  );
}

class ActivityFormScreen extends StatefulWidget {
  const ActivityFormScreen({
    super.key,
    required this.api,
    required this.categories,
    this.existing,
  });
  final ApiClient api;
  final List<Map<String, dynamic>> categories;
  final Map<String, dynamic>? existing;
  @override
  State<ActivityFormScreen> createState() => _ActivityFormScreenState();
}

class _ActivityFormScreenState extends State<ActivityFormScreen> {
  final formKey = GlobalKey<FormState>();
  late final title = TextEditingController(
    text: widget.existing?['title'] as String?,
  );
  late final description = TextEditingController(
    text: widget.existing?['description'] as String?,
  );
  late final locationName = TextEditingController(
    text: widget.existing?['locationName'] as String?,
  );
  late final locationDescription = TextEditingController(
    text: widget.existing?['locationDescription'] as String?,
  );
  late final capacity = TextEditingController(
    text: '${widget.existing?['maxParticipants'] ?? ''}',
  );
  late final minimum = TextEditingController(
    text: '${widget.existing?['minParticipants'] ?? 1}',
  );
  late final cost = TextEditingController(
    text: '${widget.existing?['estimatedCost'] ?? ''}',
  );
  String? categoryId;
  DateTime? startsAt;
  DateTime? endsAt;
  String visibility = 'public';
  String joinPolicy = 'approval';
  bool saving = false;
  String? error;
  bool get editing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    categoryId = widget.existing?['categoryId'] as String?;
    startsAt = DateTime.tryParse('${widget.existing?['startsAt']}')?.toLocal();
    endsAt = DateTime.tryParse('${widget.existing?['endsAt']}')?.toLocal();
    visibility = widget.existing?['visibility'] as String? ?? 'public';
    joinPolicy = widget.existing?['joinPolicy'] as String? ?? 'approval';
  }

  @override
  void dispose() {
    title.dispose();
    description.dispose();
    locationName.dispose();
    locationDescription.dispose();
    capacity.dispose();
    minimum.dispose();
    cost.dispose();
    super.dispose();
  }

  String? _required(String? value, {int min = 1, int max = 2000}) {
    final v = value?.trim() ?? '';
    if (v.length < min) return 'Enter at least $min characters';
    if (v.length > max) return 'Use $max characters or fewer';
    return null;
  }

  String? _integer(String? value) {
    final n = int.tryParse(value ?? '');
    if (n == null || n < 1 || n > 100) {
      return 'Enter a whole number from 1 to 100';
    }
    return null;
  }

  Future<void> _chooseDate() async {
    final initial = startsAt ?? DateTime.now().add(const Duration(days: 1));
    final date = await showDatePicker(
      context: context,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      initialDate: initial,
    );
    if (date == null || !mounted) return;
    setState(
      () => startsAt = DateTime(
        date.year,
        date.month,
        date.day,
        startsAt?.hour ?? 18,
        startsAt?.minute ?? 0,
      ),
    );
  }

  Future<void> _chooseTime({bool end = false}) async {
    final current = end
        ? (endsAt ?? startsAt ?? DateTime.now())
        : (startsAt ?? DateTime.now().add(const Duration(days: 1)));
    final selected = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(current),
    );
    if (selected == null || !mounted) return;
    setState(() {
      if (end) {
        final base = endsAt ?? startsAt ?? DateTime.now();
        endsAt = DateTime(
          base.year,
          base.month,
          base.day,
          selected.hour,
          selected.minute,
        );
      } else {
        final base = startsAt ?? DateTime.now().add(const Duration(days: 1));
        startsAt = DateTime(
          base.year,
          base.month,
          base.day,
          selected.hour,
          selected.minute,
        );
      }
    });
  }

  Future<void> _save() async {
    if (!(formKey.currentState?.validate() ?? false)) return;
    final start = startsAt;
    final end = endsAt;
    if (categoryId == null) {
      setState(() => error = 'Choose a category.');
      return;
    }
    if (start == null || !start.isAfter(DateTime.now())) {
      setState(() => error = 'Choose a future date and start time.');
      return;
    }
    if (end != null && !end.isAfter(start)) {
      setState(() => error = 'End time must be after start time.');
      return;
    }
    final maxPeople = int.parse(capacity.text);
    final minPeople = int.tryParse(minimum.text) ?? 1;
    if (minPeople < 1 || minPeople > maxPeople) {
      setState(
        () => error =
            'Minimum participants must be between 1 and total capacity.',
      );
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    final body = <String, dynamic>{
      'title': title.text.trim(),
      'description': description.text.trim(),
      'categoryId': categoryId,
      'locationName': locationName.text.trim(),
      'locationDescription': locationDescription.text.trim(),
      'startsAt': start.toUtc().toIso8601String(),
      if (end != null) 'endsAt': end.toUtc().toIso8601String(),
      'maxParticipants': maxPeople,
      'minParticipants': minPeople,
      'visibility': visibility,
      'joinPolicy': joinPolicy,
      if (cost.text.trim().isNotEmpty)
        'estimatedCost': double.tryParse(cost.text.trim()),
    };
    try {
      await widget.api.request(
        editing ? 'PATCH' : 'POST',
        editing
            ? '/activities/${widget.existing!['activityId']}'
            : '/activities',
        body: body,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Could not save the activity. Check the details and try again.',
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(editing ? 'Edit activity' : 'Create activity')),
    body: Form(
      key: formKey,
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: title,
                maxLength: 100,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Activity title',
                  border: OutlineInputBorder(),
                ),
                validator: (v) => _required(v, min: 3, max: 100),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: description,
                maxLength: 2000,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Description',
                  border: OutlineInputBorder(),
                ),
                validator: (v) => _required(v),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: categoryId,
                decoration: const InputDecoration(
                  labelText: 'Category',
                  border: OutlineInputBorder(),
                ),
                items: widget.categories
                    .map(
                      (c) => DropdownMenuItem(
                        value: c['interestId'] as String,
                        child: Text(c['name'] as String),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setState(() => categoryId = value),
                validator: (value) =>
                    value == null ? 'Choose a category' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: locationName,
                maxLength: 150,
                decoration: const InputDecoration(
                  labelText: 'Venue or meeting area',
                  border: OutlineInputBorder(),
                ),
                validator: (v) => _required(v, min: 2, max: 150),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: locationDescription,
                maxLength: 500,
                decoration: const InputDecoration(
                  labelText: 'Address or meeting point details',
                  border: OutlineInputBorder(),
                ),
                validator: (v) => _required(v, min: 2, max: 500),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _chooseDate,
                icon: const Icon(Icons.calendar_month),
                label: Text(
                  startsAt == null
                      ? 'Choose date'
                      : MaterialLocalizations.of(context)
                            .formatMediumDate(startsAt!),
                ),
              ),
              OutlinedButton.icon(
                onPressed: () => _chooseTime(),
                icon: const Icon(Icons.schedule),
                label: Text(
                  startsAt == null
                      ? 'Choose start time'
                      : 'Start: ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(startsAt!))}',
                ),
              ),
              OutlinedButton.icon(
                onPressed: () => _chooseTime(end: true),
                icon: const Icon(Icons.more_time),
                label: Text(
                  endsAt == null
                      ? 'Add optional end time'
                      : 'End: ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(endsAt!))}',
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: capacity,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Maximum total people',
                  helperText: 'Includes you as the host. Choose 1 to 100.',
                  border: OutlineInputBorder(),
                ),
                validator: _integer,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: minimum,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Minimum participants (including host)',
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  final err = _integer(v);
                  if (err != null) return err;
                  final min = int.parse(v!);
                  final max = int.tryParse(capacity.text);
                  return max != null && min > max
                      ? 'Cannot exceed maximum total people'
                      : null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: cost,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Estimated cost per person (optional)',
                  border: OutlineInputBorder(),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return null;
                  final n = double.tryParse(v);
                  return n == null || n < 0 || n > 1000000
                      ? 'Enter a cost from 0 to 1,000,000'
                      : null;
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: visibility,
                decoration: const InputDecoration(
                  labelText: 'Visibility',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'public', child: Text('Public')),
                  DropdownMenuItem(
                    value: 'invite_only',
                    child: Text('Invite only'),
                  ),
                ],
                onChanged: (v) => setState(() => visibility = v ?? 'public'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: joinPolicy,
                decoration: const InputDecoration(
                  labelText: 'Join policy',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'approval',
                    child: Text('Host approval'),
                  ),
                  DropdownMenuItem(
                    value: 'auto_join',
                    child: Text('Auto-join'),
                  ),
                ],
                onChanged: (v) => setState(() => joinPolicy = v ?? 'approval'),
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: saving ? null : _save,
                child: saving
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(editing ? 'Save changes' : 'Publish activity'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _MessageState extends StatelessWidget {
  const _MessageState({required this.message, this.action});
  final String message;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.explore_outlined, size: 44),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    ),
  );
}
