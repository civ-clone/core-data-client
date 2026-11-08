import {
  AbstractTransport,
  RequestFailed,
  TransportTimers,
  defaultSilenceTimeout,
} from '../AbstractTransport';
import { Request } from '../Request';
import { TransportMeta } from '../Transport';
import { expect } from 'chai';

type Handler = (data: any, meta?: TransportMeta) => void;

// Timers run out by hand.
class ManualTimers implements TransportTimers {
  pending: Map<number, { callback: () => void; timeout: number }> = new Map();
  #next = 1;

  set(callback: () => void, timeout: number): unknown {
    const handle = this.#next++;

    this.pending.set(handle, { callback, timeout });

    return handle;
  }

  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  runOut(): void {
    const pending = [...this.pending.values()];

    this.pending.clear();
    pending.forEach(({ callback }) => callback());
  }
}

// A transport whose messages the test delivers itself.
class StubTransport extends AbstractTransport<any> {
  #listeners: Map<string, Handler[]> = new Map();
  sent: [string, any, number | undefined][] = [];
  rejected: RequestFailed[] = [];
  silences: string[][] = [];

  get waiting(): number {
    return this.outstanding;
  }

  receive(channel: PropertyKey, handler: Handler) {
    const listeners = this.#listeners.get(String(channel)) ?? [];

    listeners.push(handler);
    this.#listeners.set(String(channel), listeners);

    return (): void => {
      listeners.splice(listeners.indexOf(handler), 1);
    };
  }

  receiveOnce(channel: PropertyKey, handler: Handler) {
    const dispose = this.receive(channel, (...args) => {
      dispose();
      handler(...args);
    });

    return dispose;
  }

  protected post(channel: PropertyKey, data: any, id?: number): void {
    this.sent.push([String(channel), data, id]);
  }

  deliver(channel: string, data: any, id?: number): void {
    this.heard();

    [...(this.#listeners.get(channel) ?? [])].forEach((listener) =>
      listener(data, { id })
    );
  }

  protected requestRejected(error: RequestFailed): void {
    this.rejected.push(error);
  }

  protected notAnswering(channels: string[]): void {
    this.silences.push(channels);
  }
}

class Ask extends Request<[any], any> {
  constructor(channel: string, value?: any) {
    super(channel, value);
  }
}

const quietly = async <T>(during: () => Promise<T>): Promise<string[]> => {
  const warned: string[] = [],
    warn = console.warn;

  console.warn = (...args: any[]) => warned.push(args.join(' '));

  try {
    await during();
  } finally {
    console.warn = warn;
  }

  return warned;
};

describe('AbstractTransport', (): void => {
  it('sends each request with an id of its own, on its channel', (): void => {
    const transport = new StubTransport({ timers: new ManualTimers() });

    transport.request(new Ask('topCities', 'a'));
    transport.request(new Ask('topCities', 'b'));

    expect(transport.sent).to.deep.equal([
      ['topCities', 'a', 1],
      ['topCities', 'b', 2],
    ]);
    expect(transport.waiting).to.equal(2);
  });

  it('resolves each request with the reply that carries its id, in whatever order they come', async (): Promise<void> => {
    const transport = new StubTransport({ timers: new ManualTimers() }),
      first = transport.request(new Ask('ask', 'first')),
      second = transport.request(new Ask('ask', 'second'));

    transport.deliver('ask', 'two', 2);
    transport.deliver('ask', 'one', 1);

    expect(await first).to.equal('one');
    expect(await second).to.equal('two');
    expect(transport.waiting).to.equal(0);
  });

  it('drops a reply that answers no waiting request, and a message with no id', async (): Promise<void> => {
    const transport = new StubTransport({ timers: new ManualTimers() }),
      asked = transport.request(new Ask('ask'));

    const warned = await quietly(async () => {
      transport.deliver('ask', 'stray', 99);
      transport.deliver('ask', 'not a reply');
    });

    expect(warned).to.deep.equal([
      'Dropped a reply on "ask" for request 99, which is not waiting.',
    ]);
    expect(transport.waiting).to.equal(1);

    transport.deliver('ask', 'answer', 1);

    expect(await asked).to.equal('answer');
  });

  it('rejects a request the other side could not answer, and says so once', async (): Promise<void> => {
    const transport = new StubTransport({ timers: new ManualTimers() }),
      asked = transport.request(new Ask('ask'));

    transport.deliver('requestFailed', {
      channel: 'ask',
      message: 'no such city',
      id: 1,
    });

    const error = await asked.then(
      () => null,
      (error) => error
    );

    expect(error).to.be.instanceOf(RequestFailed);
    expect(error.channel).to.equal('ask');
    expect(error.message).to.equal('no such city');
    expect(transport.rejected).to.deep.equal([error]);
    expect(transport.waiting).to.equal(0);
  });

  it('rejects a request it could not post, without waiting on it', async (): Promise<void> => {
    class Broken extends StubTransport {
      protected post(): void {
        throw new Error('closed');
      }
    }

    const transport = new Broken({ timers: new ManualTimers() });

    const error = await transport.request(new Ask('ask')).then(
      () => null,
      (error) => error
    );

    expect(error.message).to.equal('closed');
    expect(transport.waiting).to.equal(0);
  });

  it('reports a silence while a request waits once the other side has said something, once per silence', async (): Promise<void> => {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers });

    transport.request(new Ask('ask'));

    // Before the other side has said anything it may still be loading: its silence means nothing.
    expect(timers.pending.size).to.equal(0);

    transport.deliver('ready', null);
    transport.request(new Ask('other'));

    expect(
      [...timers.pending.values()].map(({ timeout }) => timeout)
    ).to.deep.equal([defaultSilenceTimeout]);

    await quietly(async () => timers.runOut());

    expect(transport.silences).to.deep.equal([['ask', 'other']]);

    // Each request is reported no more than once.
    await quietly(async () => timers.runOut());

    expect(transport.silences.length).to.equal(1);
  });

  it('stops timing the silence once nothing is waiting', (): void => {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers });

    transport.deliver('ready', null);
    transport.request(new Ask('ask'));

    expect(timers.pending.size).to.equal(1);

    transport.deliver('ask', 'answer', 1);

    expect(timers.pending.size).to.equal(0);
  });
});
