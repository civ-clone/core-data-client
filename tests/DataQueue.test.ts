import { DataQueue } from '../DataQueue';
import { expect } from 'chai';

const map = (name: string) => ({
  hierarchy: { '#ref': name },
  objects: { [name]: { id: name } },
});

describe('DataQueue', (): void => {
  it('sends what was queued, in order, as adds and updates', (): void => {
    const queue = new DataQueue();

    queue.add('city', map('city'));
    queue.update('city', map('size'), 'size');

    expect(queue.transferData()).to.deep.equal([
      { city: { type: 'add', index: null, value: map('city') } },
      { city: { type: 'update', index: 'size', value: map('size') } },
    ]);
  });

  it('builds a value given as a function when it is sent, and leaves out one that comes back undefined', (): void => {
    const queue = new DataQueue();
    let size = 1;

    queue.update('city', () => map(`size-${size}`), 'size');
    queue.update('unit', () => undefined);

    size = 2;

    expect(queue.transferData()).to.deep.equal([
      { city: { type: 'update', index: 'size', value: map('size-2') } },
    ]);
  });

  it('leaves out a value that throws, and sends the rest', (): void => {
    const queue = new DataQueue(),
      error = console.error,
      logged: unknown[] = [];

    console.error = (thrown: unknown) => logged.push(thrown);

    try {
      queue.update('broken', () => {
        throw new Error('gone');
      });
      queue.update('city', map('city'));

      expect(queue.transferData()).to.deep.equal([
        { city: { type: 'update', index: null, value: map('city') } },
      ]);
    } finally {
      console.error = error;
    }

    expect(logged.length).to.equal(1);
  });

  it('carries an index through add and update as it was given', (): void => {
    const queue = new DataQueue();

    queue.add('world', map('tile'), 'tiles[12]');
    queue.update('player', () => map('complete'), 'research.complete');
    queue.update('player', map('player'), null);
    queue.add('city', map('city'));

    expect(
      queue
        .take()
        .map((patch) =>
          Object.entries(patch).map(([id, { type, index }]) => [
            id,
            type,
            index,
          ])
        )
    ).to.deep.equal([
      [['world', 'add', 'tiles[12]']],
      [['player', 'update', 'research.complete']],
      [['player', 'update', null]],
      [['city', 'add', null]],
    ]);
  });

  it('sends two updates to the same object as two patches', (): void => {
    const queue = new DataQueue();

    queue.update('city', map('size-1'), 'size');
    queue.update('city', map('size-2'), 'size');

    expect(queue.take()).to.deep.equal([
      { city: { type: 'update', index: 'size', value: map('size-1') } },
      { city: { type: 'update', index: 'size', value: map('size-2') } },
    ]);
  });

  it('takes what is queued, leaving it empty', (): void => {
    const queue = new DataQueue();

    queue.add('city', map('city'));

    expect(queue.take()).to.deep.equal([
      { city: { type: 'add', index: null, value: map('city') } },
    ]);
    expect(queue.take()).to.deep.equal([]);
  });

  it('keeps a patch queued while a value is built for the next take, neither lost nor sent twice', (): void => {
    const queue = new DataQueue();

    queue.update('city', () => {
      queue.update('unit', map('unit'));

      return map('city');
    });

    expect(queue.take()).to.deep.equal([
      { city: { type: 'update', index: null, value: map('city') } },
    ]);
    expect(queue.take()).to.deep.equal([
      { unit: { type: 'update', index: null, value: map('unit') } },
    ]);
    expect(queue.take()).to.deep.equal([]);
  });

  it('leaves out a value that throws when taken, sends the rest, and keeps none of it', (): void => {
    const queue = new DataQueue(),
      error = console.error,
      logged: unknown[] = [];

    console.error = (thrown: unknown) => logged.push(thrown);

    try {
      queue.update('broken', () => {
        throw new Error('gone');
      });
      queue.update('city', map('city'));

      expect(queue.take()).to.deep.equal([
        { city: { type: 'update', index: null, value: map('city') } },
      ]);
      expect(queue.take()).to.deep.equal([]);
    } finally {
      console.error = error;
    }

    expect(logged.length).to.equal(1);
  });

  it('builds what is queued without emptying it with transferData, for clear to empty', (): void => {
    const queue = new DataQueue();

    queue.add('city', map('city'));

    expect(queue.transferData()).to.deep.equal(queue.transferData());
    expect(queue.transferData().length).to.equal(1);
  });

  it('is empty once cleared', (): void => {
    const queue = new DataQueue();

    queue.add('city', map('city'));
    queue.clear();

    expect(queue.transferData()).to.deep.equal([]);
  });
});
