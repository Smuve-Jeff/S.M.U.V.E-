import { Component, signal } from '@angular/core';

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

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.css',
})
export class ProjectsComponent {
  projects = signal<Project[]>([]);
  selectedProject = signal<Project | null>(null);

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
}
