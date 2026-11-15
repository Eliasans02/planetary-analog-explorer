"""Astra / GPT-6.1 Sol: URL literal regressions, requiring no network access."""

import socket

import pytest

from pae_pipeline.sources import ManifestValidationError, validate_https_url


@pytest.mark.parametrize("host", [
    "127.1", "2130706433", "0x7f000001", "0177.0.0.1",
    "127.0.1", "0x7f.0.0.1", "127.0.0.01", "4294967295",
    "127.0.0.1.", "[::1]", "[::ffff:127.0.0.1]", "%31%32%37.0.0.1",
    "example.123", "example.org\\evil", "example..org", "100.64.0.1",
])
def test_ambiguous_and_local_literals_rejected_without_dns(monkeypatch, host):
    def deny_network(*args, **kwargs):
        raise AssertionError("URL validation must not resolve or connect")

    monkeypatch.setattr(socket, "getaddrinfo", deny_network)
    monkeypatch.setattr(socket, "socket", deny_network)
    with pytest.raises(ManifestValidationError):
        validate_https_url(f"https://{host}/file.tif")


@pytest.mark.parametrize("host", ["example.org", "data.nasa.gov", "8.8.8.8", "[2606:4700:4700::1111]"])
def test_conventional_public_hosts_remain_valid_without_dns(monkeypatch, host):
    def deny_network(*args, **kwargs):
        raise AssertionError("URL validation must not resolve or connect")

    monkeypatch.setattr(socket, "getaddrinfo", deny_network)
    monkeypatch.setattr(socket, "socket", deny_network)
    url = f"https://{host}/file.tif"
    assert validate_https_url(url) == url
