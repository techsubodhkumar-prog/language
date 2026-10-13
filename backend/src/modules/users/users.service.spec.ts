import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import type { DatabaseService } from '../../database/database.service.js';

describe('UsersService', () => {
  let service: UsersService;
  let mockDatabaseService: Partial<DatabaseService>;

  beforeEach(() => {
    mockDatabaseService = {
      query: vi.fn(),
    };
    service = new UsersService(mockDatabaseService as DatabaseService);
  });

  it('fetches existing profile for authenticated supabase user', async () => {
    const mockRow = {
      user_id: 'db-uuid-1',
      supabase_user_id: 'supa-123',
      display_name: 'Subodh',
      bio: 'Loves sports',
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    (mockDatabaseService.query as any).mockResolvedValueOnce({
      rows: [mockRow],
    });

    const profile = await service.getProfile('supa-123');

    expect(profile.userId).toBe('db-uuid-1');
    expect(profile.displayName).toBe('Subodh');
    expect(profile.bio).toBe('Loves sports');
  });

  it('throws NotFoundException when profile is not found', async () => {
    (mockDatabaseService.query as any).mockResolvedValueOnce({
      rows: [],
    });

    await expect(service.getProfile('non-existent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('upserts profile and returns updated record', async () => {
    const mockRow = {
      user_id: 'db-uuid-1',
      supabase_user_id: 'supa-123',
      display_name: 'Subodh Kumar',
      bio: 'Updated bio',
      avatar_url: 'https://example.com/avatar.png',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    (mockDatabaseService.query as any).mockResolvedValueOnce({
      rows: [mockRow],
    });

    const updated = await service.upsertProfile('supa-123', {
      displayName: 'Subodh Kumar',
      bio: 'Updated bio',
      avatarUrl: 'https://example.com/avatar.png',
    });

    expect(updated.displayName).toBe('Subodh Kumar');
    expect(updated.avatarUrl).toBe('https://example.com/avatar.png');
    expect(mockDatabaseService.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO profiles'),
      ['supa-123', 'Subodh Kumar', 'Updated bio', 'https://example.com/avatar.png'],
    );
  });

  it('partially updates profile when displayName is not provided', async () => {
    const existingRow = {
      user_id: 'db-uuid-1',
      supabase_user_id: 'supa-123',
      display_name: 'Subodh',
      bio: 'Old bio',
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const updatedRow = {
      ...existingRow,
      bio: 'New bio only',
    };

    (mockDatabaseService.query as any)
      .mockResolvedValueOnce({ rows: [existingRow] })
      .mockResolvedValueOnce({ rows: [updatedRow] });

    const updated = await service.upsertProfile('supa-123', {
      bio: 'New bio only',
    });

    expect(updated.displayName).toBe('Subodh');
    expect(updated.bio).toBe('New bio only');
    expect(mockDatabaseService.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE profiles SET bio = COALESCE'),
      ['supa-123', 'New bio only', null],
    );
  });
});
