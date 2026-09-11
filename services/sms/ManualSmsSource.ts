/**
 * The Stage 1 source: messages the user pastes in.
 *
 * There is no interception, no permission and no background work — `submit()`
 * is called by the Parser Lab when the user taps Analyze. `start()`/`stop()`
 * exist to satisfy the interface and to make the Stage 2 swap a one-line
 * change at the composition root.
 */
import type { IncomingMessage, MessageListener, SmsSource } from './SmsSource';

export class ManualSmsSource implements SmsSource {
  readonly id = 'manual';

  #running = false;
  #listeners = new Set<MessageListener>();

  get isRunning(): boolean {
    return this.#running;
  }

  start(): Promise<void> {
    this.#running = true;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.#running = false;
    this.#listeners.clear();
    return Promise.resolve();
  }

  subscribe(listener: MessageListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Hand a pasted message to subscribers.
   *
   * A listener that throws must not stop the others from being called, nor
   * bring down the screen that submitted.
   */
  submit(message: IncomingMessage): void {
    if (!this.#running) {
      throw new Error('ManualSmsSource.submit called before start()');
    }

    for (const listener of this.#listeners) {
      try {
        listener(message);
      } catch {
        // Swallowed deliberately: one bad subscriber should not break delivery.
      }
    }
  }
}
