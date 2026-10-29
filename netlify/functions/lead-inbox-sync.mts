import type { Config } from '@netlify/functions';
import { synchronizeLeads, notifyInboxWorkerFailure } from './lead-inbox.mts';

// Production scheduled functions cannot be invoked through a public URL.
// Continue draining even if new inbox admissions are disabled for rollback.
export default async () => {
  try {
    const result=await synchronizeLeads();
    console.log('Lead inbox synchronization',result);
    return new Response(null,{status:204});
  } catch {
    console.error('Lead inbox synchronization interrupted; durable records retained for the next run');
    await notifyInboxWorkerFailure();
    return new Response(null,{status:503});
  }
};
export const config:Config={schedule:'* * * * *'};
