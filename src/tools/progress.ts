import type {
  CallToolResult,
  ProgressNotification,
} from '@modelcontextprotocol/sdk/types.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

import {
  E_CANCELLED,
  E_UNKNOWN,
  getErrorMessage,
  rethrowMcpError,
} from '../lib/errors.js';
import { createErrorResponse } from '../lib/tool-response.js';
import { getToolResultText } from './result.js';

type ProgressToken = string | number;

interface ProgressMeta {
  progressToken?: unknown;
}

export interface ProgressContext {
  _meta?: ProgressMeta;
  signal?: AbortSignal;
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

interface CompletionRunOptions {
  reporter: Pick<ProgressReporter, 'flush'>;
  completionCurrent: number | (() => number);
  completionMessage: (result: CallToolResult) => string;
}

function resolveCompletionCurrent(
  value: CompletionRunOptions['completionCurrent']
): number {
  return typeof value === 'function' ? value() : value;
}

type ToolHandler<TArgs> = (
  args: TArgs,
  extra: ProgressContext
) => Promise<CallToolResult> | CallToolResult;

const DEFAULT_PROGRESS_INTERVAL_MS = 250;
const TOOL_HANDLER_PROGRESS_TOTAL = 1;

function hasProgressTransport(
  extra: ProgressContext,
  progressToken: ProgressToken | undefined
): extra is ProgressContext & {
  sendNotification: (notification: ProgressNotification) => Promise<void>;
} {
  return (
    progressToken !== undefined && typeof extra.sendNotification === 'function'
  );
}

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

function toProgressNotification(
  progressToken: ProgressToken,
  progress: ProgressUpdate
): ProgressNotification {
  return {
    method: 'notifications/progress',
    params: toNotificationParams(progressToken, progress),
  };
}

function toProgressPayload(
  progress: ProgressUpdate,
  current: number
): ProgressUpdate {
  return {
    current,
    ...(progress.total !== undefined ? { total: progress.total } : {}),
    ...(progress.message !== undefined ? { message: progress.message } : {}),
  };
}

function getResultOutcome(
  result: CallToolResult
): 'completed' | 'failed' | 'cancelled' {
  if (result.isError) {
    const text = getToolResultText(result);
    if (text.includes(E_CANCELLED)) {
      return 'cancelled';
    }
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

  if (!hasProgressTransport(extra, progressToken)) {
    return;
  }

  try {
    await extra.sendNotification(
      toProgressNotification(progressToken, progress)
    );
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

    const payload = toProgressPayload(progress, monotonicCurrent);

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
  const notifyTerminalProgress = async (
    extra: ProgressContext,
    startMessage: string,
    outcome: 'cancelled' | 'failed' | 'completed',
    completionMessage?: string
  ): Promise<void> => {
    await notifyProgress(extra, {
      current: TOOL_HANDLER_PROGRESS_TOTAL,
      total: TOOL_HANDLER_PROGRESS_TOTAL,
      message: completionMessage ?? `${startMessage} • ${outcome}`,
    });
  };

  return async (
    args: TArgs,
    extra: ProgressContext
  ): Promise<CallToolResult> => {
    const startMessage = options.progressMessage(args);
    await notifyProgress(extra, {
      current: 0,
      total: TOOL_HANDLER_PROGRESS_TOTAL,
      message: startMessage,
    });

    let result: CallToolResult;
    try {
      result = await handler(args, extra);
    } catch (error) {
      const isCancelled =
        error instanceof Error && error.message === E_CANCELLED;
      await notifyTerminalProgress(
        extra,
        startMessage,
        isCancelled ? 'cancelled' : 'failed'
      );
      throw error;
    }

    const completionMessage =
      options.completionMessage?.(args, result) ??
      defaultCompletionMessage(startMessage, result);

    await notifyTerminalProgress(
      extra,
      startMessage,
      'completed',
      completionMessage
    );

    return result;
  };
}

export async function runWithProgressCompletion(
  extra: ProgressContext,
  run: () => CallToolResult | Promise<CallToolResult>,
  options: CompletionRunOptions
): Promise<CallToolResult> {
  let result: CallToolResult | undefined;
  let thrownError: McpError | undefined;

  try {
    result = await run();
  } catch (error) {
    if (error instanceof Error && error.message === E_CANCELLED) {
      result = createErrorResponse(E_CANCELLED, 'Request cancelled');
    } else if (error instanceof McpError) {
      thrownError = error;
    } else {
      rethrowMcpError(error);
      result = createErrorResponse(E_UNKNOWN, getErrorMessage(error));
    }
  }

  await options.reporter.flush();

  const completionResult =
    result ?? createErrorResponse(E_UNKNOWN, getErrorMessage(thrownError));

  const completionCurrent = resolveCompletionCurrent(options.completionCurrent);

  await notifyProgress(extra, {
    current: completionCurrent,
    total: completionCurrent,
    message: options.completionMessage(completionResult),
  });

  if (thrownError) {
    throw thrownError;
  }

  return completionResult;
}
