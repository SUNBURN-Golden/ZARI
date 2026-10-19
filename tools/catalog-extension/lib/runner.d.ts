export interface JobEnv {
  collect(url: string, kind: string): Promise<any>;
  now(): number;
}
export function handleJob(job: { id: string; kind: string; url: string }, env: JobEnv): Promise<Record<string, unknown> & { type: string }>;
