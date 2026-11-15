"""Fatal production gate; all fixture values here are test-only."""
from pathlib import Path

import pytest

from pae_pipeline.terrain import (
    TerrainContractBlockedError, TerrainValidationError, extract_terrain,
)


@pytest.mark.parametrize("frame", [None, "earth_wgs84", "moon_iau_planetocentric", "mars_iau_planetocentric"])
def test_public_extraction_is_fatal_and_has_no_profile_bypass(frame: str | None) -> None:
    # Nonexistent sources prove the gate runs before source reads or diagnostics.
    with pytest.raises(TerrainContractBlockedError, match="TERRAIN_CONTRACT_BLOCKED") as exc:
        extract_terrain(Path("absent_dem.tif"), Path("absent_aoi.geojson"), {
            "contract_exportable": True, "allow_approximate": True,
            "schema_version": "1.0.0",
        }, aoi_frame=frame)
    assert isinstance(exc.value, ValueError)
    assert not isinstance(exc.value, TerrainValidationError)


@pytest.mark.parametrize("mode", ["prepare", "offline"])
def test_cli_gate_precedes_all_source_and_staging_side_effects(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], mode: str,
) -> None:
    import fetch_and_score

    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("Preparation side effect happened before contract gate")

    monkeypatch.setattr(fetch_and_score, "load_manifest", forbidden)
    monkeypatch.setattr(fetch_and_score, "load_scoring_profiles", forbidden)
    monkeypatch.setattr(fetch_and_score.tempfile, "mkdtemp", forbidden)
    monkeypatch.setattr(fetch_and_score, "ensure_verified_local_file", forbidden)
    monkeypatch.setattr(fetch_and_score, "extract_terrain", forbidden)
    output = tmp_path / "web-client" / "public" / "data" / "dataset.json"
    assert fetch_and_score.main(["--mode", mode, "--output", str(output)]) == 1
    assert "TERRAIN_CONTRACT_BLOCKED" in capsys.readouterr().err
    assert not output.parent.exists()
