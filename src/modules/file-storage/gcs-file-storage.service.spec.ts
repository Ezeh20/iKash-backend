import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GcsFileStorageService } from './gcs-file-storage.service';

interface MockSaveFn {
  save: (
    buffer: Buffer,
    options: { contentType: string; resumable: boolean },
  ) => Promise<void>;
}

interface MockBucket {
  exists: () => Promise<[boolean]>;
  create: () => Promise<[Record<string, unknown>]>;
  file: (name?: string) => MockSaveFn;
}

jest.mock('@google-cloud/storage', () => {
  const saveFn: MockSaveFn['save'] = jest.fn() as unknown as MockSaveFn['save'];

  return {
    Storage: jest.fn().mockImplementation(() => ({
      bucket: jest.fn().mockReturnValue({
        exists: jest.fn().mockResolvedValue([true]),
        create: jest.fn().mockResolvedValue([{}]),
        file: jest.fn().mockImplementation(() => ({ save: saveFn })),
      }),
    })),
  };
});

describe('GcsFileStorageService', () => {
  let service: GcsFileStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcsFileStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation(
              (key: string, defaultValue?: string) =>
                ({
                  GCS_BUCKET_NAME: 'test-bucket',
                  STORAGE_ENDPOINT: 'http://localhost:4443',
                  GCS_PROJECT_ID: 'test-project',
                })[key] ?? defaultValue,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<GcsFileStorageService>(GcsFileStorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should create bucket if it does not exist', async () => {
      const bucket = (service as unknown as { bucket: MockBucket }).bucket;
      bucket.exists = jest.fn().mockResolvedValue([false]);

      await service.onModuleInit();

      expect(bucket.exists).toHaveBeenCalled();
      expect(bucket.create).toHaveBeenCalled();
    });

    it('should not create bucket if it already exists', async () => {
      const bucket = (service as unknown as { bucket: MockBucket }).bucket;
      jest.clearAllMocks();

      await service.onModuleInit();

      expect(bucket.exists).toHaveBeenCalled();
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
      expect(result.url).toContain(
        'http://localhost:4443/test-bucket/profile-images/',
      );
      expect(result.key).toContain('test-image.png');

      const bucket = (service as unknown as { bucket: MockBucket }).bucket;
      const blob = bucket.file();
      expect(blob.save).toHaveBeenCalledWith(mockFile.buffer, {
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
