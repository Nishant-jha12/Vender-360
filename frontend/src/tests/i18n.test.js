// Unit tests for vernacular dictionaries
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import mr from '../locales/mr.json';
import bn from '../locales/bn.json';

describe('Vernacular Localization', () => {
  it('guarantees key equality across all 4 locales', () => {
    const enKeys = Object.keys(en);
    expect(Object.keys(hi)).toEqual(enKeys);
    expect(Object.keys(mr)).toEqual(enKeys);
    expect(Object.keys(bn)).toEqual(enKeys);
  });

  it('contains theme translations in all languages', () => {
    expect(en.theme.light).toBeDefined();
    expect(hi.theme.light).toBeDefined();
    expect(mr.theme.light).toBeDefined();
    expect(bn.theme.light).toBeDefined();
  });
});
