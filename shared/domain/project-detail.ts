import { GitBranchItem } from './git-branch';

export interface ProjectStats {
  totalTickets: number;
  activeWipCount: number;
  closedTicketsCount: number;
  totalEstimateMd: number;
  totalActualMd: number;
  progressPercent: number;
  blockerCount: number;
  defectCount: number;
  stageDistribution: {
    status: string;
    label: string;
    count: number;
    delayedCount: number;
  }[];
  trackBreakdown: {
    track: string;
    label: string;
    count: number;
    estimateMd: number;
    actualMd: number;
  }[];
  agingTickets: {
    id: string;
    subject: string;
    status: string;
    ageDays: number;
    assigneeName: string;
    assigneeId?: string;
  }[];
}

export interface ProjectDetail {
  id: number;
  identifier: string;
  name: string;
  active: boolean;
  assignedTeamIds: string[];
  gitRepoIds: string[];
  gitRepoNames?: string[];
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  stats: ProjectStats;
}

export interface ProjectGitSummary {
  projectId: number;
  projectIdentifier: string;
  mappedRepos: {
    id: string;
    name: string;
    path: string;
    webUrl: string;
  }[];
  latestPipelines: {
    repoId: string;
    repoName: string;
    branch: string;
    status: 'success' | 'failed' | 'running' | 'unknown';
    webUrl: string;
    updatedAt: string;
  }[];
  openMrs: {
    projectId: string;
    iid: number;
    title: string;
    repoName: string;
    author: string;
    reviewers: string[];
    ageHours: number;
    ciStatus: string;
    webUrl: string;
  }[];
  activeBranches: GitBranchItem[];
}
