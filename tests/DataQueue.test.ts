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

  it('is empty once cleared', (): void => {
    const queue = new DataQueue();

    queue.add('city', map('city'));
    queue.clear();

    expect(queue.transferData()).to.deep.equal([]);
  });
});
