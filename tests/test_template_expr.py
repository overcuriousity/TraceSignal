"""Unit tests for the W6 log-template normalization expression builder."""

import re

from vestigo.db._template import (
    _TEMPLATE_PATTERNS,
    template_hash_expr,
    template_normalize_expr,
)


class TestPatternOrder:
    def test_timestamp_before_digits(self):
        placeholders = [p for _, p in _TEMPLATE_PATTERNS]
        assert placeholders.index("<TS>") < placeholders.index("<NUM>")

    def test_uuid_before_hex_and_digits(self):
        placeholders = [p for _, p in _TEMPLATE_PATTERNS]
        assert placeholders.index("<UUID>") < placeholders.index("<HEX>")
        assert placeholders.index("<UUID>") < placeholders.index("<NUM>")

    def test_mac_before_hex(self):
        placeholders = [p for _, p in _TEMPLATE_PATTERNS]
        assert placeholders.index("<MAC>") < placeholders.index("<HEX>")

    def test_ipv4_before_digits(self):
        placeholders = [p for _, p in _TEMPLATE_PATTERNS]
        assert placeholders.index("<IP>") < placeholders.index("<NUM>")

    def test_digits_last(self):
        assert _TEMPLATE_PATTERNS[-1][1] == "<NUM>"


class TestPatternsAreRe2Safe:
    def test_no_backreferences_or_lookaround(self):
        for pattern, _ in _TEMPLATE_PATTERNS:
            assert "(?=" not in pattern
            assert "(?!" not in pattern
            assert "(?<" not in pattern
            assert not re.search(r"\\[1-9]", pattern)

    def test_patterns_compile_as_python_regex(self):
        # Not proof of RE2 compatibility, but catches basic authoring typos.
        for pattern, _ in _TEMPLATE_PATTERNS:
            re.compile(pattern)


class TestNormalizeExprMasking:
    """Apply each pattern with Python's re engine as a stand-in for RE2 to
    verify masking behavior end-to-end (order + placeholder correctness),
    since RE2 itself isn't available in the unit-test tier."""

    @staticmethod
    def _apply(text: str) -> str:
        result = text
        for pattern, placeholder in _TEMPLATE_PATTERNS:
            result = re.sub(pattern, placeholder, result)
        return result

    def test_masks_uuid(self):
        out = self._apply("session 550e8400-e29b-41d4-a716-446655440000 started")
        assert out == "session <UUID> started"

    def test_masks_ipv4(self):
        out = self._apply("Allow TCP 10.0.0.5:4433 -> 10.0.0.9:443")
        assert out == "Allow TCP <IP>:<NUM> -> <IP>:<NUM>"

    def test_masks_digits(self):
        out = self._apply("HTTP 404 returned in 12ms")
        assert out == "HTTP <NUM> returned in <NUM>ms"

    def test_masks_hex_run(self):
        out = self._apply("fault at address 0xdeadbeefcafe")
        assert out == "fault at address <HEX>"

    def test_masks_mac(self):
        out = self._apply("link up on 00:1a:2b:3c:4d:5e")
        assert out == "link up on <MAC>"

    def test_two_shapes_collapse_to_one(self):
        # Names aren't masked (only digit/hex/uuid/ip syntax is) — the shape
        # match is on the IP suffix, same as the roadmap's worked example.
        a = self._apply("User bob logged in from 192.168.1.5")
        b = self._apply("User bob logged in from 10.0.0.3")
        assert a == b == "User bob logged in from <IP>"

    def test_distinct_shape_stays_distinct(self):
        routine = self._apply("Allow TCP 10.0.0.5:4433 -> 10.0.0.9:443")
        odd = self._apply("Deny UDP 185.220.101.4:0 -> 10.0.0.9:3389 (spoofed-src flag)")
        assert routine != odd


class TestExprBuilders:
    def test_normalize_expr_is_field_configurable(self):
        expr_message = template_normalize_expr("message")
        expr_attr = template_normalize_expr("attributes['raw_line']")
        assert "message" in expr_message
        assert "attributes['raw_line']" in expr_attr
        assert expr_message != expr_attr

    def test_normalize_expr_nests_all_patterns(self):
        expr = template_normalize_expr("message")
        assert expr.count("replaceRegexpAll(") == len(_TEMPLATE_PATTERNS)

    def test_hash_expr_wraps_normalize_expr_in_cityhash64(self):
        expr = template_hash_expr("message")
        assert expr.startswith("cityHash64(replaceRegexpAll(")
        assert expr.endswith(")")

    def test_sql_literal_escaping_doubles_backslash_and_quotes(self):
        expr = template_normalize_expr("message")
        # Regex backslashes must appear doubled in the emitted SQL text so
        # ClickHouse's own literal-escaping yields a single backslash for RE2.
        assert "\\\\d" in expr
        assert "\\\\b" in expr
