export interface RequestInterface<Args extends any[], Return extends any> {
  args(): Args;
  channel(): string;
}
export type RequestArgs<RequestType extends Request> =
  RequestType extends Request<infer Args> ? Args : never;
export type RequestReturn<RequestType extends Request> =
  RequestType extends Request<any[], infer Return> ? Return : never;
export declare class Request<
  Args extends any[] = any[],
  Return extends any = any
> implements RequestInterface<Args, Return>
{
  #private;
  readonly _return?: Return;
  constructor(channel: string, ...args: Args);
  args(): Args;
  channel(): string;
}
export default Request;
