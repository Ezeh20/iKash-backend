import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UploadFileInput } from './file-storage/file-storage.service';

describe('UsersController', () => {
  let controller: UsersController;
  let mockUsersService: any;

  beforeEach(async () => {
    mockUsersService = {
      uploadProfilePicture: jest.fn(),
      findByPublicKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('uploadProfilePicture', () => {
    const mockRequest = (userId: string, publicKey?: string) =>
      ({
        user: { userId, publicKey: publicKey ?? 'G' + userId },
      }) as any;

    const mockFile: UploadFileInput = {
      originalname: 'test.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('test'),
    };

    it('should successfully upload profile picture', async () => {
      const expectedResponse = { userId: 'user-1', profileImageUrl: 'http://url' };
      mockUsersService.uploadProfilePicture.mockResolvedValue(expectedResponse);

      const result = await controller.uploadProfilePicture(
        'user-1',
        mockRequest('user-1'),
        undefined,
        mockFile,
      );

      expect(result).toEqual(expectedResponse);
      expect(mockUsersService.uploadProfilePicture).toHaveBeenCalledWith('user-1', mockFile, undefined);
    });

    it('should throw ForbiddenException if user tries to update another users profile', async () => {
      mockUsersService.findByPublicKey.mockResolvedValue(null);

      await expect(
        controller.uploadProfilePicture('user-1', mockRequest('user-2'), undefined, mockFile),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if no file is provided', async () => {
      await expect(
        controller.uploadProfilePicture('user-1', mockRequest('user-1'), undefined, undefined as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if file is not an allowed image type', async () => {
      const invalidFile = { ...mockFile, mimetype: 'application/pdf' };

      await expect(
        controller.uploadProfilePicture('user-1', mockRequest('user-1'), undefined, invalidFile),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if file is too large', async () => {
      const hugeFile = { ...mockFile, size: 10 * 1024 * 1024 }; // 10MB

      await expect(
        controller.uploadProfilePicture('user-1', mockRequest('user-1'), undefined, hugeFile),
      ).rejects.toThrow(BadRequestException);
    });

    it('should parse userSnapshot JSON correctly', async () => {
      mockUsersService.uploadProfilePicture.mockResolvedValue({});

      await controller.uploadProfilePicture(
        'user-1',
        mockRequest('user-1'),
        '{"alias":"newalias"}',
        mockFile,
      );

      expect(mockUsersService.uploadProfilePicture).toHaveBeenCalledWith(
        'user-1',
        mockFile,
        { alias: 'newalias' },
      );
    });

    it('should throw BadRequestException if userSnapshot is invalid JSON', async () => {
      await expect(
        controller.uploadProfilePicture(
          'user-1',
          mockRequest('user-1'),
          'invalid-json',
          mockFile,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
