import { env } from '../config/env';
import type { JobName, JobDataMap } from './types';
import { InlineJobRunner } from './inlineRunner';
import { BullmqJobRunner } from './bullmqRunner';

export type JobProcessor<K extends JobName> = (data: JobDataMap[K]) => Promise<void>;

export interface JobRunner {
  registerProcessor<K extends JobName>(name: K, processor: JobProcessor<K>): void;
  enqueue<K extends JobName>(
    name: K,
    data: JobDataMap[K],
    opts?: { delaySeconds?: number },
  ): Promise<void>;
  close(): Promise<void>;
}

let instance: JobRunner | null = null;

// One runner for the whole app: BullMQ (Redis) in real environments, inline in-process otherwise.
export function getJobRunner(): JobRunner {
  if (!instance) {
    instance = env.REDIS_URL ? new BullmqJobRunner(env.REDIS_URL) : new InlineJobRunner();
  }
  return instance;
}
