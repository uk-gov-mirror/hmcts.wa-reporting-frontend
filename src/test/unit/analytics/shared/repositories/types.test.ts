import * as types from '../../../../../main/modules/analytics/shared/repositories/types';

describe('repository types module', () => {
  test('does not expose runtime exports', () => {
    expect(types).toEqual({});
    expect(Object.keys(types)).toHaveLength(0);
  });
});
