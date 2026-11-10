import { Request, RequestReturn } from './Request';
import {
  RequestId,
  Transport,
  TransportData,
  TransportDisposer,
  TransportReceiveHandler,
  TransportFailure,
  TransportSendArgs,
  TransportMeta,
} from './Transport';

// What a request the other side could not answer rejects with (civ-clone/web-renderer#470).
export class RequestFailed extends Error {
  readonly channel: string;

  constructor(channel: string, message: string) {
    super(message);

    this.name = 'RequestFailed';
    this.channel = channel;
  }
}

// How long the other side can say nothing while a request waits on it before `notAnswering` is called
//  (civ-clone/web-renderer#470). A side busy with a game answers a request once it is free, so one asked while the AI
//  players take their turns waits for them: about a second each late in a big game, and a few times that on a slow
//  device. Nothing is given up on: a reply that comes after this still resolves its request.
export const defaultSilenceTimeout = 30_000;

// How many times longer the other side is given before it has said anything at all: it may still be loading, on a slow
//  connection, and that is no reason to say it has stopped answering (civ-clone/web-renderer#871).
export const startingSilenceFactor = 4;

// What a request rejects with when its transport is disposed of while it waits, or is used after that.
export const disposedMessage = 'The transport is no longer in use.';

// The timers the silence is kept with, which a test stands in for to run one out without waiting.
export type TransportTimers = {
  set(callback: () => void, timeout: number): unknown;
  clear(handle: unknown): void;
};

export type AbstractTransportOptions = {
  timers?: TransportTimers;
  /**
   * How long the other side may say nothing while a request waits on it, in milliseconds: `defaultSilenceTimeout`
   * unless given. `null` never times it, for a side whose requests wait on a person, who may take any time at all.
   */
  silenceTimeout?: number | null;
};

