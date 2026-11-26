import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Starts an isolated ephemeral MongoDB instance using mongodb-memory-server.
 * Cleans up temporary data files on Windows via stop({ doCleanup: true }).
 */
export async function startMongo({ dbName = 'niyantran_e2e' } = {}) {
  const instance = await MongoMemoryServer.create({
    instance: {
      dbName,
    },
  });

  const baseUri = instance.getUri();
  // Ensure the URI explicitly targets dbName without double slashes
  const uri = baseUri.endsWith('/') ? `${baseUri}${dbName}` : `${baseUri}/${dbName}`;

  let stopped = false;

  return {
    instance,
    uri,
    dbName,
    async stop() {
      if (stopped) return;
      stopped = true;
      await instance.stop({ doCleanup: true, force: true });
    },
  };
}
