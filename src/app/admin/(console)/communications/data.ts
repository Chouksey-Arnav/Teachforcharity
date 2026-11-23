import "server-only";
import { adminDb } from "@/lib/admin/session";

export type Student = {
  student_id: string; student_name: string | null; family_id: string; family_name: string | null;
  family_email: string | null; grade: number | null; school: string | null;
  is_active: boolean; consent_ok: boolean; total_count: number | string;
};
export type Thread = {
  thread_id: string; student_id: string; student_name: string | null; family_name: string | null;
  last_message_at: string | null; last_body: string | null; unread_admin: boolean;
};
export type ThreadListItem = Thread & { total_count: number | string };
export type StudentThread = { thread_id: string; student_id: string; family_name: string | null };
export type ThreadDetail = Thread & { can_reply: boolean };
export type Message = { id: string; sender_name: string | null; sender_side: "admin" | "family"; body: string; created_at: string };
type Result<T> = { data: T[] | null; error: { message: string } | null };

// These RPCs are deployed alongside this workspace. Keep their contract local until
// the generated Supabase types are regenerated from the migrated database.
export async function communicationsDb() {
  const db = await adminDb();
  const rpc = db.rpc.bind(db) as unknown as <T>(name: string, args: Record<string, string | number | string[]>) => Promise<Result<T>>;
  return {
    students: (search: string, limit: number, offset: number) => rpc<Student>("admin_comms_students", { p_search: search, p_limit: limit, p_offset: offset }),
    threads: (limit: number, offset: number) => rpc<ThreadListItem>("admin_comms_threads", { p_limit: limit, p_offset: offset }),
    studentThreads: (students: string[]) => rpc<StudentThread>("admin_comms_student_threads", { p_students: students }),
    thread: (thread: string) => rpc<ThreadDetail>("admin_comms_thread", { p_thread: thread }),
    messages: (thread: string) => rpc<Message>("admin_comms_messages", { p_thread: thread }),
  };
}
