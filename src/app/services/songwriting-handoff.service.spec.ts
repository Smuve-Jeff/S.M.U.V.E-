import { TestBed } from '@angular/core/testing';
import { SongwritingHandoffService } from './songwriting-handoff.service';

describe('SongwritingHandoffService', () => {
  let service: SongwritingHandoffService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [SongwritingHandoffService] });
    service = TestBed.inject(SongwritingHandoffService);
  });

  it('delivers a draft to the surface it was addressed to', () => {
    service.handOff({
      title: 'Hook',
      body: 'a line from the pad',
      from: 'pad',
      to: 'cowrite',
    });

    expect(service.pendingFor('cowrite')?.body).toBe('a line from the pad');
    expect(service.pendingFor('pad')).toBeNull();
  });

  it('hands a draft over exactly once', () => {
    service.handOff({
      title: 'Session',
      body: 'compiled lyrics',
      from: 'cowrite',
      to: 'pad',
    });

    expect(service.claim('pad')?.body).toBe('compiled lyrics');
    expect(service.claim('pad')).toBeNull();
    expect(service.pendingFor('pad')).toBeNull();
  });

  it('refuses to carry an empty draft', () => {
    service.handOff({ title: 'Blank', body: '   \n  ', from: 'pad', to: 'cowrite' });

    // Moving nothing between rooms would silently replace real work.
    expect(service.pendingFor('cowrite')).toBeNull();
  });

  it('trims surrounding whitespace but keeps the words intact', () => {
    service.handOff({
      title: ' Hook ',
      body: '\n  first line\nsecond line  \n',
      from: 'pad',
      to: 'cowrite',
    });

    expect(service.claim('cowrite')?.body).toBe('first line\nsecond line');
  });

  it('lets the artist cancel a pending draft', () => {
    service.handOff({ title: 'Hook', body: 'x', from: 'pad', to: 'cowrite' });
    service.clear();

    expect(service.pendingFor('cowrite')).toBeNull();
  });
});
