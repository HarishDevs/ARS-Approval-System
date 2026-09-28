import { redirect } from "next/navigation";

// Middleware already sends visitors without a session to /login.
export default function RootPage() {
  redirect("/users");
}
