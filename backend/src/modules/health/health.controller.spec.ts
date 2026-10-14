import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { DatabaseService } from '../../database/database.service.js';
import { ServiceUnavailableException } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let isHealthyMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    isHealthyMock = vi.fn().mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseService,
          useValue: {
            isHealthy: isHealthyMock,
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return liveness health status ok', () => {
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('activity-discovery-api');
    expect(result.version).toBe('1.0.0');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.uptimeSeconds).toBe('number');
  });

  it('should return readiness status connected when database is healthy', async () => {
    const result = await controller.getReadiness();
    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(typeof result.timestamp).toBe('string');
    expect(isHealthyMock).toHaveBeenCalled();
  });

  it('should throw ServiceUnavailableException when database is disconnected', async () => {
    isHealthyMock.mockResolvedValue(false);
    await expect(controller.getReadiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
