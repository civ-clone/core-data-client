import { expect } from 'chai';
import reconstituteData from '../reconstituteData';

// What `console.error` is given while `fn` runs.
const errorsFrom = (fn: () => void): unknown[] => {
  const error = console.error,
    logged: unknown[] = [];

  console.error = (thrown: unknown) => logged.push(thrown);

  try {
    fn();
  } finally {
    console.error = error;
  }

  return logged;
};

describe('reconstituteData', (): void => {
  it('replaces each reference with its object, the same object every time', (): void => {
    const rebuilt = reconstituteData({
      hierarchy: {
        city: { '#ref': 'city-1' },
        cities: [{ '#ref': 'city-1' }],
      },
      objects: {
        'city-1': {
          id: 'city-1',
          name: 'Karakorum',
          player: { '#ref': 'player-1' },
        },
        'player-1': { id: 'player-1' },
      },
    });

    expect(rebuilt.city.name).to.equal('Karakorum');
    expect(rebuilt.city.player).to.deep.equal({ id: 'player-1' });
    expect(rebuilt.cities[0]).to.equal(rebuilt.city);
  });

  it('keeps a cycle a cycle', (): void => {
    const rebuilt = reconstituteData({
      hierarchy: { '#ref': 'unit-1' },
      objects: {
        'unit-1': { id: 'unit-1', city: { '#ref': 'city-1' } },
        'city-1': { id: 'city-1', units: [{ '#ref': 'unit-1' }] },
      },
    });

    expect(rebuilt.city.units[0]).to.equal(rebuilt);
  });

  it('leaves a missing reference out of a list, and says so', (): void => {
    const error = console.error,
      logged: unknown[] = [];

    console.error = (thrown: unknown) => logged.push(thrown);

    try {
      const rebuilt = reconstituteData({
        hierarchy: { units: [{ '#ref': 'gone' }, { '#ref': 'unit-1' }] },
        objects: { 'unit-1': { id: 'unit-1' } },
      });

      expect(rebuilt.units).to.deep.equal([{ id: 'unit-1' }]);
    } finally {
      console.error = error;
    }

    expect(String(logged[0])).to.equal('TypeError: missing gone');
  });

  it('leaves the key of a missing reference off an object, and says so', (): void => {
    let rebuilt: any;

    const logged = errorsFrom(() => {
      rebuilt = reconstituteData({
        hierarchy: { '#ref': 'unit-1' },
        objects: {
          'unit-1': { id: 'unit-1', city: { '#ref': 'gone' }, moves: 1 },
        },
      });
    });

    expect(rebuilt).to.deep.equal({ id: 'unit-1', moves: 1 });
    expect('city' in rebuilt).to.equal(false);
    expect(Object.keys(rebuilt)).to.deep.equal(['id', 'moves']);
    expect(logged.map(String)).to.deep.equal(['TypeError: missing gone']);
  });

  it('says a missing reference met twice once, and leaves it out both times', (): void => {
    let rebuilt: any;

    const logged = errorsFrom(() => {
      rebuilt = reconstituteData({
        hierarchy: {
          city: { '#ref': 'gone' },
          units: [{ '#ref': 'gone' }],
          also: { city: { '#ref': 'gone' } },
        },
        objects: {},
      });
    });

    expect(rebuilt).to.deep.equal({ units: [], also: {} });
    expect(logged.map(String)).to.deep.equal(['TypeError: missing gone']);
  });

  it('keeps a cycle through a present object a cycle, around a missing reference', (): void => {
    let rebuilt: any;

    const logged = errorsFrom(() => {
      rebuilt = reconstituteData({
        hierarchy: { '#ref': 'unit-1' },
        objects: {
          'unit-1': {
            id: 'unit-1',
            city: { '#ref': 'city-1' },
            home: { '#ref': 'gone' },
          },
          'city-1': {
            id: 'city-1',
            units: [{ '#ref': 'unit-1' }, { '#ref': 'gone' }],
            garrison: { '#ref': 'unit-1' },
          },
        },
      });
    });

    expect(rebuilt.city.units).to.deep.equal([rebuilt]);
    expect(rebuilt.city.units[0]).to.equal(rebuilt);
    expect(rebuilt.city.garrison).to.equal(rebuilt);
    expect('home' in rebuilt).to.equal(false);
    expect(logged.map(String)).to.deep.equal(['TypeError: missing gone']);
  });
});
