import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InterestsService } from './interests.service.js';
import type { DatabaseService } from '../../database/database.service.js';

describe('InterestsService', () => {
  let service: InterestsService;
  let database: {
    query: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    database = { query: vi.fn(), withTransaction: vi.fn() };
    service = new InterestsService(database as unknown as DatabaseService);
  });

  it('rejects interest writes until the authenticated user has a profile', async () => {
    database.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.replaceUserInterests('verified-user', ['cricket']),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects unknown interest IDs without changing saved selections', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'internal-user' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      service.replaceUserInterests('verified-user', ['not-a-real-interest']),
    ).rejects.toThrow(BadRequestException);
    expect(database.withTransaction).not.toHaveBeenCalled();
  });

  it('atomically replaces selections and returns the stored interests', async () => {
    const transactionQuery = vi.fn().mockResolvedValue({ rows: [] });
    database.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'internal-user' }] })
      .mockResolvedValueOnce({ rows: [{ interest_id: 'cricket' }] })
      .mockResolvedValueOnce({ rows: [{ interest_id: 'cricket', name: 'Cricket', category: 'sports' }] });
    database.withTransaction.mockImplementation(async (callback) =>
      callback({ query: transactionQuery }),
    );

    await expect(
      service.replaceUserInterests('verified-user', [' cricket ', 'cricket']),
    ).resolves.toEqual([
      { interestId: 'cricket', name: 'Cricket', category: 'sports' },
    ]);
    expect(database.withTransaction).toHaveBeenCalledOnce();
    expect(transactionQuery).toHaveBeenNthCalledWith(
      1,
      'DELETE FROM user_interests WHERE user_id = $1',
      ['internal-user'],
    );
    expect(transactionQuery).toHaveBeenNthCalledWith(
      2,
      'INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2)',
      ['internal-user', 'cricket'],
    );
  });

  it('handles empty selection by safely clearing existing interests', async () => {
    const transactionQuery = vi.fn().mockResolvedValue({ rows: [] });
    database.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'internal-user' }] })
      .mockResolvedValueOnce({ rows: [] });
    database.withTransaction.mockImplementation(async (callback) =>
      callback({ query: transactionQuery }),
    );

    const result = await service.replaceUserInterests('verified-user', []);
    expect(result).toEqual([]);
    expect(database.withTransaction).toHaveBeenCalledOnce();
    expect(transactionQuery).toHaveBeenCalledWith(
      'DELETE FROM user_interests WHERE user_id = $1',
      ['internal-user'],
    );
  });

  it('rolls back and propagates error if transaction operation fails', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'internal-user' }] })
      .mockResolvedValueOnce({ rows: [{ interest_id: 'cricket' }] });
    database.withTransaction.mockRejectedValueOnce(
      new Error('Database transaction deadlocked'),
    );

    await expect(
      service.replaceUserInterests('verified-user', ['cricket']),
    ).rejects.toThrow('Database transaction deadlocked');
  });

  it('lists available curated interests from database', async () => {
    database.query.mockResolvedValueOnce({
      rows: [
        { interest_id: 'cricket', name: 'Cricket', category: 'sports' },
        { interest_id: 'football', name: 'Football', category: 'sports' },
      ],
    });

    const items = await service.listAvailableInterests();
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      interestId: 'cricket',
      name: 'Cricket',
      category: 'sports',
    });
  });
});
