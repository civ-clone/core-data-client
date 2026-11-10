import { Request, RequestArgs, RequestReturn } from '../Request';
import { expect } from 'chai';

class TopCities extends Request<[number], string[]> {
  constructor(limit: number) {
    super('topCities', limit);
  }
}

// The types a request carries, checked by the compiler: these fail to compile if they are wrong.
const args: RequestArgs<TopCities> = [5],
  reply: RequestReturn<TopCities> = ['Karakorum'];
// @ts-expect-error a request's reply is its own type, not anything at all
const notReply: RequestReturn<TopCities> = 5;

describe('Request', (): void => {
  it('is its channel and its arguments', (): void => {
    const request = new TopCities(5);

    expect(request.channel()).to.equal('topCities');
    expect(request.args()).to.deep.equal(args);
    expect(reply).to.deep.equal(['Karakorum']);
    expect(notReply).to.equal(5);
    // What tells the compiler the reply's type is never there when the game runs.
    expect('_return' in request).to.equal(false);
  });
});
