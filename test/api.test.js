import { TestContext } from "./TestContext.js";
import { api_exec } from "./api_exec.js";
import { api_misc } from "./api_misc.js";
import { api_session } from "./api_session.js";
import { api_statements } from "./api_statements.js";

const ALL_BUILDS = ['default', 'asyncify'];
const ASYNC_BUILDS = ['asyncify'];

const supportsJSPI = await TestContext.supportsJSPI();
if (supportsJSPI) {
  ALL_BUILDS.push('jspi');
  ASYNC_BUILDS.push('jspi');
}

/** @type {Map<string, string[]>} */
const CONFIGS = new Map([
  ['', ALL_BUILDS],
  ['MemoryVFS', ALL_BUILDS],
  ['AccessHandlePoolVFS', ALL_BUILDS],
  ['OPFSCoopSyncVFS', ALL_BUILDS],
  ['MemoryAsyncVFS', ASYNC_BUILDS],
  ['IDBBatchAtomicVFS', ASYNC_BUILDS],
  ['IDBMirrorVFS', ASYNC_BUILDS],
  ['OPFSAdaptiveVFS', ASYNC_BUILDS],
  ['OPFSAnyContextVFS', ASYNC_BUILDS],
  ['OPFSWriteAheadVFS', ASYNC_BUILDS],
]);

// The session API calls into SQLite synchronously, so it cannot unwind through
// an asynchronous VFS. On one it silently yields an empty changeset and leaves
// the connection unusable, so only exercise it on the synchronous VFS configs.
const SYNC_CONFIGS = new Set(['', 'MemoryVFS', 'AccessHandlePoolVFS', 'OPFSCoopSyncVFS']);

describe('SQLite API', function() {
  for (const [config, builds] of CONFIGS) {
    describe(config, function() {
      for (const build of builds) {
        describe(build, function() {
          apiSpecs(build, config);
        });
      }
    });
  }
});

function apiSpecs(build, config) {
  const context = new TestContext({ build, config });

  describe(`SQLite ${build} ${config}`, function() {
    api_exec(context);
    api_misc(context);
    if (SYNC_CONFIGS.has(config)) {
      api_session(context);
    }
    api_statements(context);
  });
}
