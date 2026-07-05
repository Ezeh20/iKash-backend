import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GcsFileStorageService } from './gcs-file-storage.service';

jest.mock('@google-cloud/storage', () => {
  return {
    Storage: jest.fn().mockImplementation(() => ({
      bucket: jest.fn().mockReturnValue({
        exists: jest.fn().mockResolvedValue([true]),
        create: jest.fn().mockResolvedValue([{}]),
        file: jest.fn().mockReturnValue({
          save: jest.fn().mockResolvedValue(undefined),
        }),
      }),
    })),
  };
});

describe('GcsFileStorageService', () => {
  let service: GcsFileStorageService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcsFileStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key, defaultValue) => {
              if (key === 'GCS_BUCKET_NAME') return 'test-bucket';
              if (key === 'STORAGE_ENDPOINT') return 'http://localhost:4443';
              if (key === 'GCS_PROJECT_ID') return 'test-project';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GcsFileStorageService>(GcsFileStorageService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should create bucket if it does not exist', async () => {
      const bucket = (service as any).bucket;
      bucket.exists.mockResolvedValueOnce([false]);

      await service.onModuleInit();

      expect(bucket.exists).toHaveBeenCalled();
      expect(bucket.create).toHaveBeenCalled();
    });

    it('should not create bucket if it already exists', async () => {
      const bucket = (service as any).bucket;
      bucket.exists.mockResolvedValueOnce([true]);
      bucket.create.mockClear();

      await service.onModuleInit();

      expect(bucket.exists).toHaveBeenCalled();
      expect(bucket.create).not.toHaveBeenCalled();
    });
  });

  describe('uploadFile', () => {
    it('should successfully upload a file and return StoredFile interface', async () => {
      const mockFile = {
        originalname: 'test-image.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('mock-data'),
      };

      const result = await service.uploadFile(mockFile);

      expect(result).toHaveProperty('key');
      expect(result).toHaveProperty('url');
      expect(result.url).toContain('http://localhost:4443/test-bucket/profile-images/');
      expect(result.key).toContain('test-image.png');

      const fileMock = (service as any).bucket.file();
      expect(fileMock.save).toHaveBeenCalledWith(mockFile.buffer, {
        contentType: 'image/png',
        resumable: false,
      });
    });

    it('should handle special characters in filename', async () => {
      const mockFile = {
        originalname: 'my_TEST@image!.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('mock-data'),
      };

      const result = await service.uploadFile(mockFile);
      expect(result.key).toContain('my-test-image-.jpg');
    });
  });
});
