/**
 * Where messages come from.
 *
 * THIS IS THE STAGE 2 SEAM. Everything downstream — normalizer, classifier,
 * parser, repositories, screens — consumes `IncomingMessage` and neither knows
 * nor cares how it arrived.
 *
 * Stage 1 ships `ManualSmsSource` only: the user pastes text. Stage 2 adds
 * `AndroidSmsSource` (BroadcastReceiver + native module, Expo Dev Build)
 * implementing this same interface. No native SMS code exists yet and none is
 * stubbed out to look as if it does.
 */

export interface IncomingMessage {
  /** Raw message text, exactly as received. */
  text: string;
  /** Sender id where known — a shortcode, not a contact name. */
  sender?: string;
  /** ISO timestamp of receipt. */
  receivedAt: string;
}

export type MessageListener = (message: IncomingMessage) => void;

export interface SmsSource {
  readonly id: string;
  /** True once `start()` has been called and not yet stopped. */
  readonly isRunning: boolean;

  start(): Promise<void>;
  stop(): Promise<void>;

  /** Subscribe to messages. Returns an unsubscribe function. */
  subscribe(listener: MessageListener): () => void;
}
