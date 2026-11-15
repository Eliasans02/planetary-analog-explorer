"""TEST_ONLY archives; no Earth/Moon/Mars observations or application execution."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import stat
import struct
import tempfile
import unittest
import warnings
import zipfile

from review_bundle import BundleError, build_review_bundle, MAX_ENTRY_BYTES


class ReviewBundleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="pae_review_tests_")
        self.root = Path(self.temp.name).resolve()
        self.assertTrue(self.root.name.startswith("pae_review_tests_"))
        self.addCleanup(self.temp.cleanup)
        self.archive = self.root / "input.zip"
        self.out = self.root / "incoming" / "review"

    def zip(self, members: list[tuple[str | zipfile.ZipInfo, bytes]], compression=zipfile.ZIP_STORED) -> None:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(self.archive, "w", compression=compression) as archive:
                for name, value in members:
                    archive.writestr(name, value)

    def rejected_without_writes(self, code: str | None = None) -> None:
        with self.assertRaises(BundleError) as context:
            build_review_bundle(self.archive, self.out, project_root=self.root)
        if code is not None:
            self.assertEqual(str(context.exception), code)
        self.assertFalse(self.out.exists())
        self.assertFalse((self.root / "incoming").exists())

    def test_normal_archive_and_actual_hashes(self) -> None:
        source = b"export const value = 7; // TEST_ONLY\n"
        self.zip([("src/main.ts", source), ("package.json", b'{"scripts":{"build":"vite build"}}'),
                  ("image.bin", b"\x00\xff\x01")])
        original = self.archive.read_bytes()
        result = build_review_bundle(self.archive, self.out, project_root=self.root)
        output = self.out / "REVIEW_BUNDLE.json"
        bundle = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(bundle["original_archive_sha256"], hashlib.sha256(original).hexdigest())
        self.assertEqual(result["bundle_sha256"], hashlib.sha256(output.read_bytes()).hexdigest())
        self.assertEqual((self.out / "source/src/main.ts").read_bytes(), source)
        included = {entry["path"]: entry for entry in bundle["files"]}
        self.assertEqual(included["src/main.ts"]["contents"].encode("utf-8"), source)
        self.assertEqual(included["src/main.ts"]["sha256"], hashlib.sha256(source).hexdigest())
        self.assertNotIn("image.bin", included)
        self.assertFalse(bundle["handling"]["code_executed"])

    def test_traversal_absolute_drive_unc_backslash_and_windows_names(self) -> None:
        bad_names = ["../escape.ts", "/absolute.ts", "C:/drive.ts", "//server/a.ts",
                     "src\\..\\escape.ts", "src/../escape.ts", "src/./a.ts",
                     "src//a.ts", "src/a.ts:secret", "src/con.txt", "src/file. "]
        for name in bad_names:
            with self.subTest(name=name):
                self.zip([(name, b"TEST_ONLY")])
                self.rejected_without_writes()

    def test_symlink_and_nonregular_zip_members(self) -> None:
        for kind in (stat.S_IFLNK, stat.S_IFIFO, stat.S_IFSOCK):
            with self.subTest(kind=kind):
                member = zipfile.ZipInfo("src/link")
                member.create_system = 3
                member.external_attr = (kind | 0o777) << 16
                self.zip([(member, b"../../TEST_ONLY")])
                self.rejected_without_writes("non_regular_archive_entry")

    def test_duplicate_case_parent_case_and_file_directory_collisions(self) -> None:
        for names in [("src/a.ts", "src/a.ts"), ("src/a.ts", "src/A.ts"),
                      ("Dir/a.ts", "dir/b.ts"), ("src", "src/a.ts")]:
            with self.subTest(names=names):
                self.zip([(names[0], b"x"), (names[1], b"y")])
                self.rejected_without_writes()

    def test_declared_entry_size_limit_before_payload(self) -> None:
        self.zip([("source.ts", b"TEST_ONLY")])
        data = bytearray(self.archive.read_bytes())
        central = data.index(b"PK\x01\x02")
        struct.pack_into("<I", data, central + 24, MAX_ENTRY_BYTES + 1)
        self.archive.write_bytes(data)
        self.rejected_without_writes("entry_expanded_size_limit")

    def test_declared_total_size_limit_before_payload(self) -> None:
        self.zip([(f"source{i}.ts", b"TEST_ONLY") for i in range(11)])
        data = bytearray(self.archive.read_bytes())
        offset = 0
        for _ in range(11):
            central = data.index(b"PK\x01\x02", offset)
            # Plausible individual ratio; total alone must reject before reads.
            struct.pack_into("<II", data, central + 20, 65536, MAX_ENTRY_BYTES)
            offset = central + 46
        self.archive.write_bytes(data)
        self.rejected_without_writes("total_expanded_size_limit")

    def test_unsupported_compression_rejected(self) -> None:
        self.zip([("source.ts", b"TEST_ONLY")], zipfile.ZIP_BZIP2)
        self.rejected_without_writes("compression_method_not_supported")

    def test_empty_deflated_directory_supported(self) -> None:
        self.zip([("src/", b""), ("src/main.ts", b"TEST_ONLY")], zipfile.ZIP_DEFLATED)
        build_review_bundle(self.archive, self.out, project_root=self.root)
        self.assertEqual((self.out / "source/src/main.ts").read_bytes(), b"TEST_ONLY")

    def test_ratio_bomb_before_any_writes(self) -> None:
        self.zip([("source.ts", b"A" * 100_000)], zipfile.ZIP_DEFLATED)
        self.rejected_without_writes("compression_ratio_limit")

    def test_declared_count_limit_before_zipinfo_allocation(self) -> None:
        self.zip([("source.ts", b"TEST_ONLY")])
        data = bytearray(self.archive.read_bytes())
        end = data.rindex(b"PK\x05\x06")
        struct.pack_into("<HH", data, end + 8, 2001, 2001)
        self.archive.write_bytes(data)
        self.rejected_without_writes("entry_count_limit")

    def test_corrupt_payload_crc_prevents_any_writes(self) -> None:
        self.zip([("source.ts", b"TEST_ONLY")])
        data = bytearray(self.archive.read_bytes())
        data[data.index(b"TEST_ONLY")] ^= 1
        self.archive.write_bytes(data)
        self.rejected_without_writes("invalid_or_corrupt_archive")

    def test_existing_destination_is_untouched(self) -> None:
        self.zip([("src/main.ts", b"TEST_ONLY")])
        self.out.mkdir(parents=True)
        sentinel = self.out / "existing.txt"
        sentinel.write_text("keep", encoding="utf-8")
        with self.assertRaisesRegex(BundleError, "destination_already_exists"):
            build_review_bundle(self.archive, self.out, project_root=self.root)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")
        self.assertEqual(list(self.out.iterdir()), [sentinel])

    def test_outside_incoming_rejected(self) -> None:
        self.zip([("source.ts", b"TEST_ONLY")])
        outside = self.root / "elsewhere"
        with self.assertRaisesRegex(BundleError, "destination_outside_incoming"):
            build_review_bundle(self.archive, outside, project_root=self.root)
        self.assertFalse(outside.exists())

    def test_existing_parent_link_rejected_when_os_supports_creation(self) -> None:
        self.zip([("source.ts", b"TEST_ONLY")])
        outside = self.root / "outside"
        outside.mkdir()
        try:
            (self.root / "incoming").symlink_to(outside, target_is_directory=True)
        except OSError:
            self.skipTest("OS account cannot create filesystem symlinks; ZIP symlinks still tested")
        with self.assertRaisesRegex(BundleError, "destination_link_or_reparse"):
            build_review_bundle(self.archive, self.out, project_root=self.root)
        self.assertEqual(list(outside.iterdir()), [])

    def test_sensitive_files_and_credential_values_not_embedded_or_extracted(self) -> None:
        sensitive_value = "TESTONLY_sensitive_value_12345"
        self.zip([
            (".env", b"SOME_SETTING=not_for_external_review"),
            (".env.example", b"GEMINI_API_KEY=your-key-here\n"),
            ("src/config.ts", ('export const apiKey = "' + sensitive_value + '";').encode()),
            ("private.pem", b"-----BEGIN PRIVATE KEY-----\nTEST_ONLY\n"),
            ("src/main.ts", b"const key = process.env.GEMINI_API_KEY;\n"),
        ])
        build_review_bundle(self.archive, self.out, project_root=self.root)
        raw = (self.out / "REVIEW_BUNDLE.json").read_text(encoding="utf-8")
        self.assertNotIn(sensitive_value, raw)
        self.assertNotIn("src/config.ts", raw)
        self.assertNotIn("private.pem", raw)
        self.assertFalse((self.out / "source/.env").exists())
        self.assertFalse((self.out / "source/src/config.ts").exists())
        self.assertTrue((self.out / "source/.env.example").is_file())
        self.assertTrue((self.out / "source/src/main.ts").is_file())
        data = json.loads(raw)
        self.assertTrue(all(entry["path"] is None for entry in data["excluded"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
