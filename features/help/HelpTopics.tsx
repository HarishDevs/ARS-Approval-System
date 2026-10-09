"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// #13 help: short how-tos and what each status means, searchable on the page.
export interface HelpTopic {
  id: string;
  group: "How to" | "Statuses" | "Approval steps";
  title: string;
  body: string;
  link?: { href: string; label: string };
}

export function filterTopics(topics: readonly HelpTopic[], query: string): HelpTopic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length === 0 ? [...topics] : topics.filter((topic) => words.every((word) => `${topic.title} ${topic.body}`.toLowerCase().includes(word)));
}

export function HelpTopics({ topics }: { topics: HelpTopic[] }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterTopics(topics, query), [query, topics]);
  const groups = [...new Set(shown.map((topic) => topic.group))];
  return (
    <div className="space-y-6">
      <div className="max-w-xl">
        <label htmlFor="help-search" className="field-label">
          Search help
        </label>
        <input id="help-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. on hold, delegate, draft" className="field-input" />
      </div>
      {shown.length === 0 && <p className="text-label text-ink-muted">Nothing matches. Try another word, or ask IT.</p>}
      {groups.map((group) => (
        <section key={group} className="card" aria-label={group}>
          <h2 className="border-b border-line px-5 py-4 font-semibold">{group}</h2>
          <dl className="divide-y divide-line">
            {shown
              .filter((topic) => topic.group === group)
              .map((topic) => (
                <div key={topic.id} className="px-5 py-3">
                  <dt className="font-medium">{topic.title}</dt>
                  <dd className="mt-0.5 text-label text-ink-muted">
                    {topic.body}{" "}
                    {topic.link && (
                      <Link href={topic.link.href} className="link">
                        {topic.link.label}
                      </Link>
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
