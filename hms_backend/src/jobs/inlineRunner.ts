import { logger } from '../config/logger';
import type { JobRunner, JobProcessor } from './runner';
import type { JobName, JobDataMap } from './types';

// Dev/CI fallback: runs jobs in-process (no Redis). Fire-and-forget with error logging so the same
// call sites work whether or not a queue is configured. `delaySeconds` uses a timer.
export class InlineJobRunner implements JobRunner {
  private processors = new Map<string, (data: unknown) => Promise<void>>();

  registerProcessor<K extends JobName>(name: K, processor: JobProcessor<K>): void {
    this.processors.set(name, processor as (d: unknown) => Promise<void>);
  }

  async enqueue<K extends JobName>(
    name: K,
    data: JobDataMap[K],
    opts?: { delaySeconds?: number },
  ): Promise<void> {
    const processor = this.processors.get(name);
    if (!processor) {
      logger.warn({ job: name }, 'No processor registered (inline)');
      return;
    }
    const run = () =>
      processor(data).catch((err) => logger.error({ err, job: name }, 'Inline job failed'));
    if (opts?.delaySeconds) {
      const t = setTimeout(run, opts.delaySeconds * 1000);
      t.unref?.();
    } else {
      setImmediate(run);
    }
  }

  async close(): Promise<void> {}
}
