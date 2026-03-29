import { TestBed } from '@angular/core/testing';
import { ProjectsComponent } from './projects.component';

describe('ProjectsComponent', () => {
  const createComponent = async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectsComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProjectsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { component, fixture };
  };

  describe('addProject', () => {
    it('creates a new project and selects it when a name is provided', async () => {
      const { component } = await createComponent();
      const initialCount = component.projects().length;

      jest.spyOn(window, 'prompt').mockReturnValue('New Test Project');

      component.addProject();

      expect(component.projects().length).toBe(initialCount + 1);
      const newProject = component.projects().at(-1)!;
      expect(newProject.name).toBe('New Test Project');
      expect(newProject.status).toBe('In Progress');
      expect(newProject.tasks).toEqual([]);
      expect(component.selectedProject()).toEqual(newProject);
    });

    it('does not add a project when the user cancels the prompt', async () => {
      const { component } = await createComponent();
      const initialCount = component.projects().length;

      jest.spyOn(window, 'prompt').mockReturnValue(null);

      component.addProject();

      expect(component.projects().length).toBe(initialCount);
    });

    it('does not add a project when the name is blank', async () => {
      const { component } = await createComponent();
      const initialCount = component.projects().length;

      jest.spyOn(window, 'prompt').mockReturnValue('   ');

      component.addProject();

      expect(component.projects().length).toBe(initialCount);
    });
  });

  describe('finalizeReleaseCycle', () => {
    it('marks the selected project as Completed in both signals', async () => {
      const { component } = await createComponent();

      jest.spyOn(window, 'prompt').mockReturnValue('Test Release');
      component.addProject();
      const created = component.selectedProject()!;
      expect(created.status).toBe('In Progress');

      component.finalizeReleaseCycle();

      expect(component.selectedProject()!.status).toBe('Completed');
      const inList = component.projects().find((p) => p.id === created.id)!;
      expect(inList.status).toBe('Completed');
    });

    it('does nothing when no project is selected', async () => {
      const { component } = await createComponent();
      component['selectedProject'].set(null);

      expect(() => component.finalizeReleaseCycle()).not.toThrow();
    });
  });
});
