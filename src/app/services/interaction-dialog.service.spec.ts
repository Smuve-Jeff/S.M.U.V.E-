import { InteractionDialogService } from './interaction-dialog.service';

describe('InteractionDialogService', () => {
  let dialog: InteractionDialogService;

  beforeEach(() => {
    dialog = new InteractionDialogService();
  });

  it('resolves confirm, alternate and cancel as distinct outcomes', async () => {
    const confirmed = dialog.confirmWithAlternate({ title: 't', message: 'm' });
    dialog.settle(true);
    await expect(confirmed).resolves.toBe('confirm');

    const alternate = dialog.confirmWithAlternate({ title: 't', message: 'm' });
    dialog.settle('alternate');
    await expect(alternate).resolves.toBe('alternate');

    const cancelled = dialog.confirmWithAlternate({ title: 't', message: 'm' });
    dialog.cancel();
    await expect(cancelled).resolves.toBe('cancel');
  });

  it('keeps confirm() boolean and treats the alternate action as refusal', async () => {
    const promise = dialog.confirm({ title: 't', message: 'm' });

    dialog.settle('alternate');

    await expect(promise).resolves.toBe(false);
  });
});
