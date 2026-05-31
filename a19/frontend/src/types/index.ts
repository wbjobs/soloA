export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  repo_path: string | null;
  repo_url: string | null;
  default_branch: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  owner_username?: string;
}

export interface Branch {
  id: string;
  project_id: string;
  name: string;
  last_commit_hash: string | null;
  last_commit_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  project_id: string;
  title: string;
  description: string;
  source_branch_id: string;
  target_branch_id: string;
  creator_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'merged';
  created_at: string;
  updated_at: string;
  creator_username?: string;
  creator_display_name?: string;
  creator_email?: string;
  source_branch_name?: string;
  target_branch_name?: string;
  project_name?: string;
  reviewers?: Reviewer[];
}

export interface Reviewer {
  id: string;
  review_id: string;
  user_id: string;
  assigned_at: string;
  status: 'pending' | 'reviewed';
  username: string;
  display_name: string;
}

export interface DiffChange {
  operation: 'add' | 'remove' | 'modify';
  oldLine?: number;
  newLine?: number;
  content: string;
}

export interface DiffFile {
  file: string;
  changes: DiffChange[];
}

export interface Comment {
  id: string;
  review_id: string;
  author_id: string;
  file_path: string | null;
  line_number: number | null;
  content: string;
  created_at: string;
  is_resolved: boolean;
  author_username?: string;
  author_display_name?: string;
  author_avatar?: string | null;
  replies?: CommentReply[];
}

export interface CommentReply {
  id: string;
  parent_comment_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_username?: string;
  author_display_name?: string;
  author_avatar?: string | null;
}

export interface AnalysisIssue {
  file: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
}

export interface AnalysisSummary {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface AnalysisResult {
  tool: string;
  status: 'success' | 'failed';
  issues: AnalysisIssue[];
  summary: AnalysisSummary;
}

export interface ApiResponse<T> {
  status: string;
  data: T;
  message?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  repoUrl?: string;
  isPublic?: boolean;
}

export interface CreateReviewData {
  projectId: string;
  title: string;
  description?: string;
  sourceBranchId: string;
  targetBranchId: string;
  reviewerIds?: string[];
}

export interface CreateCommentData {
  reviewId: string;
  filePath?: string;
  lineNumber?: number;
  content: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  category?: string;
  required?: boolean;
  sortOrder?: number;
}

export interface ReviewTemplate {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  project_id?: string | null;
  is_default: boolean;
  is_global: boolean;
  checklist: ChecklistItem[];
  created_at: string;
  updated_at: string;
}

export interface ReviewChecklistItem {
  id: string;
  review_id: string;
  template_id?: string | null;
  title: string;
  description?: string;
  category?: string;
  status: 'pending' | 'checked' | 'not_applicable';
  checked_by?: string | null;
  checked_at?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateData {
  name: string;
  description?: string;
  projectId?: string;
  isDefault?: boolean;
  isGlobal?: boolean;
  checklist: ChecklistItem[];
}

export interface UpdateTemplateData {
  name?: string;
  description?: string;
  isDefault?: boolean;
  checklist?: ChecklistItem[];
}

export interface BulkReviewAction {
  reviewIds: string[];
  action: 'approve' | 'reject' | 'assign';
  assigneeId?: string;
  comment?: string;
}

export interface ReviewStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  merged: number;
}

export interface EfficiencyStats {
  avgTimeToFirstReview: number;
  avgTimeToMerge: number;
  avgReviewCycle: number;
  reviewsPerWeek: number;
}

export interface UserReviewStats {
  userId: string;
  username: string;
  displayName: string;
  created: number;
  reviewed: number;
  approved: number;
  rejected: number;
  avgResponseTime: number;
}

export interface TeamStats {
  period: string;
  totalReviews: number;
  avgTimeToMerge: number;
  avgReviewsPerMember: number;
  topReviewers: UserReviewStats[];
  weeklyTrend: {
    week: string;
    reviews: number;
    merged: number;
  }[];
}

export interface PersonalStats {
  period: string;
  created: ReviewStats;
  reviewed: ReviewStats;
  efficiency: EfficiencyStats;
  mostCommentedFiles: {
    file: string;
    commentCount: number;
  }[];
}
