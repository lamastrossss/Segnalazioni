export type ViewportClass = 'mobile' | 'tablet' | 'desktop';
export type IssueStatus = 'open' | 'in_progress' | 'resolved';

export interface Anchor {
  selector: string;
  tag: string;
  text: string;
  offset: { x: number; y: number };
  page: { x: number; y: number; docHeight: number };
}
export interface Profile { id: string; name: string; color: string }
export interface Project { id: string; name: string; archive_doc_url: string | null; domains: string[] }
export interface Attachment {
  id: string; issue_id: string; reply_id: string | null; path: string;
  width: number; height: number; bytes: number; created_at: string; deleted_at: string | null;
}
export interface Reply {
  id: string; issue_id: string; author_id: string; body: string;
  created_at: string; deleted_at: string | null; attachments: Attachment[];
}
export interface Issue {
  id: string; project_id: string; number: number; page_path: string; page_url: string;
  viewport_class: ViewportClass; viewport_width: number; browser: string; anchor: Anchor; body: string;
  status: IssueStatus; author_id: string; screenshot_path: string | null; screenshot_bytes: number;
  created_at: string; updated_at: string; deleted_at: string | null; deleted_by: string | null;
  replies_count: number;
}
export interface IssueDetail extends Issue { replies: Reply[]; attachments: Attachment[] }
export interface ArchiveStatus { last_run_at: string | null; last_ok_at: string | null; last_error: string | null }
