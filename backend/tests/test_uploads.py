import unittest

from backend.ai import build_rag_user_prompt, sanitize_model_text
from backend.uploads import build_storage_path, sanitize_file_name


class UploadHelpersTestCase(unittest.TestCase):
    def test_sanitize_file_name_removes_unsafe_characters(self) -> None:
        self.assertEqual(sanitize_file_name("q1 report (final).pdf"), "q1_report__final_.pdf")

    def test_build_storage_path_includes_user_and_file_name(self) -> None:
        path = build_storage_path("user-123", "hello.txt")
        self.assertTrue(path.startswith("user-123/"))
        self.assertTrue(path.endswith("-hello.txt"))

    def test_build_rag_user_prompt_includes_question_and_context(self) -> None:
        prompt = build_rag_user_prompt("What changed in revenue?", ["doc-a", "doc-b"])
        self.assertIn("What changed in revenue?", prompt)
        self.assertIn("[1] doc-a", prompt)
        self.assertIn("[2] doc-b", prompt)

    def test_sanitize_model_text_removes_qwen_thinking_blocks(self) -> None:
        text = sanitize_model_text("<think>internal reasoning</think>\nFinal answer")
        self.assertEqual(text, "Final answer")


if __name__ == "__main__":
    unittest.main()
