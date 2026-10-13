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

  afterEach(async () => {
    await app.close();
  });
});
