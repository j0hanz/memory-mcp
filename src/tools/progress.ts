import type {
  CallToolResult,
  ProgressNotification,
} from '@modelcontextprotocol/sdk/types.js';

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
  return {
    progressToken,
    progress: progress.current,
    ...(progress.total !== undefined ? { total: progress.total } : {}),
    ...(progress.message !== undefined ? { message: progress.message } : {}),
  };
}

function isFailedResult(result: CallToolResult): boolean {
  if (result.isError) {
    return true;
  }

  if (
    typeof result.structuredContent === 'object' &&
    'ok' in result.structuredContent
  ) {
    return result.structuredContent.ok === false;
  }

  return false;
}

function defaultCompletionMessage(
  startMessage: string,
  result: CallToolResult
): string {
  return `${startMessage} • ${isFailedResult(result) ? 'failed' : 'completed'}`;
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
): (progress: ProgressUpdate) => void {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
  let lastCurrent = 0;
  let lastReportedAt = 0;
  let isCompleted = false;

  return (progress: ProgressUpdate): void => {
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

    void notifyProgress(extra, {
      current: monotonicCurrent,
      ...(progress.total !== undefined ? { total: progress.total } : {}),
      ...(progress.message !== undefined ? { message: progress.message } : {}),
    });
  };
}

export function progressWithMessage(
  reporter: (progress: ProgressUpdate) => void,
  getMessage: (progress: { current: number; total?: number }) => string
): (progress: { current: number; total?: number }) => void {
  return ({ current, total }): void => {
    const message = getMessage({
      current,
      ...(total !== undefined ? { total } : {}),
    });
    reporter({
      current,
      ...(total !== undefined ? { total } : {}),
      message,
    });
  };
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
      await notifyProgress(extra, {
        current: 1,
        total: 1,
        message: `${startMessage} • failed`,
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
