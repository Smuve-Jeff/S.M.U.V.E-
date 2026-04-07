import { TestBed } from '@angular/core/testing';
import { HistoryService } from '../history.service';

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HistoryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with no undo/redo available', () => {
    expect(service.canUndo()).toBe(false);
    expect(service.canRedo()).toBe(false);
  });

  it('should enable undo after pushing an action', () => {
    let value = 0;
    service.pushAction({
      description: 'Increment',
      undo: () => {
        value--;
      },
      redo: () => {
        value++;
      },
    });

    expect(service.canUndo()).toBe(true);
    expect(service.canRedo()).toBe(false);
  });

  it('should execute undo correctly', () => {
    let value = 0;
    service.pushAction({
      description: 'Increment',
      undo: () => {
        value = 5;
      },
      redo: () => {
        value = 10;
      },
    });

    value = 10; // Simulate the action having been performed
    service.undo();

    expect(value).toBe(5);
    expect(service.canUndo()).toBe(false);
    expect(service.canRedo()).toBe(true);
  });

  it('should execute redo correctly', () => {
    let value = 0;
    service.pushAction({
      description: 'Increment',
      undo: () => {
        value = 5;
      },
      redo: () => {
        value = 10;
      },
    });

    value = 10;
    service.undo();
    expect(value).toBe(5);

    service.redo();
    expect(value).toBe(10);
    expect(service.canUndo()).toBe(true);
    expect(service.canRedo()).toBe(false);
  });

  it('should clear redo stack when new action is pushed', () => {
    let value = 0;

    service.pushAction({
      description: 'Action 1',
      undo: () => {
        value--;
      },
      redo: () => {
        value++;
      },
    });

    value++;
    service.undo();
    value--;

    expect(service.canRedo()).toBe(true);

    service.pushAction({
      description: 'Action 2',
      undo: () => {
        value -= 2;
      },
      redo: () => {
        value += 2;
      },
    });

    expect(service.canRedo()).toBe(false);
  });

  it('should handle multiple actions in sequence', () => {
    let value = 0;

    service.pushAction({
      description: 'Add 5',
      undo: () => {
        value -= 5;
      },
      redo: () => {
        value += 5;
      },
    });
    value += 5;

    service.pushAction({
      description: 'Add 3',
      undo: () => {
        value -= 3;
      },
      redo: () => {
        value += 3;
      },
    });
    value += 3;

    expect(value).toBe(8);

    service.undo();
    expect(value).toBe(5);

    service.undo();
    expect(value).toBe(0);

    service.redo();
    expect(value).toBe(5);

    service.redo();
    expect(value).toBe(8);
  });

  it('should clear all history', () => {
    let value = 0;

    service.pushAction({
      description: 'Action',
      undo: () => {
        value = 0;
      },
      redo: () => {
        value = 1;
      },
    });

    expect(service.canUndo()).toBe(true);

    service.clear();

    expect(service.canUndo()).toBe(false);
    expect(service.canRedo()).toBe(false);
  });

  it('should return correct action descriptions', () => {
    service.pushAction({
      description: 'Test Action',
      undo: () => {},
      redo: () => {},
    });

    expect(service.getUndoDescription()).toBe('Test Action');
    expect(service.getRedoDescription()).toBeNull();

    service.undo();

    expect(service.getUndoDescription()).toBeNull();
    expect(service.getRedoDescription()).toBe('Test Action');
  });

  it('should limit history size to 100 actions', () => {
    let value = 0;

    // Push 150 actions
    for (let i = 0; i < 150; i++) {
      service.pushAction({
        description: `Action ${i}`,
        undo: () => {
          value--;
        },
        redo: () => {
          value++;
        },
      });
    }

    // Undo all available actions (should be 100, not 150)
    let undoCount = 0;
    while (service.canUndo()) {
      service.undo();
      undoCount++;
    }

    expect(undoCount).toBe(100);
  });
});
