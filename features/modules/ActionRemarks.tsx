"use client";

import { createContext, useContext, useState } from "react";
import { MessageSquareText } from "lucide-react";

// v1.54.1 (owner: "add remarks in the actions card and sync with Comments"):
// one Remarks box for every action in the card. Whichever action is taken
// (Start, Complete, Mark blocked, Cancel, Reassign…), the remark goes with it
// and the server posts it to the task's Comments, so it shows there too.
const Remarks = createContext<{ value: string; clear: () => void } | null>(null);

export function ActionRemarks({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState("");
  return (
    <Remarks.Provider value={{ value, clear: () => setValue("") }}>
      <div>
        <label htmlFor="task-remarks" className="field-label inline-flex items-center gap-1.5">
          <MessageSquareText aria-hidden="true" className="h-4 w-4 text-ink-muted" /> Remarks <span className="font-normal text-ink-faint">(optional, added to Comments)</span>
        </label>
        <textarea
          id="task-remarks"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="e.g. Started after the vendor's confirmation"
          className="field-input h-auto py-2"
          data-testid="task-remarks"
        />
      </div>
      {children}
    </Remarks.Provider>
  );
}

// Inside each action's form: the remark travels as a hidden field.
export function RemarksField() {
  const remarks = useContext(Remarks);
  return remarks ? <input type="hidden" name="remarks" value={remarks.value} /> : null;
}

export const useRemarks = () => useContext(Remarks);
