import { Request, RequestArgs, RequestReturn } from './Request';
import { ObjectMap } from '@civ-clone/core-data-object/DataObject';

// How two sides of a game talk (a game running in a worker and the page that shows it, say): named channels, each with
//  what is sent on it and what is received, and requests answered on their own channel. Nothing here knows what the
//  channels are: a `DataMap` names them.

/** Which request a message asks or answers: each request gets its own, and its reply, or failure, carries it back. */
export type RequestId = number;

/** What is sent and what is received on one channel. */
export type TransportData<Send = any, Receive = any> = {
  send: Send;
  receive: Receive;
};

/** The channels a transport carries, by name. */
export type TransportDataMap = {
  [channel: string]: TransportData;
};

export type TransportSendArgs<Data extends TransportData> =
  Data extends TransportData<infer Send> ? Send : never;

export type TransportReceiveArgs<Data extends TransportData> =
  Data extends TransportData<any, infer Receive> ? Receive : never;

/** One message as it crosses: its channel, its data, and the request it asks or answers, when it is one. */
export type TransportMessage<
  DataMap extends TransportDataMap = TransportDataMap,
  Channel extends keyof DataMap = keyof DataMap
> = {
  channel: Channel;
  data: TransportReceiveArgs<DataMap[Channel]>;
  // Only on a request and its reply.
  id?: RequestId;
};

/**
 * What came with a message besides its data: the payload as it arrived, before a transport rebuilt it from its
 * `ObjectMap`, and the request the message asks or answers, when it is one.
 */
export type TransportMeta = {
  rawData?: ObjectMap;
  id?: RequestId;
};

export type TransportReceiveHandler<Data extends TransportData> = (
  data: TransportReceiveArgs<Data>,
  meta?: TransportMeta
) => void;

export type TransportDisposer = () => void;

/** A request the other side could not answer, on the channel it was asked on, and which one it was. */
export type TransportFailure = {
  channel: string;
  message: string;
  id: RequestId;
};

export interface Transport<DataMap extends TransportDataMap> {
  receive<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  receiveOnce<Channel extends keyof DataMap>(
    channel: Channel,
    handler: TransportReceiveHandler<DataMap[Channel]>
  ): TransportDisposer;

  request<
    RequestType extends Request,
    Args extends any[] = RequestArgs<RequestType>,
    Return extends any = RequestReturn<RequestType>
  >(
    request: Request
  ): Promise<Return>;

  /** The answer to the request `id`, which the asking side matches it to. */
  reply<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>,
    id: RequestId
  ): void;

  send<Channel extends keyof DataMap>(
    channel: Channel,
    data: TransportSendArgs<DataMap[Channel]>
  ): void;
}

export default Transport;
