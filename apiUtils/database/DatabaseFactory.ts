import { DatabaseInterface } from './DatabaseInterface';
import { PostgresDatabase } from './LocalDatabase';

export enum Tables {
  RELEASES = 'releases',
  RELEASES_TRACKING = 'releases_tracking',
  API_KEYS = 'ota_api_keys',
  AUDIT_LOGS = 'ota_audit_logs',
}

export class DatabaseFactory {
  private static instance: DatabaseInterface;

  static getDatabase(): DatabaseInterface {
    if (process.env.DB_TYPE !== 'postgres') {
      throw new Error('Unsupported database type');
    }

    if (!DatabaseFactory.instance) {
      DatabaseFactory.instance = new PostgresDatabase();
    }

    return DatabaseFactory.instance;
  }

  static resetForTests(): void {
    DatabaseFactory.instance = undefined as unknown as DatabaseInterface;
  }
}