const realTimers: TransportTimers = {
  set: (callback, timeout) => setTimeout(callback, timeout),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type Outstanding = {
  channel: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  // Whether a silence has been reported while this request waited: once is enough, so that a request that is never
  //  answered can't be reported again every time the other side goes quiet.
  reported: boolean;
};

export abstract class AbstractTransport<
  DataMap extends {
    [key: string]: TransportData;
  }
> implements Transport<DataMap>
{
  #nextId: RequestId = 1;
  // Each request that has been sent and not yet answered or failed, by its id.
  #outstanding: Map<RequestId, Outstanding> = new Map();
  // The channels replies are listened for on, and `requestFailed`: one listener each, for as long as the transport is
  //  in use, so that a reply that answers no waiting request is still heard, and dropped.
  #listening: Set<PropertyKey> = new Set();
  // What stops each of those listeners, for `dispose`.
  #disposers: TransportDisposer[] = [];
  #timers: TransportTimers;
  #silenceTimeout: number | null;
  // Whether the other side has said anything yet. Its silence is timed either way, from the first request
  //  (civ-clone/web-renderer#871): one that never starts says nothing, and is the one most worth hearing about. Until
  //  it has spoken it is given `startingSilenceFactor` times as long.
  #heardFrom = false;
  // The silence being timed, while a request waits that no silence has been reported for.
  #silence: unknown = undefined;
  #disposed = false;

  constructor({
    timers = realTimers,
    silenceTimeout = defaultSilenceTimeout,
  }: AbstractTransportOptions = {}) {
    this.#timers = timers;
    this.#silenceTimeout = silenceTimeout;
  }

  abstract receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  abstract receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  // How many requests are waiting for their replies.
  protected get outstanding(): number {
    return this.#outstanding.size;
  }

  // Whether the other side has sent anything yet. Until it has, an error from it means it never started.
  protected get heardFrom(): boolean {
    return this.#heardFrom;
  }

  // Each request is sent with an id of its own, which the reply echoes, so any number can be waiting on one channel at
  //  once and each gets its own reply, in whatever order they come (civ-clone/web-renderer#324, #470).
  //
  // A request the other side could not answer is answered with a `requestFailed` with its id, which rejects it, and
  //  `requestRejected` is called. A request waits for its reply however long it takes, but when the other side has
  //  said nothing at all for the silence timeout while one waits, `notAnswering` is called, once for each silence,
  //  and no more than once for each request.
  //
  // It resolves with what the request says it returns (civ-clone/web-renderer#872). A message carries one piece of
  //  data, so a request carries one argument at most: one made with more is rejected rather than sent short.
  request<RequestType extends Request>(
    request: RequestType
  ): Promise<RequestReturn<RequestType>> {
    const channel = request.channel(),
      args = request.args();

    if (this.#disposed) {
      return Promise.reject(new RequestFailed(channel, disposedMessage));
    }

    if (args.length > 1) {
      return Promise.reject(
        new TypeError(
          `A request carries one argument, and the one on "${channel}" has ${args.length}: put them in one object.`
        )
      );
    }

    const id = this.#nextId++;

    this.#listen(channel);

    return new Promise<RequestReturn<RequestType>>((resolve, reject) => {
      this.#outstanding.set(id, { channel, resolve, reject, reported: false });

      try {
        this.post(channel, args[0], id);
      } catch (error) {
        this.#settle(id);
        reject(error);

        return;
      }

      this.#watch();
    });
  }

  reply<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>,
    id: RequestId
  ): void {
    this.post(channel, data, id);
  }

  send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void {
    this.post(channel, data);
  }

  // Sends a message to the other side: `id` is the request it asks or answers, when it is one.
  protected abstract post<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>,
    id?: RequestId
  ): void;

  /**
   * Ends the transport's use (civ-clone/web-renderer#871): each request still waiting is rejected, the silence is no
   * longer timed, and the listeners for replies are removed. A request made after this is rejected too. A transport
   * that listens to anything of its own stops that in its own `dispose`, and calls this.
   */
  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;

    this.failAll(disposedMessage);

    this.#disposers.splice(0).forEach((dispose) => dispose());
    this.#listening.clear();
  }

  // Rejects every request that waits, with `message`: for a transport that learns the other side has gone, or never
  //  started. `requestRejected` is not called for them: the transport that calls this already knows. A reply that
  //  comes for one of them after all is dropped, with a warning, as any reply to no waiting request is.
  protected failAll(message: string): void {
    const outstanding = [...this.#outstanding.values()];

    this.#outstanding.clear();
    this.#stopWatching();

    outstanding.forEach(({ channel, reject }) =>
      reject(new RequestFailed(channel, message))
    );
  }

  // The other side has sent a message, of any kind, so it is still there. Called by the transport for each one.
  protected heard(): void {
    if (this.#disposed) {
      return;
    }

    this.#heardFrom = true;
    this.#stopWatching();
    this.#watch();
  }

  // A request the other side could not answer has rejected with `error`. Here for a transport to tell someone.
  protected requestRejected(error: RequestFailed): void {}

  // The other side has said nothing for the silence timeout while requests on `channels` wait on it. Here for a
  //  transport to tell someone.
  protected notAnswering(channels: string[]): void {}

  // The requests waiting that no silence has been reported for.
  #unreported(): Outstanding[] {
    return [...this.#outstanding.values()].filter(({ reported }) => !reported);
  }

  // Times the silence, unless it is never timed, is timed already, or nothing waits that it could be reported for.
  #watch(): void {
    if (
      this.#silenceTimeout === null ||
      this.#silence !== undefined ||
      this.#unreported().length === 0
    ) {
      return;
    }

    const timeout =
      this.#silenceTimeout * (this.#heardFrom ? 1 : startingSilenceFactor);

    this.#silence = this.#timers.set(() => {
      this.#silence = undefined;

      const unreported = this.#unreported();

      if (unreported.length === 0) {
        return;
      }

      unreported.forEach((outstanding) => (outstanding.reported = true));

      const channels = [...new Set(unreported.map(({ channel }) => channel))];

      console.warn(
        `The other side has said nothing for ${
          timeout / 1000
        } seconds while requests on ${channels
          .map((channel) => `"${channel}"`)
          .join(', ')} wait for it.`
      );

      this.notAnswering(channels);
    }, timeout);
  }

  #stopWatching(): void {
    if (this.#silence === undefined) {
      return;
    }

    this.#timers.clear(this.#silence);
    this.#silence = undefined;
  }

  #listen(channel: PropertyKey): void {
    if (!this.#listening.has('requestFailed')) {
      this.#listening.add('requestFailed');

      this.#disposers.push(
        this.receive(
          'requestFailed' as keyof DataMap,
          (failure: TransportFailure): void => {
            const outstanding = this.#take(
              failure?.channel,
              failure?.id,
              'requestFailed'
            );

            if (!outstanding) {
              return;
            }

            const error = new RequestFailed(failure.channel, failure.message);

            outstanding.reject(error);
            this.requestRejected(error);
          }
        )
      );
    }

    if (this.#listening.has(channel)) {
      return;
    }

    this.#listening.add(channel);

    this.#disposers.push(
      this.receive(
        channel as keyof DataMap,
        (value: any, { id }: TransportMeta = {}): void => {
          // Without an id it is no reply.
          if (id === undefined) {
            return;
          }

          this.#take(String(channel), id, 'reply')?.resolve(value);
        }
      )
    );
  }

  // The request a reply or failure answers, no longer waiting, or nothing for one that answers no request waiting here.
  #take(
    channel: string,
    id: RequestId | undefined,
    what: string
  ): Outstanding | undefined {
    const outstanding =
      id === undefined ? undefined : this.#outstanding.get(id);

    if (!outstanding || outstanding.channel !== channel) {
      console.warn(
        `Dropped a ${what} on "${channel}" for request ${id}, which is not waiting.`
      );

      return undefined;
    }

    return this.#settle(id!);
  }

  #settle(id: RequestId): Outstanding | undefined {
    const outstanding = this.#outstanding.get(id);

    if (!outstanding) {
      return undefined;
    }

    this.#outstanding.delete(id);

    if (this.#unreported().length === 0) {
      this.#stopWatching();
    }

    return outstanding;
  }
}

export default AbstractTransport;
