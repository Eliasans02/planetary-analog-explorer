"""Validate the schema/dispatch contract only; never declares a science/demo PASS."""
from copy import deepcopy
from pathlib import Path
import json
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    schemas = [json.loads(path.read_text(encoding="utf-8")) for path in (
        ROOT / "shared/schemas/analog_location.schema.json",
        ROOT / "shared/schemas/scoring_profile.schema.json",
    )]
    for schema in schemas:
        Draft202012Validator.check_schema(schema)
    checker = FormatChecker()
    if checker.conforms("not-a-date", "date-time"):
        raise RuntimeError('Install "jsonschema[format]": date-time validation is not active')
    schema = schemas[0]
    validate = Draft202012Validator(schema, format_checker=checker)
    empty = {"schema_version": "1.0.0", "generated_at": "2026-11-14T00:00:00Z",
             "sources": [], "profiles": [], "comparisons": []}
    validate.validate(empty)
    checks = 3
    for field, bad in (("schema_version", "99"), ("generated_at", "not-a-date"), ("extra", True)):
        modified = deepcopy(empty)
        modified[field] = bad
        assert list(validate.iter_errors(modified)), field
        checks += 1
    missing = {"value": None, "unit": "1", "quantity": "TEST_ONLY", "method": "TEST_ONLY",
               "spatial_resolution_m": None, "support_window_m": None, "period": None,
               "source_ids": [], "missing_reason": "not_available"}
    feature = Draft202012Validator({"$defs": schema["$defs"], "$ref": "#/$defs/feature"}, format_checker=checker)
    feature.validate(missing)
    for key, bad in (("missing_reason", None), ("extra", True), ("value", 0)):
        modified = deepcopy(missing)
        modified[key] = bad
        assert list(feature.iter_errors(modified)), key
        checks += 1
    for owner in ("A", "B"):
        prompt = (ROOT / f"prompts/LOOP_0_DEV_{owner}.md").read_text(encoding="utf-8")
        assert "@@" not in prompt
        assert (ROOT / "shared/types/analog-location.ts").read_text(encoding="utf-8") in prompt
        assert (ROOT / "shared/schemas/analog_location.schema.json").read_text(encoding="utf-8") in prompt
        for marker in ("[CONTEXT_HEADER]", "[IMPLEMENTATION_SPEC]", "[SELF_VERIFICATION_TEST]"):
            assert marker in prompt
        checks += 1
    print(f"CONTRACT_CHECK_OK: {checks} checks; no scientific observations or demo assets validated")


if __name__ == "__main__":
    main()
