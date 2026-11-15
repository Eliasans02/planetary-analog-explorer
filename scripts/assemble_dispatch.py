"""Embed the exact versioned contracts in browser-only Hydrogen prompts."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    schema = (ROOT / "shared/schemas/analog_location.schema.json").read_text(encoding="utf-8")
    types = (ROOT / "shared/types/analog-location.ts").read_text(encoding="utf-8")
    semantics = (ROOT / "docs/contract_semantics.md").read_text(encoding="utf-8")
    for owner in ("A", "B"):
        template = (ROOT / f"prompts/LOOP_0_DEV_{owner}.template.txt").read_text(encoding="utf-8")
        assert template.count("@@DATASET_SCHEMA@@") == 1
        assert template.count("@@SHARED_TS@@") == 1
        prompt = template.replace("@@DATASET_SCHEMA@@", schema).replace("@@SHARED_TS@@", types)
        prompt += "\n\n[CONTRACT_SEMANTICS — обязательные межполе́вые проверки]\n" + semantics
        assert "@@" not in prompt
        # Four backticks contain the existing triple-backtick code snippets.
        output = "Скопируйте весь текст внутри внешнего блока в Gemini. Контракт уже внедрён.\n\n````markdown\n" + prompt + "\n````\n"
        destination = ROOT / f"prompts/LOOP_0_DEV_{owner}.md"
        destination.write_text(output, encoding="utf-8", newline="\n")
        print(json.dumps({"path": str(destination.relative_to(ROOT)), "bytes": destination.stat().st_size,
                          "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
