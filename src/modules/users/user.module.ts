import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { AuthModule } from '../auth/auth.module';
import { FileStorageService } from './file-storage/file-storage.service';
import { MockFileStorageService } from './file-storage/mock-file-storage.service';
import { GcsFileStorageService } from './file-storage/gcs-file-storage.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersRepository,
    {
      provide: FileStorageService,
      useFactory: (configService: ConfigService) => {
        const provider = configService.get<string>('STORAGE_PROVIDER', 'mock');
        if (provider === 'gcs') {
          return new GcsFileStorageService(configService);
        }
        return new MockFileStorageService();
      },
      inject: [ConfigService],
    },
  ],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
