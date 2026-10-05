import unittest
from src.bitest.checks import compare

class CheckTests(unittest.TestCase):
    def test_clean_dataset_passes(self):
        baseline = [{"id":"1","x":"10"},{"id":"2","x":"12"}]
        current = [{"id":"3","x":"11"},{"id":"4","x":"12"}]
        self.assertTrue(all(item["ok"] for item in compare(
            baseline, current, key="id", numeric_cols=["x"]
        )))

    def test_duplicate_fails(self):
        baseline = [{"id":"1","x":"10"},{"id":"2","x":"12"}]
        current = [{"id":"3","x":"10"},{"id":"3","x":"12"}]
        result = compare(baseline, current, key="id")
        unique_check = next(item for item in result if item["check"] == "unique:id")
        self.assertFalse(unique_check["ok"])

if __name__ == "__main__":
    unittest.main()
