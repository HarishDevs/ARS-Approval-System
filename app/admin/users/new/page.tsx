import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/features/shell/PageHeader";
import { UserForm } from "@/features/admin/UserForm";
import { loadUserFormOptions } from "@/features/admin/user-options";
import { requireArea } from "@/server/authorization/guards";

// WEB-05 (v1.10.0): a plain, non-confidential browser title.
export const metadata: Metadata = { title: "New user" };

export default async function NewUserPage() {
  const { user } = await requireArea("admin");
  const options = await loadUserFormOptions();
  return (
    <>
      <PageHeader title="Add user" description="Password users then get a set-password link by email from their user page.">
        <Link href="/admin/users" className="link text-label">
          ← All users
        </Link>
      </PageHeader>
      <div className="max-w-3xl">
        <UserForm
          mode="create"
          values={{ loginId: "", name: "", email: "", whatsappNumber: null, departmentId: null, designationId: null, reportingManagerId: null, signInMethod: "GOOGLE", roles: ["USER"] }}
          {...options}
          canGrantSuperAdmin={user.roles.includes("SUPER_ADMIN")}
          readOnly={false}
        />
      </div>
    </>
  );
}
