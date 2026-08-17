import { apiClient } from './client';

export interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  active: boolean;
  featured: boolean;
  completion_percentage: number;
  technologies: string[];
  image_url: string | null;
  project_url: string | null;
  client_name: string | null;
  client_user_id: string | null;
  next_milestone: string | null;
  eta_date: string | null;
  created_at: string;
  updated_at: string;
}

export function listProjects(): Promise<Project[]> {
  return apiClient.get<Project[]>('/projects');
}
