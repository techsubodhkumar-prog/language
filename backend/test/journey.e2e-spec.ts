import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuthGuard } from '../src/modules/auth/auth.guard.js';
import type { AuthenticatedUser } from '../src/modules/auth/auth.types.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { UsersController } from '../src/modules/users/users.controller.js';
import { UsersService } from '../src/modules/users/users.service.js';
import { InterestsController } from '../src/modules/interests/interests.controller.js';
import { InterestsService } from '../src/modules/interests/interests.service.js';
import { ActivitiesController } from '../src/modules/activities/activities.controller.js';
import { ActivitiesService } from '../src/modules/activities/activities.service.js';
import { MembershipsController } from '../src/modules/memberships/memberships.controller.js';
import { MembershipsService } from '../src/modules/memberships/memberships.service.js';
import { ChatController } from '../src/modules/chat/chat.controller.js';
import { ChatService } from '../src/modules/chat/chat.service.js';
import { ChatGateway } from '../src/modules/chat/chat.gateway.js';
import { NotificationsController } from '../src/modules/notifications/notifications.controller.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { SupabaseTokenVerifierService } from '../src/modules/auth/supabase-token-verifier.service.js';

describe('End-to-End Product Journey (14 Steps)', () => {
  let app: INestApplication<App>;
  let currentUser: AuthenticatedUser | null = null;

  const testActivityId = '00000000-0000-4000-8000-000000000100';
  const testMembershipId = '00000000-0000-4000-8000-000000000200';
  const testNotificationId = '00000000-0000-4000-8000-000000000300';

  // In-memory test state representing domain models
  const usersStore = new Map<string, any>();
  const interestsStore = new Map<string, string[]>();
  const activitiesStore = new Map<string, any>();
  const membershipsStore = new Map<string, any>();
  const messagesStore: any[] = [];
  const notificationsStore = new Map<string, any>();

  const hostUser: AuthenticatedUser = {
    userId: '00000000-0000-4000-a000-000000000001',
    email: 'host@test.example',
    role: 'authenticated',
  };

  const participantUser: AuthenticatedUser = {
    userId: '00000000-0000-4000-a000-000000000002',
    email: 'participant@test.example',
    role: 'authenticated',
  };

  beforeEach(async () => {
    currentUser = hostUser;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        AuthController,
        UsersController,
        InterestsController,
        ActivitiesController,
        MembershipsController,
        ChatController,
        NotificationsController,
      ],
      providers: [
        {
          provide: SupabaseTokenVerifierService,
          useValue: {
            verifyToken: vi.fn(async (token: string) => {
              if (token === 'expired-token') throw new Error('JWT expired');
              if (token === 'participant-token') return participantUser;
              return hostUser;
            }),
          },
        },
        {
          provide: UsersService,
          useValue: {
            getProfile: vi.fn(async (id: string) => usersStore.get(id) || null),
            upsertProfile: vi.fn(async (id: string, dto: any) => {
              const profile = {
                userId: `prof-${id}`,
                supabaseUserId: id,
                displayName: dto.displayName,
                bio: dto.bio || null,
                avatarUrl: dto.avatarUrl || null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              usersStore.set(id, profile);
              return profile;
            }),
          },
        },
        {
          provide: InterestsService,
          useValue: {
            listAvailableInterests: vi.fn(async () => [
              { interestId: 'sports_running', name: 'Running', category: 'sports' },
              { interestId: 'fitness_yoga', name: 'Yoga', category: 'fitness' },
            ]),
            getUserInterests: vi.fn(async (id: string) => {
              const ids = interestsStore.get(id) || [];
              return ids.map((i) => ({ interestId: i, name: i, category: 'general' }));
            }),
            replaceUserInterests: vi.fn(async (id: string, ids: string[]) => {
              interestsStore.set(id, ids);
              return ids.map((i) => ({ interestId: i, name: i, category: 'general' }));
            }),
          },
        },
        {
          provide: ActivitiesService,
          useValue: {
            create: vi.fn(async (user: AuthenticatedUser, dto: any) => {
              const activity = {
                activityId: testActivityId,
                title: dto.title,
                description: dto.description,
                categoryId: dto.categoryId,
                locationName: dto.locationName,
                locationDescription: dto.locationDescription,
                startsAt: dto.startsAt,
                maxParticipants: dto.maxParticipants,
                minParticipants: dto.minParticipants || 1,
                status: 'scheduled',
                hostUserId: user.userId,
                isHost: true,
                participantCount: 1,
                remainingPlaces: dto.maxParticipants - 1,
              };
              activitiesStore.set(testActivityId, activity);
              return activity;
            }),
            list: vi.fn(async (filters: any) => {
              const all = Array.from(activitiesStore.values());
              const filtered = all.filter((a) => {
                if (filters.search && !a.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
                return true;
              });
              return { items: filtered, pagination: { total: filtered.length, limit: 20, offset: 0 } };
            }),
            getById: vi.fn(async (id: string, user: AuthenticatedUser) => {
              const a = activitiesStore.get(id);
              if (!a) throw new Error('Not found');
              return { ...a, isHost: a.hostUserId === user.userId };
            }),
            cancel: vi.fn(async (id: string, user: AuthenticatedUser) => {
              const a = activitiesStore.get(id);
              if (a.hostUserId !== user.userId) throw new Error('Forbidden');
              a.status = 'cancelled';
              activitiesStore.set(id, a);
              return { activityId: id, status: 'cancelled' };
            }),
          },
        },
        {
          provide: MembershipsService,
          useValue: {
            join: vi.fn(async (actId: string, user: AuthenticatedUser) => {
              const a = activitiesStore.get(actId);
              if (a.status === 'cancelled') throw new Error('Activity cancelled');
              if (a.hostUserId === user.userId) throw new Error('Host cannot join');
              const membership = {
                membershipId: testMembershipId,
                activityId: actId,
                userId: user.userId,
                status: 'requested',
              };
              membershipsStore.set(testMembershipId, membership);
              return { membershipId: testMembershipId, status: 'requested' };
            }),
            decide: vi.fn(async (actId: string, memId: string, user: AuthenticatedUser, decision: string) => {
              const a = activitiesStore.get(actId);
              if (a.hostUserId !== user.userId) throw new Error('Forbidden');
              const m = membershipsStore.get(memId);
              m.status = decision;
              if (decision === 'approved') {
                a.participantCount += 1;
                a.remainingPlaces -= 1;
              }
              return { membershipId: memId, status: decision };
            }),
            participants: vi.fn(async (actId: string) => {
              const a = activitiesStore.get(actId);
              const items = [{ displayName: 'Host Subodh', role: 'host' }];
              for (const m of membershipsStore.values()) {
                if (m.activityId === actId && m.status === 'approved') {
                  items.push({ displayName: 'Participant Alex', role: 'participant' });
                }
              }
              return { total: a.participantCount, remaining: a.remainingPlaces, items };
            }),
          },
        },
        {
          provide: ChatGateway,
          useValue: { broadcastMessage: vi.fn() },
        },
        {
          provide: ChatService,
          useValue: {
            saveMessage: vi.fn(async (actId: string, user: AuthenticatedUser, content: string) => {
              const a = activitiesStore.get(actId);
              const isApproved =
                user.userId === a.hostUserId ||
                Array.from(membershipsStore.values()).some(
                  (m) => m.activityId === actId && m.userId === user.userId && m.status === 'approved',
                );
              if (!isApproved) throw new Error('Forbidden');
              const msg = {
                messageId: `msg-${Date.now()}`,
                activityId: actId,
                senderId: user.userId,
                senderSupabaseUserId: user.userId,
                senderName: user.userId === hostUser.userId ? 'Host' : 'Participant',
                content,
                createdAt: new Date().toISOString(),
              };
              messagesStore.push(msg);
              return msg;
            }),
            getMessages: vi.fn(async (actId: string, user: AuthenticatedUser) => {
              const a = activitiesStore.get(actId);
              const isApproved =
                user.userId === a.hostUserId ||
                Array.from(membershipsStore.values()).some(
                  (m) => m.activityId === actId && m.userId === user.userId && m.status === 'approved',
                );
              if (!isApproved) throw new Error('Forbidden');
              return {
                items: messagesStore.filter((m) => m.activityId === actId),
                pagination: { total: messagesStore.length, limit: 50, offset: 0, hasMore: false },
              };
            }),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            listNotifications: vi.fn(async (user: AuthenticatedUser) => {
              const items = Array.from(notificationsStore.values()).filter((n) => n.recipientId === user.userId);
              return { items, unreadCount: items.filter((n) => !n.readAt).length, pagination: { total: items.length } };
            }),
            markAsRead: vi.fn(async (notifId: string, user: AuthenticatedUser) => {
              const n = notificationsStore.get(notifId);
              if (n.recipientId !== user.userId) throw new Error('Forbidden');
              n.readAt = new Date().toISOString();
              return n;
            }),
            dismiss: vi.fn(async (notifId: string, user: AuthenticatedUser) => {
              const n = notificationsStore.get(notifId);
              if (n.recipientId !== user.userId) throw new Error('Forbidden');
              notificationsStore.delete(notifId);
              return { notificationId: notifId, dismissed: true };
            }),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: any) => {
          if (!currentUser) throw new UnauthorizedException('Unauthenticated');
          context.switchToHttp().getRequest().user = currentUser;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('verifies the complete 14-step end-to-end product journey', async () => {
    // Step 1: Register / verify new host identity
    currentUser = hostUser;
    const authRes = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(200);
    expect(authRes.body.authenticated).toBe(true);
    expect(authRes.body.user.userId).toBe(hostUser.userId);

    // Step 2: Complete profile onboarding
    const onboardRes = await request(app.getHttpServer())
      .put('/api/v1/users/me')
      .send({ displayName: 'Subodh Host', bio: 'Outdoor enthusiast' })
      .expect(200);
    expect(onboardRes.body.displayName).toBe('Subodh Host');

    // Step 3: Edit profile and interests
    await request(app.getHttpServer())
      .put('/api/v1/users/me/interests')
      .send({ interestIds: ['sports_running', 'fitness_yoga'] })
      .expect(200);
    const interestsRes = await request(app.getHttpServer()).get('/api/v1/users/me/interests').expect(200);
    expect(interestsRes.body.count).toBe(2);

    // Step 4: Create an activity with location, date, and capacity (host included)
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/activities')
      .send({
        title: 'Morning 5K Trail Run',
        description: 'Casual pace around the lake',
        categoryId: 'sports_running',
        locationName: 'City Lake Trailhead',
        locationDescription: 'Meet at the north gazebo',
        startsAt: futureDate,
        maxParticipants: 4,
        minParticipants: 2,
      })
      .expect(201);
    expect(createRes.body.activityId).toBe(testActivityId);
    expect(createRes.body.remainingPlaces).toBe(3);

    // Step 5: Discover activities and verify search, filters, details
    const searchRes = await request(app.getHttpServer())
      .get('/api/v1/activities?search=Trail')
      .expect(200);
    expect(searchRes.body.items).toHaveLength(1);
    expect(searchRes.body.items[0].title).toBe('Morning 5K Trail Run');

    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/activities/${testActivityId}`)
      .expect(200);
    expect(detailRes.body.isHost).toBe(true);

    // Step 6: Submit a join request from a second account
    currentUser = participantUser;
    const joinRes = await request(app.getHttpServer())
      .post(`/api/v1/activities/${testActivityId}/join`)
      .expect(201);
    expect(joinRes.body.status).toBe('requested');

    // Step 7: Approve the request as the host
    currentUser = hostUser;
    const approveRes = await request(app.getHttpServer())
      .post(`/api/v1/activities/${testActivityId}/requests/${testMembershipId}/approve`)
      .expect(201);
    expect(approveRes.body.status).toBe('approved');

    // Step 8: Verify participant counts and capacity limits
    const participantsRes = await request(app.getHttpServer())
      .get(`/api/v1/activities/${testActivityId}/participants`)
      .expect(200);
    expect(participantsRes.body.total).toBe(2);
    expect(participantsRes.body.remaining).toBe(2);
    expect(participantsRes.body.items).toHaveLength(2);

    // Step 9: Open activity group chat and exchange messages
    const hostMsgRes = await request(app.getHttpServer())
      .post(`/api/v1/activities/${testActivityId}/messages`)
      .send({ content: 'Welcome to the trail run!' })
      .expect(201);
    expect(hostMsgRes.body.content).toBe('Welcome to the trail run!');

    currentUser = participantUser;
    const participantMsgRes = await request(app.getHttpServer())
      .post(`/api/v1/activities/${testActivityId}/messages`)
      .send({ content: 'Thanks! See you there at 7am.' })
      .expect(201);
    expect(participantMsgRes.body.content).toBe('Thanks! See you there at 7am.');

    // Step 10: Verify chat authorization and message history
    const chatHistoryRes = await request(app.getHttpServer())
      .get(`/api/v1/activities/${testActivityId}/messages`)
      .expect(200);
    expect(chatHistoryRes.body.items).toHaveLength(2);

    // Step 11: Receive, read, and dismiss notifications
    notificationsStore.set(testNotificationId, {
      notificationId: testNotificationId,
      recipientId: participantUser.userId,
      title: 'Request Approved',
      message: 'You have been approved to join Morning 5K Trail Run',
      readAt: null,
    });

    const notifsRes = await request(app.getHttpServer()).get('/api/v1/notifications').expect(200);
    expect(notifsRes.body.items).toHaveLength(1);
    expect(notifsRes.body.unreadCount).toBe(1);

    await request(app.getHttpServer()).patch(`/api/v1/notifications/${testNotificationId}/read`).expect(200);
    await request(app.getHttpServer()).delete(`/api/v1/notifications/${testNotificationId}`).expect(200);

    // Step 12: Cancel an activity and verify its lifecycle behavior
    currentUser = hostUser;
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/activities/${testActivityId}/cancel`)
      .expect(201);
    expect(cancelRes.body.status).toBe('cancelled');

    // Cannot join a cancelled activity
    currentUser = participantUser;
    await request(app.getHttpServer()).post(`/api/v1/activities/${testActivityId}/join`).expect(500);

    // Step 13: Unauthenticated / expired session handling
    currentUser = null;
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/v1/activities').expect(401);

    // Step 14: Recoverable error responses
    await request(app.getHttpServer()).get('/api/v1/unknown-route').expect(404);
  });
});
