type CreateStreamReplyAccumulatorInput = {
  onFlush(reply: string): void;
  flushDelayMs?: number;
};

export function createStreamReplyAccumulator(
  input: CreateStreamReplyAccumulatorInput,
) {
  let reply = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flushDelayMs = input.flushDelayMs ?? 16;

  const flush = () => {
    timer = null;
    input.onFlush(reply);
  };

  return {
    push(content: string) {
      reply += content;

      if (timer) {
        return;
      }

      timer = setTimeout(flush, flushDelayMs);
    },
    finalize() {
      if (timer) {
        clearTimeout(timer);
      }

      flush();
    },
    getReply() {
      return reply;
    },
  };
}
