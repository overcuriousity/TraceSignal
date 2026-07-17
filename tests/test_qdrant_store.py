"""Unit tests for QdrantStore collection-name scoping."""

from types import SimpleNamespace

from vestigo.db.qdrant import QdrantStore

HASH_A = "a" * 64
HASH_B = "b" * 64


def _store_with_collections(names: list[str]) -> QdrantStore:
    store = QdrantStore.__new__(QdrantStore)
    store.collection_prefix = "vestigo"
    store.client = SimpleNamespace(
        get_collections=lambda: SimpleNamespace(
            collections=[SimpleNamespace(name=n) for n in names]
        )
    )
    return store


def test_case_collections_matches_own_hash_suffixed_names():
    store = _store_with_collections(
        [
            f"vestigo_acme_11112222_{HASH_A}",
            f"vestigo_acme_11112222_{HASH_B}",
        ]
    )
    assert sorted(store.case_collections("acme_11112222")) == [
        f"vestigo_acme_11112222_{HASH_A}",
        f"vestigo_acme_11112222_{HASH_B}",
    ]


def test_case_collections_excludes_prefix_colliding_case():
    """Case A's full ID can be a prefix of case B's ID (IDs are name-derived).

    Regression: a bare startswith match swept case B's collections into case
    A's delete/find helpers — cross-case vector deletion. The remainder after
    the prefix must be exactly one 64-hex embedding-config hash.
    """
    other = f"vestigo_acme_11112222_extra_33334444_{HASH_A}"
    store = _store_with_collections(
        [
            f"vestigo_acme_11112222_{HASH_A}",
            other,
        ]
    )
    assert store.case_collections("acme_11112222") == [f"vestigo_acme_11112222_{HASH_A}"]
    assert store.case_collections("acme_11112222_extra_33334444") == [other]


def test_case_collections_ignores_malformed_remainders():
    store = _store_with_collections(
        [
            f"vestigo_acme_11112222_{HASH_A[:63]}",  # too short
            f"vestigo_acme_11112222_{HASH_A.upper()}",  # not lowercase hex
            "vestigo_acme_11112222_",  # empty remainder
        ]
    )
    assert store.case_collections("acme_11112222") == []
