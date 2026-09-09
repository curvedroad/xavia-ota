import { DatabaseFactory } from '../apiUtils/database/DatabaseFactory';
import { NoUpdateAvailableError, UpdateHelper } from '../apiUtils/helpers/UpdateHelper';
import { StorageFactory } from '../apiUtils/storage/StorageFactory';

jest.mock('../apiUtils/database/DatabaseFactory');
jest.mock('../apiUtils/storage/StorageFactory');

describe('update release selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects only a database-registered release that exists in storage', async () => {
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue({
        path: 'updates/1.0.0/20260909000000.zip',
      }),
    });
    const fileExists = jest.fn().mockResolvedValue(true);
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({ fileExists });

    await expect(
      UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync('1.0.0')
    ).resolves.toBe('updates/1.0.0/20260909000000');
    expect(fileExists).toHaveBeenCalledWith('updates/1.0.0/20260909000000.zip');
  });

  it('does not inspect storage when the database has no release', async () => {
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue(null),
    });

    await expect(
      UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync('1.0.0')
    ).rejects.toBeInstanceOf(NoUpdateAvailableError);
    expect(StorageFactory.getStorage).not.toHaveBeenCalled();
  });

  it('fails closed when the registered release object is missing', async () => {
    (DatabaseFactory.getDatabase as jest.Mock).mockReturnValue({
      getLatestReleaseRecordForRuntimeVersion: jest.fn().mockResolvedValue({
        path: 'updates/1.0.0/missing.zip',
      }),
    });
    (StorageFactory.getStorage as jest.Mock).mockReturnValue({
      fileExists: jest.fn().mockResolvedValue(false),
    });

    await expect(
      UpdateHelper.getLatestUpdateBundlePathForRuntimeVersionAsync('1.0.0')
    ).rejects.toThrow('Release file is missing');
  });
});
