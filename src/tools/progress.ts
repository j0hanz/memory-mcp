import type {
  CallToolResult,
  ProgressNotification,
} from '@modelcontextprotocol/sdk/types.js';

import { E_CANCELLED } from '../lib/errors.js';

type ProgressToken = string | number;

interface ProgressMeta {
  progressToken?: unknown;
}

interface ProgressContext {
  _meta?: ProgressMeta;
  sendNotification?: (notification: ProgressNotification) => Promise<void>;
}

interface ProgressUpdate {
  current: number;
  total?: number;
  message?: string;
}

interface ProgressReporterOptions {
  minIntervalMs?: number;
}

interface ProgressSnapshot {
  current: number;
  total?: number;
}

export type ProgressReporter<
  TProgress extends ProgressSnapshot = ProgressUpdate,
> = ((progress: TProgress) => void) & {
  flush: () => Promise<void>;
};

interface WrappedHandlerOptions<TArgs> {
  completionMessage?: (args: TArgs, result: CallToolResult) => string;
  progressMessage: (args: TArgs) => string;
}

type ToolHandler<TArgs> = (
  args: TArgs,
  extra: ProgressContext
) => Promise<CallToolResult> | CallToolResult;

const DEFAULT_PROGRESS_INTERVAL_MS = 250;

function toProgressToken(value: unknown): ProgressToken | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }

  return undefined;
}

function toNotificationParams(
  progressToken: ProgressToken,
  progress: ProgressUpdate
): ProgressNotification['params'] {
  const params: ProgressNotification['params'] = {
    progressToken,
    progress: progress.current,
  };

  if (progress.total !== undefined) {
    params.total = progress.total;
  }

  if (progress.message !== undefined) {
    params.message = progress.message;
  }

  return params;
}

function getResultOutcome(
  result: CallToolResult
): 'completed' | 'failed' | 'cancelled' {
  if (result.structuredContent?.error) {
    const error = result.structuredContent.error as { code?: string };
    if (error.code === E_CANCELLED) {
      return 'cancelled';
    }
  }

  if (result.isError) {
    return 'failed';
  }

  if (result.structuredContent?.ok === false) {
    return 'failed';
  }

  return 'completed';
}

function defaultCompletionMessage(
  startMessage: string,
  result: CallToolResult
): string {
  return `${startMessage} • ${getResultOutcome(result)}`;
}

export async function notifyProgress(
  extra: ProgressContext,
  progress: ProgressUpdate
): Promise<void> {
  const progressToken = toProgressToken(extra._meta?.progressToken);
  if (progressToken === undefined) {
    return;
  }

  if (typeof extra.sendNotification !== 'function') {
    return;
  }

  try {
    await extra.sendNotification({
      method: 'notifications/progress',
      params: toNotificationParams(progressToken, progress),
    });
  } catch {
    // best-effort progress
  }
}

export function createProgressReporter(
  extra: ProgressContext,
  options: ProgressReporterOptions = {}
): ProgressReporter {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
  let lastCurrent = 0;
  let lastReportedAt = 0;
  let isCompleted = false;
  let notificationChain: Promise<void> = Promise.resolve();

  const reporter = ((progress: ProgressUpdate): void => {
    if (isCompleted) {
      return;
    }

    const monotonicCurrent =
      progress.current >= lastCurrent ? progress.current : lastCurrent;
    const now = Date.now();
    const shouldFlush =
      now - lastReportedAt >= minIntervalMs ||
      (progress.total !== undefined && monotonicCurrent >= progress.total);

    lastCurrent = monotonicCurrent;

    if (!shouldFlush) {
      return;
    }

    lastReportedAt = now;
    isCompleted =
      progress.total !== undefined && monotonicCurrent >= progress.total;

    const payload: ProgressUpdate = { current: monotonicCurrent };
    if (progress.total !== undefined) {
      payload.total = progress.total;
    }
    if (progress.message !== undefined) {
      payload.message = progress.message;
    }

    notificationChain = notificationChain.then(() =>
      notifyProgress(extra, payload)
    );
  }) as ProgressReporter;

  reporter.flush = async (): Promise<void> => {
    await notificationChain;
  };

  return reporter;
}

export function progressWithMessage(
  reporter: ProgressReporter,
  getMessage: (progress: ProgressSnapshot) => string
): ProgressReporter<ProgressSnapshot> {
  const wrapped = (({ current, total }: ProgressSnapshot): void => {
    const message = getMessage(
      total === undefined ? { current } : { current, total }
    );
    reporter({
      current,
      ...(total === undefined ? {} : { total }),
      message,
    });
  }) as ProgressReporter<ProgressSnapshot>;

  wrapped.flush = (): Promise<void> => reporter.flush();

  return wrapped;
}

export function wrapToolHandler<TArgs>(
  handler: ToolHandler<TArgs>,
  options: WrappedHandlerOptions<TArgs>
): ToolHandler<TArgs> {
  return async (
    args: TArgs,
    extra: ProgressContext
  ): Promise<CallToolResult> => {
    const startMessage = options.progressMessage(args);
    await notifyProgress(extra, {
      current: 0,
      total: 1,
      message: startMessage,
    });

    let result: CallToolResult;
    try {
      result = await handler(args, extra);
    } catch (error) {
      const isCancelled =
        error instanceof Error && error.message === E_CANCELLED;
      await notifyProgress(extra, {
        current: 1,
        total: 1,
        message: `${startMessage} • ${isCancelled ? 'cancelled' : 'failed'}`,
      });
      throw error;
    }

    const completionMessage =
      options.completionMessage?.(args, result) ??
      defaultCompletionMessage(startMessage, result);

    await notifyProgress(extra, {
      current: 1,
      total: 1,
      message: completionMessage,
    });

    return result;
  };
}
