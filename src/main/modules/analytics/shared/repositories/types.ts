export type ServiceOverviewDbRow = {
  service: string;
  open_tasks: number;
  assigned_tasks: number;
  urgent: number;
  high: number;
  medium: number;
  low: number;
};

export type TaskEventsByServiceDbRow = {
  service: string;
  completed: number;
  cancelled: number;
  created: number;
};

export type AssignmentRow = {
  date_key: string;
  assignment_state: string;
  total: number;
};

export type TasksDuePriorityRow = {
  date_key: string;
  urgent: number;
  high: number;
  medium: number;
  low: number;
};

export type OpenTasksByNameRow = {
  task_name: string | null;
  urgent: number;
  high: number;
  medium: number;
  low: number;
};

export type OpenTasksByRegionLocationRow = {
  region: string | null;
  location: string | null;
  open_tasks: number;
  urgent: number;
  high: number;
  medium: number;
  low: number;
};

export type SummaryTotalsRow = {
  assigned: number;
  unassigned: number;
  urgent: number;
  high: number;
  medium: number;
  low: number;
};

export type WaitTimeRow = {
  date_key: string;
  avg_wait_time_days: number;
  assigned_task_count: number;
};

export type TasksDueRow = {
  date_key: string;
  open: number;
  completed: number;
};

export type UserOverviewTaskRow = {
  case_id: string;
  task_id: string;
  task_name: string | null;
  jurisdiction_label: string | null;
  role_category_label: string | null;
  region: string | null;
  location: string | null;
  created_date: string | null;
  first_assigned_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  handling_time_days: number | null;
  is_within_sla: string | null;
  priority_rank: number;
  assignee: string | null;
  number_of_reassignments: number | null;
};

export type UserOverviewCompletedByDateRow = {
  date_key: string;
  tasks: number;
  within_due: number;
  beyond_due: number;
  handling_time_sum: number | null;
  handling_time_count: number;
};

export type UserOverviewCompletedByTaskNameRow = {
  task_name: string | null;
  tasks: number;
  handling_time_sum: number | null;
  handling_time_count: number;
  days_beyond_sum: number | null;
  days_beyond_count: number;
};

export type OutstandingCriticalTaskRow = {
  case_id: string;
  task_id: string;
  task_name: string | null;
  case_type_label: string | null;
  region: string | null;
  location: string | null;
  created_date: string | null;
  due_date: string | null;
  priority_rank: number;
  assignee: string | null;
};

export type CompletedSummaryRow = {
  total: number;
  within: number;
};

export type CompletedTimelineRow = {
  date_key: string;
  total: number;
  within: number;
};

export type CompletedProcessingHandlingTimeRow = {
  date_key: string;
  task_count: number;
  handling_avg: number | null;
  handling_stddev: number | null;
  handling_sum: number | null;
  handling_count: number;
  processing_avg: number | null;
  processing_stddev: number | null;
  processing_sum: number | null;
  processing_count: number;
};

export type CompletedByNameRow = {
  task_name: string | null;
  total: number;
  within: number;
};

export type CompletedByLocationRow = {
  location: string | null;
  region: string | null;
  total: number;
  within: number;
  handling_time_days_sum: number | null;
  handling_time_days_count: number | null;
  processing_time_days_sum: number | null;
  processing_time_days_count: number | null;
};

export type CompletedByRegionRow = {
  region: string | null;
  total: number;
  within: number;
  handling_time_days_sum: number | null;
  handling_time_days_count: number | null;
  processing_time_days_sum: number | null;
  processing_time_days_count: number | null;
};

export type CompletedTaskAuditRow = {
  case_id: string;
  task_name: string | null;
  assignee: string | null;
  completed_date: string | null;
  number_of_reassignments: number | null;
  location: string | null;
  termination_process_label: string | null;
  outcome: string | null;
};

export type CaseWorkerProfileRow = {
  case_worker_id: string;
  first_name: string;
  last_name: string;
  email_id: string;
  region_id: number;
};

export type RegionRow = {
  region_id: string;
  description: string;
};

export type CourtVenueRow = {
  epimms_id: string;
  site_name: string;
  region_id: string;
};

export type FilterValueRow = {
  value: string;
};

export type FilterValueWithTextRow = {
  value: string;
  text: string;
};

export type OverviewFilterOptionsRows = {
  services: FilterValueRow[];
  roleCategories: FilterValueRow[];
  regions: FilterValueRow[];
  locations: FilterValueRow[];
  taskNames: FilterValueRow[];
  workTypes: FilterValueWithTextRow[];
  assignees: FilterValueRow[];
};
