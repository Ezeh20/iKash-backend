export interface StoredFile {
  key: string;
  url: string;
}

export interface UploadFileInput {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export abstract class FileStorageService {
  abstract uploadFile(file: UploadFileInput): Promise<StoredFile>;
}
