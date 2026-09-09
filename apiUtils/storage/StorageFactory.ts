import { LocalStorage } from './LocalStorage';
import { StorageInterface } from './StorageInterface';
import { S3Storage } from './S3Storage';
import { getLogger } from '../logger';

const logger = getLogger('StorageFactory');

export class StorageFactory {
  private static instance: StorageInterface;

  static getStorage(): StorageInterface {
    if (!StorageFactory.instance) {
      const storageType = process.env.BLOB_STORAGE_TYPE;
      if (storageType === 'local') {
        StorageFactory.instance = new LocalStorage();
      } else if (storageType === 's3') {
        StorageFactory.instance = new S3Storage();
      } else {
        logger.error('Unsupported storage type', { storageType });
        throw new Error('Unsupported storage type');
      }
    }
    return StorageFactory.instance;
  }

  static resetForTests(): void {
    StorageFactory.instance = undefined as unknown as StorageInterface;
  }
}
