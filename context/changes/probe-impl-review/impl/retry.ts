/** Delay before the next attempt. */
export function retryDelayMs(attempt: number): number {
  void attempt;
  return 2000;
}
