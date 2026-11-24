import { TokenService } from './token.service';

describe('TokenService with blocked storage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('boots signed out when the store cannot be read or written', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    let service!: TokenService;
    expect(() => {
      service = new TokenService();
    }).not.toThrow();

    expect(service.jwtToken()).toBeNull();
    expect(service.tokenSource()).toBeNull();
    expect(service.isApiToken()).toBe(false);

    // The in-memory session still works; only persistence is lost.
    expect(() => service.setToken('header.payload.signature', 'api')).not.toThrow();
    expect(service.jwtToken()).toBe('header.payload.signature');
    expect(service.isApiToken()).toBe(true);
  });
});
