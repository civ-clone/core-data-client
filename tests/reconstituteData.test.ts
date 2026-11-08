import { expect } from 'chai';
import reconstituteData from '../reconstituteData';

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
});
