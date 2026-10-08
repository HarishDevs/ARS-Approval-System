# Builds docs/qa/QA-TEST-SUITE.md from the case files. Counts, IDs, suites and the
# RTM are computed so the summary always matches the tables.
import collections, glob, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
SEV = {"P0": "Critical", "P1": "High", "P2": "Medium", "P3": "Low"}
AUTO = {"Y": "Yes", "N": "No", "P": "Partial"}

SECTIONS = []  # (title, default_module, default_type, rows_text)
REQS = []      # (id, text)
EXTRA = {}     # named markdown blocks
for path in sorted(glob.glob(os.path.join(HERE, "c*.py"))):
    exec(open(path, encoding="utf8").read(), {"SECTIONS": SECTIONS, "REQS": REQS, "EXTRA": EXTRA})

cases = []
n = 0
for title, module, default_type, text in SECTIONS:
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in re.split(r"\s*\|\s*", line)]
        if len(parts) != 10:
            raise SystemExit(f"bad row ({len(parts)} fields) in {title}: {line[:90]}")
        mod, scen, pre, steps, data, exp, pri, typ, auto, tags = parts
        assert pri in SEV, (pri, line)
        assert auto in AUTO, (auto, line)
        n += 1
        cases.append({
            "id": f"APP-{n:03d}", "section": title, "module": mod or module, "scenario": scen, "pre": pre,
            "steps": steps, "data": data, "exp": exp, "pri": pri, "sev": SEV[pri], "type": typ or default_type,
            "auto": AUTO[auto], "tags": [t for t in tags.split(",") if t and t != "-"],
        })

def esc(text):
    return text.replace("\n", " ")

def table(rows):
    out = ["| Test Case ID | Module | Test Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Test Type | Automation Candidate | Status |",
           "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for c in rows:
        out.append("| " + " | ".join(esc(x) for x in [c["id"], c["module"], c["scenario"], c["pre"], c["steps"], c["data"], c["exp"], c["pri"], c["sev"], c["type"], c["auto"], "Not run"]) + " |")
    return "\n".join(out)

def ids(pred):
    return [c["id"] for c in cases if pred(c)]

def ranges(id_list):
    nums = sorted(int(i[4:]) for i in id_list)
    out, start, prev = [], None, None
    for x in nums:
        if start is None:
            start = prev = x
        elif x == prev + 1:
            prev = x
        else:
            out.append((start, prev)); start = prev = x
    if start is not None:
        out.append((start, prev))
    return ", ".join(f"APP-{a:03d}" if a == b else f"APP-{a:03d}–APP-{b:03d}" for a, b in out)

doc = [EXTRA["head"]]
section_no = 8
for title in [s[0] for s in SECTIONS if not s[0].startswith("_")]:
    pass
seen = []
for title, *_ in SECTIONS:
    if title not in seen:
        seen.append(title)
for title in seen:
    rows = [c for c in cases if c["section"] == title]
    doc.append(f"\n## {title}\n\n{EXTRA.get('intro:' + title, '')}\n\n{table(rows)}\n")

def suite(name, intro, flag):
    chosen = [c for c in cases if flag in c["tags"]]
    lines = [f"\n## {name}\n\n{intro}\n\n**{len(chosen)} cases:** {ranges([c['id'] for c in chosen])}\n",
             "| Test Case ID | Scenario | Priority |", "|---|---|---|"]
    lines += [f"| {c['id']} | {esc(c['scenario'])} | {c['pri']} |" for c in chosen]
    return "\n".join(lines) + "\n"

doc.append(suite("33. Smoke Suite", EXTRA["smoke"], "S"))
doc.append(suite("34. Sanity Suite", EXTRA["sanity"], "N"))
reg = [c for c in cases if c["pri"] in ("P0", "P1") or "R" in c["tags"]]
doc.append(f"\n## 35. Regression Suite\n\n{EXTRA['regression']}\n\n**{len(reg)} cases** (every P0 and P1 case, plus cases tagged for regression): {ranges([c['id'] for c in reg])}\n")
doc.append(suite("36. Critical Business Test Suite", EXTRA["critical"], "C"))
doc.append(EXTRA["datamatrix"])

# RTM
rtm = ["\n## 38. Requirement Traceability Matrix\n", EXTRA["rtm_intro"], "", "| Requirement ID | Requirement | Test Case IDs | Coverage | Status |", "|---|---|---|---|---|"]
for rid, text, coverage in REQS:
    linked = ids(lambda c, rid=rid: rid in c["tags"])
    cov = coverage if coverage else ("Covered" if len(linked) >= 3 else ("Partially covered" if linked else "Missing"))
    status = "Not run" if linked else "No test possible: requirement not built"
    rtm.append(f"| {rid} | {text} | {ranges(linked) or '—'} | {cov} | {status} |")
doc.append("\n".join(rtm) + "\n")
doc.append(EXTRA["defects"])
doc.append(EXTRA["automation"])

# Coverage summary
by_type = collections.Counter(c["type"] for c in cases)
by_section = collections.Counter(c["section"] for c in cases)
pri = collections.Counter(c["pri"] for c in cases)
auto = collections.Counter(c["auto"] for c in cases)
summary = ["\n## 41. QA Coverage Summary\n", "### By test type\n", "| Test type | Test Cases |", "|---|---:|"]
for typ, count in sorted(by_type.items(), key=lambda kv: -kv[1]):
    summary.append(f"| {typ} | {count} |")
summary.append(f"| **Total** | **{len(cases)}** |\n")
summary += ["### By section\n", "| Section | Test Cases |", "|---|---:|"]
for title in seen:
    summary.append(f"| {title} | {by_section[title]} |")
summary.append(f"| **Total** | **{len(cases)}** |\n")
summary += ["### Totals\n", "| Measure | Count |", "|---|---:|",
            f"| Total test cases | {len(cases)} |", f"| P0 (Critical) | {pri['P0']} |", f"| P1 (High) | {pri['P1']} |", f"| P2 (Medium) | {pri['P2']} |", f"| P3 (Low) | {pri['P3']} |",
            f"| Automation candidates (Yes) | {auto['Yes']} |", f"| Partial automation | {auto['Partial']} |", f"| Manual only (No) | {auto['No']} |",
            f"| Smoke suite | {len(ids(lambda c: 'S' in c['tags']))} |", f"| Sanity suite | {len(ids(lambda c: 'N' in c['tags']))} |",
            f"| Regression suite | {len(reg)} |", f"| Critical business suite | {len(ids(lambda c: 'C' in c['tags']))} |", ""]
summary.append(EXTRA["summary_tail"])
doc.append("\n".join(summary) + "\n")
doc.append(EXTRA["questions"])
doc.append(EXTRA["final"])

text = "\n".join(doc)
text = text.replace("{TOTAL}", str(len(cases)))
open(OUT, "w", encoding="utf8").write(text)
print(len(cases), "cases;", dict(pri), dict(auto))
print(dict(by_type))
