export interface Project {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  status: 'In Progress' | 'Completed';
  deadline?: Date;
}

export interface Task {
  id: number;
  description: string;
  completed: boolean;
}
