import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';
import { AuthGuard } from '../src/modules/auth/auth.guard.js';
import type { AuthenticatedUser } from '../src/modules/auth/auth.types.js';
import { ActivitiesController } from '../src/modules/activities/activities.controller.js';
import { ActivitiesService } from '../src/modules/activities/activities.service.js';
import { MembershipsController } from '../src/modules/memberships/memberships.controller.js';
import { MembershipsService } from '../src/modules/memberships/memberships.service.js';
import { ChatController } from '../src/modules/chat/chat.controller.js';
import { ChatService } from '../src/modules/chat/chat.service.js';
import { ChatGateway } from '../src/modules/chat/chat.gateway.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { UsersController } from '../src/modules/users/users.controller.js';
import { UsersService } from '../src/modules/users/users.service.js';
import { InterestsController } from '../src/modules/interests/interests.controller.js';
import { InterestsService } from '../src/modules/interests/interests.service.js';
import { NotificationsController } from '../src/modules/notifications/notifications.controller.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';

describe('Activity Discovery API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('activity-discovery-api');
        expect(res.body.version).toBe('1.0.0');
        expect(typeof res.body.timestamp).toBe('string');
        expect(typeof res.body.uptimeSeconds).toBe('number');
      });
  });

  it('/api/v1/unknown (GET) returns standardized error response', () => {
    return request(app.getHttpServer())
      .get('/api/v1/unknown')
      .expect(404)
      .expect((res) => {
        expect(res.body.statusCode).toBe(404);
        expect(res.body.path).toBe('/api/v1/unknown');
        expect(typeof res.body.timestamp).toBe('string');
      });
  });

  it('protects activity discovery and creation without a verified access token', async () => {
    await request(app.getHttpServer()).get('/api/v1/activities').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/activities')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/activities/00000000-0000-4000-8000-000000000001/join')
      .expect(401);
    await request(app.getHttpServer())
      .get(
        '/api/v1/activities/00000000-0000-4000-8000-000000000001/participants',
      )
      .expect(401);
    await request(app.getHttpServer())
      .get(
        '/api/v1/activities/00000000-0000-4000-8000-000000000001/messages',
      )
      .expect(401);
    await request(app.getHttpServer())
      .post(
        '/api/v1/activities/00000000-0000-4000-8000-000000000001/messages',
      )
      .send({ content: 'Test message' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .expect(401);
  });

  it('derives the membership requester exclusively from the verified token', async () => {
    const verifiedUser: AuthenticatedUser = {
      userId: 'verified-membership-subject',
    };
    const join = vi
      .fn()
      .mockResolvedValue({ membershipId: 'membership-1', status: 'requested' });
    const moduleFixture = await Test.createTestingModule({
      controllers: [MembershipsController],
      providers: [{ provide: MembershipsService, useValue: { join } }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: import('@nestjs/common').ExecutionContext) => {
          context
            .switchToHttp()
            .getRequest<{ user?: AuthenticatedUser }>().user = verifiedUser;
          return true;
        },
      })
      .compile();
    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    await testApp.init();
    try {
      await request(testApp.getHttpServer())
        .post('/api/v1/activities/00000000-0000-4000-8000-000000000001/join')
        .send({ userId: 'attacker-controlled-user' })
        .expect(201);
      expect(join).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        verifiedUser,
      );
    } finally {
      await testApp.close();
    }
  });

  it('validates the activity API body and passes only the guarded identity to creation', async () => {
    const verifiedUser: AuthenticatedUser = { userId: 'verified-subject' };
    const create = vi.fn().mockResolvedValue({ activityId: 'activity-1' });
    const testModule = Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [{ provide: ActivitiesService, useValue: { create } }],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: import('@nestjs/common').ExecutionContext) => {
          const req = context
            .switchToHttp()
            .getRequest<{ user?: AuthenticatedUser }>();
          req.user = verifiedUser;
          return true;
        },
      });
    const moduleFixture = await testModule.compile();
    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    await testApp.init();
    const body = {
      title: 'Morning cricket',
      description: 'Friendly game',
      categoryId: 'cricket',
      locationName: 'Central Park',
      locationDescription: 'North entrance',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      maxParticipants: 6,
    };
    try {
      await request(testApp.getHttpServer())
        .post('/api/v1/activities')
        .send(body)
        .expect(201);
      expect(create).toHaveBeenCalledWith(
        verifiedUser,
        expect.objectContaining(body),
      );
      for (const invalidBody of [
        { ...body, title: 'x' },
        { ...body, startsAt: 'invalid-date' },
        { ...body, categoryId: '' },
        { ...body, maxParticipants: 0 },
        { ...body, hostUserId: 'attacker' },
      ]) {
        await request(testApp.getHttpServer())
          .post('/api/v1/activities')
          .send(invalidBody)
          .expect(400);
      }
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      await testApp.close();
    }
  });

  it('derives chat sender exclusively from verified token and broadcasts via gateway', async () => {
    const verifiedUser: AuthenticatedUser = { userId: 'chat-verified-user' };
    const savedMessage = {
      messageId: 'msg-1',
      activityId: '00000000-0000-4000-8000-000000000001',
      senderId: 'prof-1',
      senderSupabaseUserId: 'chat-verified-user',
      senderName: 'Chat User',
      senderAvatarUrl: null,
      content: 'Hello team!',
      createdAt: new Date().toISOString(),
    };

    const saveMessage = vi.fn().mockResolvedValue(savedMessage);
    const getMessages = vi.fn().mockResolvedValue({
      items: [savedMessage],
      pagination: { limit: 50, offset: 0, total: 1, hasMore: false },
    });
    const broadcastMessage = vi.fn();

    const moduleFixture = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: { saveMessage, getMessages },
        },
        {
          provide: ChatGateway,
          useValue: { broadcastMessage },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: import('@nestjs/common').ExecutionContext) => {
          context
            .switchToHttp()
            .getRequest<{ user?: AuthenticatedUser }>().user = verifiedUser;
          return true;
        },
      })
      .compile();

    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    await testApp.init();

    try {
      // POST message derives sender exclusively from verified token, ignoring any payload attempt to spoof sender
      await request(testApp.getHttpServer())
        .post('/api/v1/activities/00000000-0000-4000-8000-000000000001/messages')
        .send({
          content: 'Hello team!',
          senderId: 'spoofed-attacker-id',
          senderName: 'Fake Name',
        })
        .expect(201);

      expect(saveMessage).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        verifiedUser,
        'Hello team!',
      );
      expect(broadcastMessage).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        savedMessage,
      );

      // GET messages retrieves history for verified member
      await request(testApp.getHttpServer())
        .get('/api/v1/activities/00000000-0000-4000-8000-000000000001/messages?limit=20&offset=0')
        .expect(200);

      expect(getMessages).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        verifiedUser,
        expect.objectContaining({ limit: 20, offset: 0 }),
      );
    } finally {
      await testApp.close();
    }
  });

  it('/api/v1/auth/me returns verified identity when authenticated', async () => {
    const verifiedUser: AuthenticatedUser = {
      userId: 'auth-test-user-uuid',
      email: 'tester@example.com',
      role: 'authenticated',
    };

    const moduleFixture = await Test.createTestingModule({
      controllers: [AuthController],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: import('@nestjs/common').ExecutionContext) => {
          context
            .switchToHttp()
            .getRequest<{ user?: AuthenticatedUser }>().user = verifiedUser;
          return true;
        },
      })
      .compile();

    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    await testApp.init();

    try {
      const res = await request(testApp.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(200);

      expect(res.body.authenticated).toBe(true);
      expect(res.body.user.userId).toBe('auth-test-user-uuid');
      expect(res.body.user.email).toBe('tester@example.com');
    } finally {
      await testApp.close();
    }
  });

  it('enforces profile ownership and rejects invalid display names or body ID spoofing', async () => {
    const verifiedUser: AuthenticatedUser = { userId: 'legit-user-123' };
    const upsertProfile = vi.fn().mockResolvedValue({
      userId: 'db-profile-uuid',
      supabaseUserId: 'legit-user-123',
      displayName: 'Legit User',
      bio: null,
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const getProfile = vi.fn().mockResolvedValue({
      userId: 'db-profile-uuid',
      supabaseUserId: 'legit-user-123',
      displayName: 'Legit User',
      bio: null,
      avatarUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const moduleFixture = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: { upsertProfile, getProfile },
        },
        {
          provide: InterestsService,
          useValue: {
            getUserInterests: vi.fn(),
            replaceUserInterests: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: import('@nestjs/common').ExecutionContext) => {
          context
            .switchToHttp()
            .getRequest<{ user?: AuthenticatedUser }>().user = verifiedUser;
          return true;
        },
      })
      .compile();

    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    testApp.useGlobalFilters(new HttpExceptionFilter());
    await testApp.init();

    try {
      // 1. GET /api/v1/users/me uses token subject
      await request(testApp.getHttpServer())
        .get('/api/v1/users/me')
        .expect(200);
      expect(getProfile).toHaveBeenCalledWith('legit-user-123');

      // 2. PUT /api/v1/users/me binds strictly to token subject
      await request(testApp.getHttpServer())
        .put('/api/v1/users/me')
        .send({ displayName: 'Legit User' })
        .expect(200);
      expect(upsertProfile).toHaveBeenCalledWith(
        'legit-user-123',
        expect.objectContaining({ displayName: 'Legit User' }),
      );

      // 3. Reject invalid display name (< 2 chars or whitespace only)
      await request(testApp.getHttpServer())
        .put('/api/v1/users/me')
        .send({ displayName: 'a' })
        .expect(400);

      // 4. Reject unknown fields (forbidNonWhitelisted) preventing ID spoofing
      await request(testApp.getHttpServer())
        .put('/api/v1/users/me')
        .send({ displayName: 'Legit User', userId: 'attacker-id' })
        .expect(400);
    } finally {
      await testApp.close();
    }
  });

  it('lists available interests and allows managing user interests', async () => {
    const verifiedUser: AuthenticatedUser = { userId: 'interests-user' };
    const mockInterests = [
      { interestId: 'cricket', name: 'Cricket', category: 'sports' },
      { interestId: 'football', name: 'Football', category: 'sports' },
    ];

    const listAvailableInterests = vi.fn().mockResolvedValue(mockInterests);
    const getUserInterests = vi.fn().mockResolvedValue([mockInterests[0]]);
    const replaceUserInterests = vi.fn().mockResolvedValue(mockInterests);

    const moduleFixture = await Test.createTestingModule({
      controllers: [InterestsController, UsersController],
      providers: [
        {
          provide: InterestsService,
          useValue: {
            listAvailableInterests,
            getUserInterests,
            replaceUserInterests,
          },
        },
        {
          provide: UsersService,
          useValue: {
            getProfile: vi.fn(),
            upsertProfile: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: import('@nestjs/common').ExecutionContext) => {
          context
            .switchToHttp()
            .getRequest<{ user?: AuthenticatedUser }>().user = verifiedUser;
          return true;
        },
      })
      .compile();

    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    await testApp.init();

    try {
      // 1. GET /api/v1/interests (public)
      const listRes = await request(testApp.getHttpServer())
        .get('/api/v1/interests')
        .expect(200);
      expect(listRes.body.count).toBe(2);
      expect(listRes.body.interests).toHaveLength(2);

      // 2. GET /api/v1/users/me/interests
      const userInterestsRes = await request(testApp.getHttpServer())
        .get('/api/v1/users/me/interests')
        .expect(200);
      expect(userInterestsRes.body.count).toBe(1);
      expect(getUserInterests).toHaveBeenCalledWith('interests-user');

      // 3. PUT /api/v1/users/me/interests
      const putRes = await request(testApp.getHttpServer())
        .put('/api/v1/users/me/interests')
        .send({ interestIds: ['cricket', 'football'] })
        .expect(200);
      expect(putRes.body.count).toBe(2);
      expect(replaceUserInterests).toHaveBeenCalledWith('interests-user', [
        'cricket',
        'football',
      ]);
    } finally {
      await testApp.close();
    }
  });

  it('supports activity discovery, details lookup, editing, and cancellation endpoints', async () => {
    const verifiedUser: AuthenticatedUser = { userId: 'host-user-uuid' };
    const mockActivity = {
      activityId: '00000000-0000-4000-8000-000000000001',
      title: 'Weekend Trekking',
      description: 'Mountain trail',
      categoryId: 'travel_trips',
      category: 'Weekend Trips & Trekking',
      locationName: 'Base Camp',
      locationDescription: 'Trailhead',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: null,
      minParticipants: 1,
      maxParticipants: 8,
      participantCount: 1,
      remainingPlaces: 7,
      estimatedCost: 200,
      visibility: 'public',
      joinPolicy: 'approval',
      status: 'scheduled',
      hostName: 'Subodh',
      isHost: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const list = vi.fn().mockResolvedValue({
      items: [mockActivity],
      pagination: { limit: 20, offset: 0, total: 1 },
    });
    const getById = vi.fn().mockResolvedValue(mockActivity);
    const update = vi.fn().mockResolvedValue({
      ...mockActivity,
      title: 'Updated Weekend Trekking',
    });
    const cancel = vi.fn().mockResolvedValue({
      activityId: mockActivity.activityId,
      status: 'cancelled',
    });

    const moduleFixture = await Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [
        {
          provide: ActivitiesService,
          useValue: { list, getById, update, cancel },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: import('@nestjs/common').ExecutionContext) => {
          context
            .switchToHttp()
            .getRequest<{ user?: AuthenticatedUser }>().user = verifiedUser;
          return true;
        },
      })
      .compile();

    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    await testApp.init();

    try {
      // 1. GET /api/v1/activities with search, category, sort, and pagination
      const listRes = await request(testApp.getHttpServer())
        .get(
          '/api/v1/activities?search=trekking&category=travel_trips&sort=soonest&limit=10&page=1',
        )
        .expect(200);
      expect(listRes.body.items).toHaveLength(1);
      expect(listRes.body.pagination.total).toBe(1);
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'trekking',
          category: 'travel_trips',
          sort: 'soonest',
          limit: 10,
          page: 1,
        }),
        verifiedUser,
      );

      // 2. GET /api/v1/activities/:id
      const detailRes = await request(testApp.getHttpServer())
        .get('/api/v1/activities/00000000-0000-4000-8000-000000000001')
        .expect(200);
      expect(detailRes.body.activityId).toBe(
        '00000000-0000-4000-8000-000000000001',
      );
      expect(detailRes.body.maxParticipants).toBe(8);
      expect(detailRes.body.isHost).toBe(true);

      // 3. PATCH /api/v1/activities/:id
      const updateRes = await request(testApp.getHttpServer())
        .patch('/api/v1/activities/00000000-0000-4000-8000-000000000001')
        .send({ title: 'Updated Weekend Trekking' })
        .expect(200);
      expect(updateRes.body.title).toBe('Updated Weekend Trekking');
      expect(update).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        verifiedUser,
        expect.objectContaining({ title: 'Updated Weekend Trekking' }),
      );

      // 4. POST /api/v1/activities/:id/cancel
      const cancelPostRes = await request(testApp.getHttpServer())
        .post('/api/v1/activities/00000000-0000-4000-8000-000000000001/cancel')
        .expect(201);
      expect(cancelPostRes.body.status).toBe('cancelled');

      // 5. PATCH /api/v1/activities/:id/cancel
      const cancelPatchRes = await request(testApp.getHttpServer())
        .patch('/api/v1/activities/00000000-0000-4000-8000-000000000001/cancel')
        .expect(200);
      expect(cancelPatchRes.body.status).toBe('cancelled');
    } finally {
      await testApp.close();
    }
  });

  it('handles notification listing, unread counts, mark-read, mark-all-read, and device tokens', async () => {
    const verifiedUser: AuthenticatedUser = {
      userId: 'verified-notification-user',
    };
    const mockNotification = {
      notificationId: '00000000-0000-4000-8000-000000000010',
      recipientId: 'profile-notif-1',
      type: 'activity_reminder',
      title: 'Upcoming Yoga',
      message: 'Your activity is starting soon!',
      activityId: '00000000-0000-4000-8000-000000000001',
      referenceId: null,
      data: { startsAt: '2026-10-15T10:00:00Z' },
      readAt: null,
      createdAt: '2026-10-14T03:00:00Z',
    };

    const listNotifications = vi.fn().mockResolvedValue({
      items: [mockNotification],
      unreadCount: 1,
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
    });
    const getUnreadCount = vi.fn().mockResolvedValue({ unreadCount: 1 });
    const markAsRead = vi.fn().mockResolvedValue({
      ...mockNotification,
      readAt: '2026-10-14T03:30:00Z',
    });
    const markAllAsRead = vi.fn().mockResolvedValue({ updatedCount: 1 });
    const dismiss = vi.fn().mockResolvedValue({
      notificationId: '00000000-0000-4000-8000-000000000010',
      dismissed: true,
    });
    const registerDeviceToken = vi.fn().mockResolvedValue({ registered: true });
    const removeDeviceToken = vi.fn().mockResolvedValue({ removed: true });

    const moduleFixture = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            listNotifications,
            getUnreadCount,
            markAsRead,
            markAllAsRead,
            dismiss,
            registerDeviceToken,
            removeDeviceToken,
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: import('@nestjs/common').ExecutionContext) => {
          context
            .switchToHttp()
            .getRequest<{ user?: AuthenticatedUser }>().user = verifiedUser;
          return true;
        },
      })
      .compile();

    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api/v1');
    await testApp.init();

    try {
      // 1. GET /api/v1/notifications
      const listRes = await request(testApp.getHttpServer())
        .get('/api/v1/notifications?limit=20&offset=0&unreadOnly=false')
        .expect(200);
      expect(listRes.body.items).toHaveLength(1);
      expect(listRes.body.unreadCount).toBe(1);
      expect(listNotifications).toHaveBeenCalledWith(
        verifiedUser,
        expect.objectContaining({ limit: 20, offset: 0, unreadOnly: false }),
      );

      // 2. GET /api/v1/notifications/unread-count
      const countRes = await request(testApp.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .expect(200);
      expect(countRes.body.unreadCount).toBe(1);

      // 3. PATCH /api/v1/notifications/:id/read
      const readRes = await request(testApp.getHttpServer())
        .patch('/api/v1/notifications/00000000-0000-4000-8000-000000000010/read')
        .expect(200);
      expect(readRes.body.readAt).toBe('2026-10-14T03:30:00Z');
      expect(markAsRead).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000010',
        verifiedUser,
      );

      // 4. PATCH /api/v1/notifications/read-all
      const readAllRes = await request(testApp.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .expect(200);
      expect(readAllRes.body.updatedCount).toBe(1);

      // 5. DELETE /api/v1/notifications/:id
      const delRes = await request(testApp.getHttpServer())
        .delete('/api/v1/notifications/00000000-0000-4000-8000-000000000010')
        .expect(200);
      expect(delRes.body.dismissed).toBe(true);
      expect(dismiss).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000010',
        verifiedUser,
      );

      // 6. POST /api/v1/notifications/device-token
      const regRes = await request(testApp.getHttpServer())
        .post('/api/v1/notifications/device-token')
        .send({ token: 'mock-fcm-device-token', deviceType: 'android' })
        .expect(200);
      expect(regRes.body.registered).toBe(true);

      // 7. DELETE /api/v1/notifications/device-token/:token
      const remRes = await request(testApp.getHttpServer())
        .delete('/api/v1/notifications/device-token/mock-fcm-device-token')
        .expect(200);
      expect(remRes.body.removed).toBe(true);
    } finally {
      await testApp.close();
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
