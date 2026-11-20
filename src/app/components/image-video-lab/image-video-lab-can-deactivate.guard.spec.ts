import { imageVideoLabCanDeactivate } from './image-video-lab-can-deactivate.guard';

describe('imageVideoLabCanDeactivate', () => {
  const run = (component: unknown) =>
    imageVideoLabCanDeactivate(
      component as never,
      {} as never,
      {} as never,
      {} as never,
    );

  it('asks the Lab before a route change destroys unsaved work', async () => {
    const canLeaveLab = jest.fn(async () => false);

    await expect(run({ canLeaveLab })).resolves.toBe(false);
    expect(canLeaveLab).toHaveBeenCalledTimes(1);
  });

  it('allows a component without the guard hook to leave', () => {
    expect(run({})).toBe(true);
  });
});
