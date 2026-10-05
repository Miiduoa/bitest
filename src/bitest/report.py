def markdown(results):
    lines = [
        "# BI regression report",
        "",
        "| Check | Status | Detail |",
        "|---|---|---|",
    ]
    for result in results:
        status = "PASS" if result["ok"] else "FAIL"
        lines.append(f'| {result["check"]} | {status} | {result["detail"]} |')

    failed = sum(not result["ok"] for result in results)
    lines += ["", f"Failed checks: **{failed}**"]
    return "\n".join(lines) + "\n"
