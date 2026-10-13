import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.api, this.onProfileUpdated});

  final ApiClient api;
  final VoidCallback? onProfileUpdated;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _displayNameController = TextEditingController();
  final _bioController = TextEditingController();

  List<dynamic> _availableInterests = [];
  final Set<String> _selectedInterests = {};

  bool _loading = true;
  bool _saving = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadProfileAndInterests();
  }

  Future<void> _loadProfileAndInterests() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      final profile = await widget.api.request('GET', '/users/me');
      final availableRes = await widget.api.request('GET', '/interests');
      final userInterestsRes = await widget.api.request('GET', '/interests/me');

      if (!mounted) return;

      final available = (availableRes['interests'] as List<dynamic>?) ?? [];
      final userInterests =
          (userInterestsRes['interests'] as List<dynamic>?) ?? [];

      _displayNameController.text =
          (profile['displayName'] as String?)?.trim() ?? '';
      _bioController.text = (profile['bio'] as String?)?.trim() ?? '';

      _selectedInterests.clear();
      for (final item in userInterests) {
        final id = item['interestId'] as String?;
        if (id != null) _selectedInterests.add(id);
      }

      setState(() {
        _availableInterests = available;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _errorMessage = 'Could not load your profile. Please check the network connection and try again.';
      });
    }
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    if (_selectedInterests.isEmpty) {
      setState(() {
        _errorMessage = 'Please select at least one interest.';
      });
      return;
    }

    setState(() {
      _saving = true;
      _errorMessage = null;
    });

    try {
      await widget.api.request(
        'PUT',
        '/users/me',
        body: {
          'displayName': _displayNameController.text.trim(),
          'bio': _bioController.text.trim(),
        },
      );

      await widget.api.request(
        'PUT',
        '/interests/me',
        body: {'interestIds': _selectedInterests.toList()},
      );

      widget.onProfileUpdated?.call();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Profile and interests updated successfully!'),
        ),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errorMessage =
            'Failed to save changes. Please verify connection and retry.';
      });
    }
  }

  @override
  void dispose() {
    _displayNameController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Profile & Interests')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null && _availableInterests.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_errorMessage!, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _loadProfileAndInterests,
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Profile Information',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _displayNameController,
                      maxLength: 50,
                      decoration: const InputDecoration(
                        labelText: 'Display Name',
                        border: OutlineInputBorder(),
                        hintText: 'e.g. Alex, Sam Wilson',
                      ),
                      validator: (value) {
                        final trimmed = value?.trim() ?? '';
                        if (trimmed.length < 2) {
                          return 'Name must be at least 2 characters.';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _bioController,
                      maxLength: 300,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Bio (optional)',
                        border: OutlineInputBorder(),
                        hintText: 'Share a bit about what you enjoy doing…',
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Your Interests',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Select at least one to discover relevant activities.',
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: _availableInterests.map((item) {
                        final id = item['interestId'] as String;
                        final name = item['name'] as String;
                        final isSelected = _selectedInterests.contains(id);
                        return FilterChip(
                          label: Text(name),
                          selected: isSelected,
                          onSelected: (selected) {
                            setState(() {
                              if (selected) {
                                _selectedInterests.add(id);
                              } else {
                                _selectedInterests.remove(id);
                              }
                            });
                          },
                        );
                      }).toList(),
                    ),
                    if (_errorMessage != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Text(
                          _errorMessage!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _saving ? null : _save,
                      child: _saving
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Save Changes'),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
