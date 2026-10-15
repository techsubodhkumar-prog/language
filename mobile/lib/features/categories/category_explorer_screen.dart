import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../activities/activity_screens.dart';
import 'category_models.dart';
import 'create_broadcast_sheet.dart';

class CategoryExplorerScreen extends StatefulWidget {
  const CategoryExplorerScreen({
    super.key,
    required this.api,
    this.onActivityCreated,
    this.onExploreCategory,
  });

  final ApiClient api;
  final VoidCallback? onActivityCreated;
  final void Function(String categoryOrSubItem)? onExploreCategory;

  @override
  State<CategoryExplorerScreen> createState() => _CategoryExplorerScreenState();
}

class _CategoryExplorerScreenState extends State<CategoryExplorerScreen> {
  final _searchController = TextEditingController();
  String _searchQuery = '';
  String? _expandedCategory;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _openBroadcast(String categoryName, String subItemName) {
    CreateBroadcastSheet.show(
      context: context,
      api: widget.api,
      categoryName: categoryName,
      subItemName: subItemName,
      onActivityCreated: widget.onActivityCreated,
    );
  }

  void _showSubCategorySheet(CategoryItem category) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _SubCategorySheet(
        category: category,
        onSelectSubItem: (subItem) {
          Navigator.of(ctx).pop();
          _openBroadcast(category.title, subItem);
        },
        onExploreSubItem: (subItem) {
          Navigator.of(ctx).pop();
          if (widget.onExploreCategory != null) {
            widget.onExploreCategory!(subItem);
          } else {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ActivityDiscoveryScreen(api: widget.api),
              ),
            );
          }
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredCategories = appCategories.where((cat) {
      if (_searchQuery.isEmpty) return true;
      final q = _searchQuery.toLowerCase();
      if (cat.title.toLowerCase().contains(q)) return true;
      if (cat.shortTitle.toLowerCase().contains(q)) return true;
      return cat.subItems.any((sub) => sub.toLowerCase().contains(q));
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Select Interest Category',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 18,
                color: AppTheme.deepNavy,
              ),
            ),
            Text(
              'Choose your domain & broadcast plan',
              style: TextStyle(
                fontSize: 12,
                color: Color(0xFF64748B),
                fontWeight: FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Search & Filter header
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: TextField(
              controller: _searchController,
              onChanged: (val) => setState(() => _searchQuery = val.trim()),
              decoration: InputDecoration(
                hintText: 'Search football, trekking, cafes, gaming...',
                prefixIcon: const Icon(Icons.search, color: AppTheme.primary),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = '');
                        },
                      )
                    : null,
                filled: true,
                fillColor: const Color(0xFFF1F5F9),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),

          // Categories List (Matching hand-drawn wireframe)
          Expanded(
            child: filteredCategories.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.search_off,
                            size: 48,
                            color: Colors.grey.shade400,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No activities matching "$_searchQuery"',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Try searching for football, camping, movies or cafe.',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 80),
                    itemCount: filteredCategories.length,
                    itemBuilder: (context, index) {
                      final category = filteredCategories[index];
                      final isExpanded = _expandedCategory == category.title;

                      return _CategoryCard(
                        category: category,
                        isExpanded: isExpanded,
                        searchFilter: _searchQuery,
                        onTap: () => _showSubCategorySheet(category),
                        onToggleExpand: () {
                          setState(() {
                            _expandedCategory = isExpanded
                                ? null
                                : category.title;
                          });
                        },
                        onSelectSubItem: (subItem) =>
                            _openBroadcast(category.title, subItem),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    required this.category,
    required this.isExpanded,
    required this.searchFilter,
    required this.onTap,
    required this.onToggleExpand,
    required this.onSelectSubItem,
  });

  final CategoryItem category;
  final bool isExpanded;
  final String searchFilter;
  final VoidCallback onTap;
  final VoidCallback onToggleExpand;
  final void Function(String subItem) onSelectSubItem;

  @override
  Widget build(BuildContext context) {
    final matchingSubItems = category.subItems.where((sub) {
      if (searchFilter.isEmpty) return true;
      return sub.toLowerCase().contains(searchFilter.toLowerCase());
    }).toList();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isExpanded
              ? category.gradientColors.first.withValues(alpha: 0.5)
              : const Color(0xFFE2E8F0),
          width: isExpanded ? 1.5 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  // Icon badge with curated gradient
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: category.gradientColors,
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(category.icon, color: Colors.white, size: 24),
                  ),
                  const SizedBox(width: 14),

                  // Category titles
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          category.title,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.deepNavy,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${category.subItems.length} activities · tap to select',
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Quick Expand toggle
                  IconButton(
                    icon: Icon(
                      isExpanded
                          ? Icons.keyboard_arrow_up
                          : Icons.keyboard_arrow_down,
                      color: AppTheme.deepNavy,
                    ),
                    onPressed: onToggleExpand,
                  ),
                ],
              ),
            ),
          ),

          // Inline expanded list for instant sub-selection
          if (isExpanded)
            Container(
              decoration: const BoxDecoration(
                color: Color(0xFFF8FAFC),
                borderRadius: BorderRadius.vertical(
                  bottom: Radius.circular(16),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Divider(height: 1),
                  const SizedBox(height: 10),
                  ...matchingSubItems.map(
                    (sub) => Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      child: InkWell(
                        onTap: () => onSelectSubItem(sub),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.play_arrow_rounded,
                                size: 18,
                                color: AppTheme.primary,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  sub,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: AppTheme.deepNavy,
                                  ),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: AppTheme.primary.withValues(
                                    alpha: 0.1,
                                  ),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'Send Msg',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: AppTheme.primary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _SubCategorySheet extends StatelessWidget {
  const _SubCategorySheet({
    required this.category,
    required this.onSelectSubItem,
    required this.onExploreSubItem,
  });

  final CategoryItem category;
  final void Function(String subItem) onSelectSubItem;
  final void Function(String subItem) onExploreSubItem;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.78,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          // Drag handle
          Center(
            child: Container(
              width: 44,
              height: 4,
              margin: const EdgeInsets.only(top: 12, bottom: 12),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: category.gradientColors),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(category.icon, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        category.title,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.deepNavy,
                        ),
                      ),
                      Text(
                        'Select sub-activity to broadcast message',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
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
          ),
          const Divider(height: 1),

          // List of sub-items
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: category.subItems.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final sub = category.subItems[index];
                return InkWell(
                  onTap: () => onSelectSubItem(sub),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: const Icon(
                            Icons.sports_soccer_outlined,
                            size: 16,
                            color: AppTheme.primary,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            sub,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.deepNavy,
                            ),
                          ),
                        ),
                        FilledButton.tonalIcon(
                          onPressed: () => onSelectSubItem(sub),
                          icon: const Icon(Icons.send_rounded, size: 14),
                          label: const Text(
                            'Send Msg',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
