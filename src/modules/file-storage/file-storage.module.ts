import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStorageService } from './file-storage.service';
import { MockFileStorageService } from './mock-file-storage.service';
import { GcsFileStorageService } from './gcs-file-storage.service';

@Module({
  providers: [
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
  exports: [FileStorageService],
})
export class FileStorageModule {}
