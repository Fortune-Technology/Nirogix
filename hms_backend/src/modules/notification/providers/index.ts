import { env } from '../../../config/env';
import type { EmailProvider, SmsProvider } from './types';
import { LogEmailProvider, LogSmsProvider } from './logProvider';
import { Msg91EmailProvider, Msg91SmsProvider } from './msg91Provider';

// Provider selection by configuration: MSG91 when a key is present, otherwise the dev log
// provider. The rest of the app depends only on the EmailProvider/SmsProvider interfaces.
export function getEmailProvider(): EmailProvider {
  return env.MSG91_API_KEY ? new Msg91EmailProvider() : new LogEmailProvider();
}

export function getSmsProvider(): SmsProvider {
  return env.MSG91_API_KEY ? new Msg91SmsProvider() : new LogSmsProvider();
}

export * from './types';
