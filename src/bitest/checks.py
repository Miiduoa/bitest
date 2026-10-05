import csv
import statistics

def read_csv(path):
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))

def schema(rows):
    return tuple(rows[0].keys()) if rows else tuple()

def null_rate(rows, column):
    if not rows:
        return 0.0
    return sum(row.get(column, "") == "" for row in rows) / len(rows)

def duplicate_count(rows, key):
    seen = set()
    duplicates = 0
    for row in rows:
        value = row.get(key)
        if value in seen:
            duplicates += 1
        seen.add(value)
    return duplicates

def numeric_mean(rows, column):
    values = [float(row[column]) for row in rows if row.get(column, "") != ""]
    return statistics.fmean(values) if values else None

def compare(
    baseline,
    current,
    key=None,
    numeric_cols=(),
    max_row_change=0.25,
    max_null_increase=0.05,
    max_mean_change=0.20,
):
    results = []

    def add(name, ok, detail):
        results.append({"check": name, "ok": ok, "detail": detail})

    add("schema", schema(baseline) == schema(current), f"{schema(baseline)} -> {schema(current)}")

    baseline_count = max(len(baseline), 1)
    row_delta = (len(current) - len(baseline)) / baseline_count
    add("row_count", abs(row_delta) <= max_row_change, f"change={row_delta:.1%}")

    for column in schema(baseline):
        increase = null_rate(current, column) - null_rate(baseline, column)
        add(f"null_rate:{column}", increase <= max_null_increase, f"increase={increase:.1%}")

    if key:
        duplicates = duplicate_count(current, key)
        add(f"unique:{key}", duplicates == 0, f"duplicates={duplicates}")

    for column in numeric_cols:
        before = numeric_mean(baseline, column)
        after = numeric_mean(current, column)
        change = 0 if before in (None, 0) else (after - before) / before
        add(f"mean:{column}", abs(change) <= max_mean_change, f"change={change:.1%}")

    return results
