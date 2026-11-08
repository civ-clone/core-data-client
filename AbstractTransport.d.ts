import { Request, RequestArgs, RequestReturn } from './Request';
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
export type TransportTimers = {
  set(callback: () => void, timeout: number): unknown;
  clear(handle: unknown): void;
};
export type AbstractTransportOptions = {
  timers?: TransportTimers;
};
export declare abstract class AbstractTransport<
  DataMap extends {
    [key: string]: TransportData;
  }
> implements Transport<DataMap>
{
  #private;
  constructor({ timers }?: AbstractTransportOptions);
  abstract receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;
  abstract receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;
  protected get outstanding(): number;
  request<
    RequestType extends Request,
    Args extends any[] = RequestArgs<RequestType>,
    Return extends any = RequestReturn<RequestType>
  >(request: Request): Promise<Return>;
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
  protected heard(): void;
  protected requestRejected(error: RequestFailed): void;
  protected notAnswering(channels: string[]): void;
}
export default AbstractTransport;
