import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ProjectsComponent } from './projects.component';
import { ProjectService } from '../../services/project.service';
import { InteractionDialogService } from '../../services/interaction-dialog.service';
import { UplinkService } from '../../services/uplink.service';
import {
  UserProfileService,
  initialProfile,
} from '../../services/user-profile.service';

describe('ProjectsComponent', () => {
  const createComponent = async () => {
    const dialogMock = {
      prompt: jest.fn(),
      confirm: jest.fn(),
    };
    const uplinkMock = {
      initiateUplink: jest.fn().mockResolvedValue(true),
    };
    const profileServiceMock = {
      profile: signal(initialProfile),
    };

    const listSubject = new BehaviorSubject<any[]>([]);
    const projectServiceMock = {
      list$: listSubject.asObservable(),
      refresh: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn(async (id: string) => {
        listSubject.next(listSubject.getValue().filter((project) => project.id !== id));
        return true;
      }),
      add: (project: any) => {
        listSubject.next([...listSubject.getValue(), project]);
        return Promise.resolve();
      },
    };

    await TestBed.configureTestingModule({
      imports: [ProjectsComponent],
      providers: [
        provideNoopAnimations(),
        { provide: InteractionDialogService, useValue: dialogMock },
        { provide: UplinkService, useValue: uplinkMock },
        { provide: UserProfileService, useValue: profileServiceMock },
        { provide: ProjectService, useValue: projectServiceMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProjectsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { component, fixture, dialogMock, uplinkMock, projectServiceMock, listSubject };
  };

  describe('addProject', () => {
    it('creates a new project and selects it when a name is provided', async () => {
      const { component, dialogMock } = await createComponent();
      const initialCount = component.projects().length;

      dialogMock.prompt.mockResolvedValue('New Test Project');

      await component.addProject();

      expect(component.projects().length).toBe(initialCount + 1);
      const newProject = component.projects().at(-1)!;
      expect(newProject.name).toBe('New Test Project');
      expect(newProject.status).toBe('In Progress');
      expect(newProject.tasks).toEqual([]);
      expect(component.selectedProject()).toEqual(newProject);
    });

    it('does not add a project when the user cancels the prompt', async () => {
      const { component, dialogMock } = await createComponent();
      const initialCount = component.projects().length;

      dialogMock.prompt.mockResolvedValue(null);

      await component.addProject();

      expect(component.projects().length).toBe(initialCount);
    });

    it('does not add a project when the name is blank', async () => {
      const { component, dialogMock } = await createComponent();
      const initialCount = component.projects().length;

      dialogMock.prompt.mockResolvedValue('   ');

      await component.addProject();

      expect(component.projects().length).toBe(initialCount);
    });
  });

  describe('deleteProject', () => {
    it('confirms deletion, removes it from the list and selects a remaining project', async () => {
      const { component, fixture, dialogMock, projectServiceMock } = await createComponent();
      dialogMock.prompt.mockResolvedValueOnce('First').mockResolvedValueOnce('Second');
      await component.addProject();
      const first = component.selectedProject()!;
      await component.addProject();
      const second = component.selectedProject()!;
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[aria-label="Delete project Second"]')).toBeTruthy();
      dialogMock.confirm.mockResolvedValue(true);
      await component.deleteProject(second);
      expect(projectServiceMock.remove).toHaveBeenCalledWith(second.id);
      expect(component.selectedProject()?.id).toBe(first.id);
      await component.deleteProject(first);
      fixture.detectChanges();
      expect(component.selectedProject()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('No Project Selected');
    });

    it('retains a cancelled project and surfaces failures without unhandled anomalies', async () => {
      const { component, dialogMock, projectServiceMock } = await createComponent();
      dialogMock.prompt.mockResolvedValue('Keep me');
      await component.addProject();
      const project = component.selectedProject()!;
      dialogMock.confirm.mockResolvedValue(false);
      await component.deleteProject(project);
      expect(projectServiceMock.remove).not.toHaveBeenCalled();
      dialogMock.confirm.mockResolvedValue(true);
      projectServiceMock.remove.mockRejectedValueOnce(new Error('Storage unavailable'));
      await component.deleteProject(project);
      expect(component.projectError()).toBe('Storage unavailable');
      expect(component.selectedProject()).toEqual(project);
      expect(component.deletingProjectId()).toBeNull();
    });

    it('handles taskless legacy projects without throwing', async () => {
      const { component } = await createComponent();
      expect(component.getPlaybookSteps({ id: 'legacy', name: 'Legacy' } as any).map((step) => step.status)).toEqual(['Queued', 'Queued', 'Queued']);
    });
  });

  describe('finalizeReleaseCycle', () => {
    it('marks the selected project as Completed in both signals', async () => {
      const { component, dialogMock, uplinkMock } = await createComponent();

      dialogMock.prompt.mockResolvedValue('Test Release');
      await component.addProject();
      const created = component.selectedProject()!;
      expect(created.status).toBe('In Progress');

      await component.finalizeReleaseCycle();

      expect(uplinkMock.initiateUplink).toHaveBeenCalledTimes(1);
      expect(component.selectedProject()!.status).toBe('Completed');
      const inList = component.projects().find((p) => p.id === created.id)!;
      expect(inList.status).toBe('Completed');
    });

    it('does nothing when no project is selected', async () => {
      const { component } = await createComponent();
      component['selectedProject'].set(null);

      await expect(component.finalizeReleaseCycle()).resolves.toBeUndefined();
    });
  });
});
