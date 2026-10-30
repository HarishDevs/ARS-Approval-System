import { WorkNav } from "@/features/work/WorkNav";

// D-215: Task & Project Management pages share their tabs and keyboard.
export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkNav />
      {children}
    </>
  );
}
