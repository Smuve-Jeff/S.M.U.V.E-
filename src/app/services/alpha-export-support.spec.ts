import { isSafariWithoutWebmAlpha } from './alpha-export-support';

describe('alpha export support', () => {
  it('rejects Safari because it drops WebM alpha', () => {
    expect(
      isSafariWithoutWebmAlpha(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      ),
    ).toBe(true);
    expect(
      isSafariWithoutWebmAlpha(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(true);
  });

  it('keeps Chromium and Firefox on the transparent path', () => {
    expect(
      isSafariWithoutWebmAlpha(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
    expect(
      isSafariWithoutWebmAlpha(
        'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      ),
    ).toBe(false);
  });

  it('does not treat an empty user agent as Safari', () => {
    expect(isSafariWithoutWebmAlpha('')).toBe(false);
  });
});
