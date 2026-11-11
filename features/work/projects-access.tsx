"use client";

import { createContext, useContext } from "react";

// D-307 (owner): Projects is its own module. The users layout says once
// whether this person has it; task screens (grid, task panel, Create task)
// then show a task's project as its name only, with no link and no project
// picker. The server refuses project pages and project changes on its own;
// this only keeps the screens from offering them.
const ProjectsOn = createContext(true);

export function ProjectsAccess({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <ProjectsOn.Provider value={on}>{children}</ProjectsOn.Provider>;
}

export const useProjectsOn = () => useContext(ProjectsOn);
