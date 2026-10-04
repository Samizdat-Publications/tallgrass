// Worker-thread entry for batch.ts: registers tsx inside the worker, then loads the real worker. On some Node
// versions (22.x on Linux) the tsx loader inherited through execArgv does not resolve extensionless imports in
// worker threads, so the batch's workers died at startup with ERR_MODULE_NOT_FOUND.
import { register } from 'tsx/esm/api';

register();
await import('./batchWorker.ts');
