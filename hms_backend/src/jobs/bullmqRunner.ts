import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../config/logger';
import type { JobRunner, JobProcessor } from './runner';
import type { JobName, JobDataMap } from './types';

const QUEUE = 'hms';

// Production runner: Redis + BullMQ. One queue, one worker; the job name selects the processor.
// Jobs are retryable by default (3 attempts, exponential backoff) and can be scheduled via delay.
// Selected only when REDIS_URL is set, so this is dormant in dev/CI.
export class BullmqJobRunner implements JobRunner {
  private readonly connection: IORedis;
  private readonly queue: Queue;
  private readonly processors = new Map<string, (data: unknown) => Promise<void>>();
  private worker?: Worker;

  constructor(redisUrl: string) {
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE, { connection: this.connection });
  }

  registerProcessor<K extends JobName>(name: K, processor: JobProcessor<K>): void {
    this.processors.set(name, processor as (d: unknown) => Promise<void>);
    this.ensureWorker();
  }

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        const processor = this.processors.get(job.name);
        if (processor) await processor(job.data);
        else logger.warn({ job: job.name }, 'No processor registered (bullmq)');
      },
      { connection: this.connection },
    );
    this.worker.on('failed', (job, err) => logger.error({ err, job: job?.name }, 'Job failed'));
  }

  async enqueue<K extends JobName>(
    name: K,
    data: JobDataMap[K],
    opts?: { delaySeconds?: number },
  ): Promise<void> {
    await this.queue.add(name, data, {
      delay: opts?.delaySeconds ? opts.delaySeconds * 1000 : undefined,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
