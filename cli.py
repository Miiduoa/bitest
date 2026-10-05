import argparse
from src.bitest import compare, markdown, read_csv

parser = argparse.ArgumentParser()
parser.add_argument("baseline")
parser.add_argument("current")
parser.add_argument("--key")
parser.add_argument("--numeric", action="append", default=[])
parser.add_argument("--report", default="report.md")
args = parser.parse_args()

results = compare(
    read_csv(args.baseline),
    read_csv(args.current),
    key=args.key,
    numeric_cols=args.numeric,
)
report = markdown(results)
with open(args.report, "w", encoding="utf-8") as handle:
    handle.write(report)

print(report, end="")
raise SystemExit(1 if any(not result["ok"] for result in results) else 0)
