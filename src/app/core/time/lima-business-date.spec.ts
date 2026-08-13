import { currentLimaBusinessDate } from './lima-business-date';

describe('currentLimaBusinessDate', () => {
  it('uses America/Lima at the UTC boundary before local midnight', () => {
    expect(currentLimaBusinessDate(new Date('2026-07-30T04:59:59.999Z'))).toBe('2026-07-29');
  });

  it('changes date exactly at local midnight', () => {
    expect(currentLimaBusinessDate(new Date('2026-07-30T05:00:00.000Z'))).toBe('2026-07-30');
  });
});
