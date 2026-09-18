import unittest

from app.services.plan_converter import PlanConverter


class PlanConverterTests(unittest.TestCase):
    def test_builds_linear_flow_in_requested_direction(self):
        code = PlanConverter.to_mermaid("采集\n分析\n结论", "LR")

        self.assertIn("flowchart LR", code)
        self.assertIn("N1 --> N2", code)
        self.assertIn("N2 --> N3", code)

    def test_escapes_node_label_delimiters(self):
        code = PlanConverter.to_mermaid('输入[原始] "数据"')

        self.assertIn("输入(原始) '数据'", code)


if __name__ == "__main__":
    unittest.main()
