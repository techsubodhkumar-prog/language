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

  afterEach(async () => {
    await app.close();
  });
});
