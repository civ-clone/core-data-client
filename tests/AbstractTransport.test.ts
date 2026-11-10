import {
  AbstractTransport,
  RequestFailed,
  TransportTimers,
  defaultSilenceTimeout,
  disposedMessage,
  startingSilenceFactor,
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

  get listeners(): number {
    return [...this.#listeners.values()].reduce(
      (total, listeners) => total + listeners.length,
      0
    );
  }

  get heardAnything(): boolean {
    return this.heardFrom;
  }

  fail(message: string): void {
    this.failAll(message);
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

class TopCities extends Request<[number], string[]> {
  constructor(limit: number) {
    super('topCities', limit);
  }
}

// What `request` resolves with, checked by the compiler: this fails to compile if it is not the request's own.
const typed = (transport: StubTransport): Promise<string[]> =>
  transport.request(new TopCities(5));
const mistyped = (transport: StubTransport): Promise<number> =>
  // @ts-expect-error a request's reply is not some other type
  transport.request(new TopCities(5));

const rejection = (promise: Promise<unknown>): Promise<any> =>
  promise.then(
    () => null,
    (error) => error
  );

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

  it('resolves a request with what it says it returns', async (): Promise<void> => {
    const transport = new StubTransport({ timers: new ManualTimers() }),
      asked = typed(transport);

    transport.deliver('topCities', ['Karakorum'], 1);

    expect(await asked).to.deep.equal(['Karakorum']);
    expect(mistyped).to.be.a('function');
  });

  it('rejects a request with more than one argument, and sends none of it', async (): Promise<void> => {
    class Pair extends Request<[number, number], void> {
      constructor() {
        super('pair', 1, 2);
      }
    }

    const transport = new StubTransport({ timers: new ManualTimers() }),
      error = await rejection(transport.request(new Pair()));

    expect(error).to.be.instanceOf(TypeError);
    expect(error.message).to.contain('"pair" has 2');
    expect(transport.sent).to.deep.equal([]);
    expect(transport.waiting).to.equal(0);
  });

  it('times the silence from the first request, before the other side has said anything', async (): Promise<void> => {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers });

    transport.request(new Ask('ask'));

    // A side that never starts says nothing, ever: it is the one most worth hearing about. It may only be slow to
    //  load, though, so it is given longer than one that has spoken.
    expect(transport.heardAnything).to.equal(false);
    expect(
      [...timers.pending.values()].map(({ timeout }) => timeout)
    ).to.deep.equal([defaultSilenceTimeout * startingSilenceFactor]);

    const warned = await quietly(async () => timers.runOut());

    expect(transport.silences).to.deep.equal([['ask']]);
    expect(warned[0]).to.contain(
      `for ${(defaultSilenceTimeout * startingSilenceFactor) / 1000} seconds`
    );
  });

  it('times the silence afresh, and for the usual time, once the other side has spoken', (): void => {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers });

    transport.request(new Ask('ask'));
    transport.deliver('ready', null);

    expect(
      [...timers.pending.values()].map(({ timeout }) => timeout)
    ).to.deep.equal([defaultSilenceTimeout]);
  });

  it('never times the silence of a side told to wait as long as it takes', (): void => {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers, silenceTimeout: null });

    transport.request(new Ask('chooseFromList'));
    transport.deliver('ready', null);

    expect(timers.pending.size).to.equal(0);
    expect(transport.waiting).to.equal(1);
  });

  it('times the silence for as long as it is told to', async (): Promise<void> => {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers, silenceTimeout: 5_000 });

    transport.deliver('ready', null);
    transport.request(new Ask('ask'));

    expect(
      [...timers.pending.values()].map(({ timeout }) => timeout)
    ).to.deep.equal([5_000]);

    const warned = await quietly(async () => timers.runOut());

    expect(warned[0]).to.contain('for 5 seconds');
  });

  it('rejects every waiting request when the other side is found to have gone', async (): Promise<void> => {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers }),
      first = rejection(transport.request(new Ask('ask'))),
      second = rejection(transport.request(new Ask('other')));

    transport.fail('The worker could not start.');

    const errors = [await first, await second];

    expect(errors.map((error) => error instanceof RequestFailed)).to.deep.equal(
      [true, true]
    );
    expect(
      errors.map(({ channel, message }) => [channel, message])
    ).to.deep.equal([
      ['ask', 'The worker could not start.'],
      ['other', 'The worker could not start.'],
    ]);
    expect(transport.waiting).to.equal(0);
    expect(timers.pending.size).to.equal(0);
    // The transport already knows: it is not told again, once for each.
    expect(transport.rejected).to.deep.equal([]);

    // It can still be used: a side that comes back answers what is asked next.
    const next = transport.request(new Ask('ask'));

    transport.deliver('ask', 'answer', 3);

    expect(await next).to.equal('answer');
  });

  it('disposed of, rejects what waits, stops listening and timing, and takes no more requests', async (): Promise<void> => {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers }),
      waiting = rejection(transport.request(new Ask('ask')));

    // One for the replies on `ask`, one for `requestFailed`.
    expect(transport.listeners).to.equal(2);
    expect(timers.pending.size).to.equal(1);

    transport.dispose();

    const error = await waiting;

    expect(error).to.be.instanceOf(RequestFailed);
    expect([error.channel, error.message]).to.deep.equal([
      'ask',
      disposedMessage,
    ]);
    expect(transport.listeners).to.equal(0);
    expect(timers.pending.size).to.equal(0);
    expect(transport.waiting).to.equal(0);

    const after = await rejection(transport.request(new Ask('ask')));

    expect(after).to.be.instanceOf(RequestFailed);
    expect(after.message).to.equal(disposedMessage);
    expect(transport.sent.length).to.equal(1);
    expect(transport.listeners).to.equal(0);

    // A message that comes anyway starts nothing, and disposing twice is the same as once.
    transport.deliver('ready', null);
    transport.dispose();

    expect(timers.pending.size).to.equal(0);
  });

  it('reports a silence while requests wait, once per silence and once per request', async (): Promise<void> => {
    const timers = new ManualTimers(),
      transport = new StubTransport({ timers });

    transport.request(new Ask('ask'));
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
