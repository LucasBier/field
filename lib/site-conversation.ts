import { eventData } from './event-stream';
import { HOSTED_MESSAGES } from './hosted-config';
export async function siteConversation(
  id: string,
  message: string,
  revision: number,
  signal: AbortSignal,
  onText: (text: string) => void,
) {
  let accepted = false,
    uncertain = true;
  try {
    const response = await fetch('/api/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, message, revision }),
      signal,
    });
    uncertain = false;
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      throw new Error(data.error || HOSTED_MESSAGES.provider);
    }
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      const data = (await response.json()) as { status?: string };
      if (data.status === 'completed') return;
      throw new Error(
        data.status === 'running'
          ? HOSTED_MESSAGES.busy
          : HOSTED_MESSAGES.cancelled,
      );
    }
    accepted = true;
    if (!response.body) throw new Error(HOSTED_MESSAGES.invalid_response);
    let ended = false;
    for await (const data of eventData(response.body, signal)) {
      const event = JSON.parse(data);
      if (event.type === 'text') {
        if (typeof event.text !== 'string' || event.text.length > 6000)
          throw new Error(HOSTED_MESSAGES.invalid_response);
        onText(event.text);
      } else if (
        event.type === 'done' &&
        event.id === id &&
        event.status === 'completed'
      ) {
        ended = true;
        break;
      } else if (event.type === 'error')
        throw new Error(
          typeof event.message === 'string'
            ? event.message
            : HOSTED_MESSAGES.provider,
        );
    }
    if (!ended) throw new Error(HOSTED_MESSAGES.storage);
  } catch (error) {
    if (accepted || uncertain) {
      try {
        const stop = await fetch(
          `/api/companion?id=${encodeURIComponent(id)}`,
          { method: 'DELETE', signal: AbortSignal.timeout(10000) },
        );
        if (!stop.ok) throw new Error(HOSTED_MESSAGES.storage);
        const final = (await stop.json()) as { status?: string };
        if (final.status === 'completed') return;
      } catch {
        throw new Error(HOSTED_MESSAGES.storage);
      }
    }
    throw signal.aborted ? new Error(HOSTED_MESSAGES.cancelled) : error;
  }
}
