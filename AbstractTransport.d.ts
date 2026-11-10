import { Request, RequestReturn } from './Request';
import {
  RequestId,
  Transport,
  TransportData,
  TransportDisposer,
  TransportReceiveHandler,
  TransportSendArgs,
} from './Transport';
export declare class RequestFailed extends Error {
  readonly channel: string;
  constructor(channel: string, message: string);
}
export declare const defaultSilenceTimeout = 30000;
export declare const disposedMessage = 'The transport is no longer in use.';
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
export declare abstract class AbstractTransport<
  DataMap extends {
    [key: string]: TransportData;
  }
> implements Transport<DataMap>
{
  #private;
  constructor({ timers, silenceTimeout }?: AbstractTransportOptions);
  abstract receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;
  abstract receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;
  protected get outstanding(): number;
  protected get heardFrom(): boolean;
  request<RequestType extends Request>(
    request: RequestType
  ): Promise<RequestReturn<RequestType>>;
  reply<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>,
    id: RequestId
  ): void;
  send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void;
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
  dispose(): void;
  protected failAll(message: string): void;
  protected heard(): void;
  protected requestRejected(error: RequestFailed): void;
  protected notAnswering(channels: string[]): void;
}
export default AbstractTransport;
