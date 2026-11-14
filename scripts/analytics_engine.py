#!/usr/bin/env python3
"""
Python Analytics & Sync Intelligence Engine for Man-day Scorecard.
Reads {"people": [...], "tickets": [...]} from stdin and outputs an AnalyticsReport JSON to stdout.
Uses Python standard library (json, math, statistics, datetime, sys) for zero-dependency portability.
"""

import datetime
import json
import math
import statistics
import sys
from typing import Any, Dict, List


def workflow_status_of(ticket: Dict[str, Any]) -> str:
    status = ticket.get("workflowStatus")
    if status:
        return str(status)
    if ticket.get("closed"):
        return "Done"
    if str(ticket.get("assigneeId", "")).strip():
        return "In Progress"
    return "Backlog"


def round1(val: float) -> float:
    return round(float(val) * 10.0) / 10.0


def round2(val: float) -> float:
    return round(float(val) * 100.0) / 100.0


def ols_slope(values: List[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mean_x = (n - 1) / 2.0
    mean_y = sum(values) / n
    num = sum((i - mean_x) * (values[i] - mean_y) for i in range(n))
    den = sum((i - mean_x) ** 2 for i in range(n))
    return 0.0 if den == 0 else num / den


def score_ticket_total(ticket: Dict[str, Any]) -> float:
    if not ticket.get("closed"):
        return 0.0
    variance = ticket.get("varianceCode", "NONE")
    waived = variance in ("REQ", "BLK", "ENV")
    offset = int(ticket.get("weekOffset", 0) or 0)
    week_pts = 40 if (waived or offset <= 0) else (20 if offset == 1 else 0)

    est = float(ticket.get("estimateMd", 0) or 0)
    act = float(ticket.get("actualMd", 0) or 0)
    ratio = act / est if est > 0 else 0.0
    if waived or (0.8 <= ratio <= 1.5):
        acc_pts = 20
    elif 0.5 <= ratio <= 2.0:
        acc_pts = 10
    else:
        acc_pts = 0

    rounds = int(ticket.get("reviewRounds", 0) or 0)
    blocker = bool(ticket.get("blocker", False))
    if not blocker and rounds <= 2:
        rev_pts = 20
    elif not blocker and rounds == 3:
        rev_pts = 10
    else:
        rev_pts = 0

    reopens = int(ticket.get("reopenCount", 0) or 0)
    reopen_pts = 20 if reopens <= 0 else (10 if reopens == 1 else 0)
    return float(week_pts + acc_pts + rev_pts + reopen_pts)


def analyze(payload: Dict[str, Any]) -> Dict[str, Any]:
    people: List[Dict[str, Any]] = payload.get("people", [])
    tickets: List[Dict[str, Any]] = payload.get("tickets", [])
    person_map = {p.get("id"): p for p in people}

    # 1. Z-Score statistics by ticket size
    ratios_by_size: Dict[str, List[float]] = {}
    for t in tickets:
        est = float(t.get("estimateMd", 0) or 0)
        act = float(t.get("actualMd", 0) or 0)
        if t.get("closed") and est > 0:
            sz = str(t.get("size", "M"))
            ratios_by_size.setdefault(sz, []).append(act / est)

    size_stats: Dict[str, Dict[str, float]] = {}
    for sz, vals in ratios_by_size.items():
        mean = statistics.mean(vals) if vals else 1.0
        stdev = statistics.stdev(vals) if len(vals) > 1 else 0.0
        size_stats[sz] = {"mean": mean, "stdev": stdev}

    issues: List[Dict[str, Any]] = []
    tickets_with_issue = set()
    outlier_count = 0

    for t in tickets:
        tid = str(t.get("id", ""))
        status = workflow_status_of(t)
        assignee_id = str(t.get("assigneeId", "")).strip()
        person = person_map.get(assignee_id)
        assignee = person.get("nickname", "ยังไม่มีผู้รับ") if person else "ยังไม่มีผู้รับ"
        track_label = "R&D" if t.get("track") == "RD" else "Implement"
        title = str(t.get("title") or t.get("module") or tid).strip()

        if status in ("Code Review", "Ready for QA", "In QA", "Done") and not str(t.get("mrLink") or "").strip():
            issues.append({
                "ticketId": tid,
                "title": title,
                "trackLabel": track_label,
                "assignee": assignee,
                "issueType": "missing-mr-link",
                "severity": "High",
                "detail": f"สถานะ {status} แต่ยังไม่มีลิงก์ Merge Request (mygit)",
            })
            tickets_with_issue.add(tid)

        if status != "Backlog" and not t.get("firstDueOn"):
            issues.append({
                "ticketId": tid,
                "title": title,
                "trackLabel": track_label,
                "assignee": assignee,
                "issueType": "missing-first-due",
                "severity": "Medium",
                "detail": "เริ่มงานแล้วแต่ยังไม่ได้ล็อกวันส่งครั้งแรก (firstDueOn)",
            })
            tickets_with_issue.add(tid)

        if status != "Backlog" and not t.get("storyPoints"):
            issues.append({
                "ticketId": tid,
                "title": title,
                "trackLabel": track_label,
                "assignee": assignee,
                "issueType": "missing-story-points",
                "severity": "Low",
                "detail": "ยังไม่ได้ระบุ Story Points บนบอร์ด",
            })
            tickets_with_issue.add(tid)

        if status != "Backlog" and not assignee_id:
            issues.append({
                "ticketId": tid,
                "title": title,
                "trackLabel": track_label,
                "assignee": assignee,
                "issueType": "unassigned-active",
                "severity": "High",
                "detail": f"ใบงานอยู่ในสถานะ {status} แต่ยังไม่มีผู้รับผิดชอบ",
            })
            tickets_with_issue.add(tid)

        if t.get("closed") and t.get("workCategory") in ("BugInternal", "BugProduction") and not t.get("bugCause"):
            issues.append({
                "ticketId": tid,
                "title": title,
                "trackLabel": track_label,
                "assignee": assignee,
                "issueType": "bug-missing-cause",
                "severity": "Medium",
                "detail": "ใบงาน Bug ปิดแล้วแต่ยังไม่ระบุสาเหตุ (Bug Cause)",
            })
            tickets_with_issue.add(tid)

        est = float(t.get("estimateMd", 0) or 0)
        act = float(t.get("actualMd", 0) or 0)
        if est > 0 and act > 0:
            ratio = act / est
            stats = size_stats.get(str(t.get("size", "M")), {"mean": 1.0, "stdev": 0.0})
            z = (ratio - stats["mean"]) / stats["stdev"] if stats["stdev"] > 0.05 else 0.0
            if z >= 1.8 or ratio >= 1.75:
                outlier_count += 1
                issues.append({
                    "ticketId": tid,
                    "title": title,
                    "trackLabel": track_label,
                    "assignee": assignee,
                    "issueType": "actual-md-outlier",
                    "severity": "High" if ratio >= 2.0 else "Medium",
                    "detail": f"Actual/Estimate = {round2(ratio)}x (Z-Score {round2(z)}) สูงกว่าค่าปกติของขนาด {t.get('size')}",
                    "zScore": round2(z),
                })
                tickets_with_issue.add(tid)

    total_tickets = len(tickets)
    clean_tickets = max(0, total_tickets - len(tickets_with_issue))
    readiness_score = round((clean_tickets / total_tickets) * 100) if total_tickets > 0 else 100

    # 2. Delivery Risk Radar
    open_count_by_person: Dict[str, int] = {}
    for t in tickets:
        if not t.get("closed") and t.get("assigneeId"):
            aid = str(t.get("assigneeId"))
            open_count_by_person[aid] = open_count_by_person.get(aid, 0) + 1

    delivery_risks: List[Dict[str, Any]] = []
    for t in tickets:
        if t.get("closed"):
            continue
        reasons: List[str] = []
        score = 15
        est = float(t.get("estimateMd", 0) or 0)
        act = float(t.get("actualMd", 0) or 0)
        ratio = act / est if est > 0 else 0.0
        if ratio > 1.5:
            score += 40
            reasons.append(f"ใช้เวลาจริงเกิน Estimate ไปแล้ว ({round2(ratio)}x)")
        elif ratio > 1.0:
            score += 25
            reasons.append(f"เวลาจริงแตะ/เกิน Estimate ({round2(ratio)}x)")

        days_left = t.get("workingDaysLeft")
        if days_left is not None and int(days_left) <= 1:
            score += 30
            reasons.append(f"เหลือเวลาในสัปดาห์ที่ commit เพียง {days_left} วัน")
        elif days_left is not None and int(days_left) <= 2:
            score += 15
            reasons.append(f"เหลือเวลาทำงาน {days_left} วัน")

        aid = str(t.get("assigneeId", "")).strip()
        wip = open_count_by_person.get(aid, 0)
        if wip > 2:
            score += 15
            reasons.append(f"ผู้รับถือ WIP เกินเกณฑ์ ({wip} ใบ)")
        if not aid:
            score += 20
            reasons.append("ยังไม่มีผู้รับผิดชอบใบงาน")
        reopens = int(t.get("reopenCount", 0) or 0)
        if reopens > 0:
            score += 15
            reasons.append(f"ถูกตีกลับ (Reopen {reopens} ครั้ง)")

        capped = min(100, score)
        risk_level = "สูงมาก" if capped >= 65 else ("ปานกลาง" if capped >= 40 else "ต่ำ")
        if not reasons:
            reasons.append("อยู่ในเกณฑ์ปกติ")

        person = person_map.get(aid)
        delivery_risks.append({
            "ticketId": str(t.get("id", "")),
            "title": str(t.get("title") or t.get("module") or ""),
            "module": str(t.get("module") or "ทั่วไป"),
            "assigneeId": aid,
            "assignee": person.get("nickname", "ยังไม่มีผู้รับ") if person else "ยังไม่มีผู้รับ",
            "trackLabel": "R&D" if t.get("track") == "RD" else "Implement",
            "status": workflow_status_of(t),
            "estimateMd": est,
            "actualMd": act,
            "workingDaysLeft": days_left,
            "riskScore": capped,
            "riskLevel": risk_level,
            "reasons": reasons,
        })
    delivery_risks.sort(key=lambda item: item["riskScore"], reverse=True)

    # 3. Bottlenecks
    by_module: Dict[str, List[Dict[str, Any]]] = {}
    variance_counts: Dict[str, int] = {}
    bug_causes: Dict[str, int] = {}

    for t in tickets:
        mod = str(t.get("module") or "ทั่วไป")
        by_module.setdefault(mod, []).append(t)
        vc = str(t.get("varianceCode") or "NONE")
        if vc and vc != "NONE":
            variance_counts[vc] = variance_counts.get(vc, 0) + 1
        bc = str(t.get("bugCause") or "")
        if bc:
            bug_causes[bc] = bug_causes.get(bc, 0) + 1

    modules: List[Dict[str, Any]] = []
    for mod, items in by_module.items():
        cnt = len(items)
        avg_rev = sum(int(i.get("reviewRounds", 0) or 0) for i in items) / cnt
        reopen_total = sum(int(i.get("reopenCount", 0) or 0) for i in items)
        ratios = [
            float(i.get("actualMd", 0) or 0) / float(i.get("estimateMd", 1))
            for i in items
            if float(i.get("estimateMd", 0) or 0) > 0
        ]
        avg_ratio = sum(ratios) / len(ratios) if ratios else 1.0
        slipped = sum(1 for i in items if int(i.get("weekOffset", 0) or 0) > 0)
        modules.append({
            "module": mod,
            "ticketCount": cnt,
            "avgReviewRounds": round2(avg_rev),
            "reopenTotal": reopen_total,
            "avgRatio": round2(avg_ratio),
            "slipRatePct": round1((slipped / cnt) * 100.0),
        })
    modules.sort(key=lambda m: (m["reopenTotal"], m["avgReviewRounds"]), reverse=True)

    total_var = sum(variance_counts.values()) or 1
    variance_breakdown = [
        {"code": k, "count": v, "pct": round1((v / total_var) * 100.0)}
        for k, v in variance_counts.items()
    ]
    total_bug = sum(bug_causes.values()) or 1
    bug_cause_breakdown = [
        {"cause": k, "count": v, "pct": round1((v / total_bug) * 100.0)}
        for k, v in bug_causes.items()
    ]

    # 4. Coaching Insights & OLS Slope
    coaching_insights: List[Dict[str, Any]] = []
    for p in people:
        pid = str(p.get("id", ""))
        closed = [t for t in tickets if t.get("assigneeId") == pid and t.get("closed")]
        denom = len(closed) or 1
        accurate = sum(
            1
            for t in closed
            if float(t.get("estimateMd", 0) or 0) > 0
            and 0.8 <= (float(t.get("actualMd", 0) or 0) / float(t.get("estimateMd", 1))) <= 1.5
        )
        ontime = sum(
            1
            for t in closed
            if int(t.get("weekOffset", 0) or 0) == 0 or t.get("varianceCode") in ("REQ", "BLK", "ENV")
        )
        first_pass = sum(
            1
            for t in closed
            if int(t.get("reviewRounds", 0) or 0) <= 2
            and not t.get("blocker")
            and int(t.get("reopenCount", 0) or 0) == 0
        )

        est_pct = round1((accurate / denom) * 100.0)
        ontime_pct = round1((ontime / denom) * 100.0)
        fp_pct = round1((first_pass / denom) * 100.0)

        month_avgs: List[float] = []
        for m in ("2025-08", "2025-09", "2025-10"):
            m_tickets = [t for t in closed if str(t.get("closedOn") or "").startswith(m)]
            if m_tickets:
                month_avgs.append(sum(score_ticket_total(t) for t in m_tickets) / len(m_tickets))

        slope = ols_slope(month_avgs)
        trend_label = (
            "กำลังพัฒนาขึ้นต่อเนื่อง"
            if slope > 1.2
            else ("แนวโน้มลดลง ควรช่วยปลดล็อก" if slope < -1.2 else "รักษามาตรฐานสม่ำเสมอ")
        )
        dev_idx = round1(sum(score_ticket_total(t) for t in closed) / len(closed)) if closed else None

        strengths: List[str] = []
        if ontime_pct >= 85:
            strengths.append("ส่งมอบตรงสัปดาห์แม่นยำ")
        if fp_pct >= 85:
            strengths.append("คุณภาพโค้ดและ DoD ผ่านรอบแรกสูง")
        if est_pct >= 80:
            strengths.append("ประเมินขนาดงาน (Estimate) แม่นยำ")
        strength_note = " · ".join(strengths) if strengths else "รับผิดชอบงานตามแผนสปรินต์"

        if est_pct < 70:
            coaching_focus = "แนะนำให้ซอยใบงานขนาด L/XL เป็นใบย่อยก่อนตั้ง Estimate MD"
        elif fp_pct < 75:
            coaching_focus = "ควรทำ Self-checklist ด้าน Boundary/DoD ก่อนเปิด Merge Request"
        elif ontime_pct < 75:
            coaching_focus = "ควรแจ้ง Blocker/Variance ตั้งแต่วันที่ 2 ของสัปดาห์เมื่อเริ่มเห็นแนวโน้มเกินแผน"
        else:
            coaching_focus = "รักษาจังหวะการทำงานและแบ่งปันเทคนิคการประเมินงานให้ทีม"

        coaching_insights.append({
            "personId": pid,
            "nickname": p.get("nickname", pid),
            "role": p.get("role", ""),
            "trackLabel": "R&D" if p.get("track") == "RD" else "Implement",
            "developmentIndex": dev_idx,
            "trendSlope": round2(slope),
            "trendLabel": trend_label,
            "estimationAccuracyPct": est_pct,
            "onTimePct": ontime_pct,
            "firstPassPct": fp_pct,
            "openWipCount": open_count_by_person.get(pid, 0),
            "strengthNote": strength_note,
            "coachingFocus": coaching_focus,
        })

    return {
        "engine": "python",
        "pythonVersion": sys.version.split()[0],
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "syncHygiene": {
            "readinessScore": readiness_score,
            "totalTickets": total_tickets,
            "cleanTickets": clean_tickets,
            "issueCount": len(issues),
            "outlierCount": outlier_count,
            "issues": issues,
        },
        "deliveryRisks": delivery_risks,
        "bottlenecks": {
            "modules": modules,
            "varianceBreakdown": variance_breakdown,
            "bugCauseBreakdown": bug_cause_breakdown,
        },
        "coachingInsights": coaching_insights,
    }


def main() -> None:
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else {}
    report = analyze(payload)
    sys.stdout.write(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
