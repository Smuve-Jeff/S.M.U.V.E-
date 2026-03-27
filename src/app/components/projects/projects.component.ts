import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Task {
  id: number;
  description: string;
  completed: boolean;
}

interface Project {
  id: number;
  name: string;
  description: string;
  tasks: Task[];
  status: 'In Progress' | 'Completed';
  deadline?: Date;
}

interface PlaybookPhase {
  title: string;
  objective: string;
  threshold: number;
}

interface PlaybookStep extends PlaybookPhase {
  status: 'Queued' | 'Active' | 'Complete';
}

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.css',
})
export class ProjectsComponent {
  projects = signal<Project[]>([]);
  selectedProject = signal<Project | null>(null);
  private playbookTemplate: PlaybookPhase[] = [
    {
      title: 'Blueprint',
      objective: 'Lock the creative direction and tracklist.',
      threshold: 0.34,
    },
    {
      title: 'Production',
      objective: 'Finalize mixes, masters, and visual assets.',
      threshold: 0.67,
    },
    {
      title: 'Launch',
      objective: 'Deliver distribution assets and release plan.',
      threshold: 1,
    },
  ];

  constructor() {
    // Mock data for demonstration
    this.projects.set([
      {
        id: 1,
        name: 'Aurora EP Release',
        description: 'Release of the 3-track EP "Aurora"',
        status: 'In Progress',
        tasks: [
          { id: 1, description: 'Finalize mix for "Sunrise"', completed: true },
          { id: 2, description: 'Master "Midday"', completed: false },
          { id: 3, description: 'Shoot cover art', completed: false },
        ],
        deadline: new Date('2024-09-15'),
      },
    ]);
    this.selectedProject.set(this.projects()[0]);
  }

  selectProject(project: Project): void {
    this.selectedProject.set(project);
  }

  toggleTask(task: Task): void {
    task.completed = !task.completed;
    // Potentially update project status if all tasks are completed
  }

  getProjectProgress(project: Project): number {
    if (!project || !project.tasks || project.tasks.length === 0) {
      return 0;
    }
    const completedTasks = project.tasks.filter((t) => t.completed).length;
    return (completedTasks / project.tasks.length) * 100;
  }

  getPlaybookSteps(project: Project): PlaybookStep[] {
    if (this.playbookTemplate.length === 0) {
      return [];
    }

    if (project.tasks.length === 0) {
      return this.playbookTemplate.map((phase) => ({
        ...phase,
        status: 'Queued',
      }));
    }

    const totalTasks = project.tasks.length;
    const completedTasks = project.tasks.filter((task) => task.completed).length;
    const progress = completedTasks / totalTasks;

    return this.playbookTemplate.map((phase, index) => {
      const previousThreshold =
        index === 0 ? 0 : this.playbookTemplate[index - 1].threshold;
      let status: PlaybookStep['status'] = 'Queued';
      if (progress >= phase.threshold) {
        status = 'Complete';
      } else if (progress >= previousThreshold) {
        status = 'Active';
      }
      return { ...phase, status };
    });
  }

  getPlaybookStatusClass(status: PlaybookStep['status']): string {
    switch (status) {
      case 'Complete':
        return 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10';
      case 'Active':
        return 'border-brand-primary/40 text-brand-primary bg-brand-primary/10';
      default:
        return 'border-white/10 text-slate-400 bg-white/5';
    }
  }
}
