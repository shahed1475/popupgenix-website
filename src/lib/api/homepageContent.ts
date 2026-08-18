import { apiClient } from './client';

export interface HomepageContent {
  id: string;
  hero_title: string;
  hero_subtitle: string;
  hero_cta_primary: string;
  hero_cta_secondary: string;
  about_title: string;
  about_description: string;
  clients_count: number;
  projects_count: number;
  satisfaction_rate: number;
  team_size: number;
  created_at: string;
  updated_at: string;
}

export type HomepageContentInput = Omit<HomepageContent, 'id' | 'created_at' | 'updated_at'>;

export function getHomepageContent(): Promise<HomepageContent | null> {
  return apiClient.get<HomepageContent | null>('/homepage-content');
}

export function saveHomepageContent(input: HomepageContentInput): Promise<HomepageContent> {
  return apiClient.put<HomepageContent>('/homepage-content', input);
}
