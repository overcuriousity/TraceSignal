"""Pin vestigo.stats against scipy-computed reference constants.

The constants in ``tests/data/stats_reference_scipy.json`` were generated
offline with scipy 1.x (see the JSON's provenance note in git history) so the
pure-Python implementations in :mod:`vestigo.stats` are verified against the
de-facto standard without scipy ever becoming a runtime dependency.
"""

from __future__ import annotations

import json
import math
import random
import time
from collections import Counter
from pathlib import Path

import pytest

from vestigo import stats

_REF = json.loads((Path(__file__).parent / "data" / "stats_reference_scipy.json").read_text())


@pytest.mark.parametrize(("a", "b", "x", "expected"), [tuple(row) for row in _REF["betainc"]])
def test_regularized_incomplete_beta_matches_scipy(a, b, x, expected):
    assert stats.regularized_incomplete_beta(a, b, x) == pytest.approx(expected, rel=1e-9)


def test_incomplete_beta_bounds():
    assert stats.regularized_incomplete_beta(2.0, 3.0, 0.0) == 0.0
    assert stats.regularized_incomplete_beta(2.0, 3.0, 1.0) == 1.0
    with pytest.raises(ValueError):
        stats.regularized_incomplete_beta(2.0, 3.0, 1.5)


@pytest.mark.parametrize(("t", "df", "expected"), [tuple(row) for row in _REF["t_sf"]])
def test_student_t_sf_matches_scipy(t, df, expected):
    assert stats.student_t_sf(t, df) == pytest.approx(expected, rel=1e-8, abs=1e-12)


@pytest.mark.parametrize(("r", "n", "expected"), [tuple(row) for row in _REF["corr_p"]])
def test_corr_p_matches_scipy_t_transform(r, n, expected):
    assert stats.pearson_p(r, int(n)) == pytest.approx(expected, rel=1e-6, abs=1e-12)
    assert stats.spearman_p(r, int(n)) == pytest.approx(expected, rel=1e-6, abs=1e-12)


def test_corr_p_degenerate():
    assert stats.pearson_p(0.5, 2) is None
    assert stats.pearson_p(float("nan"), 100) is None
    assert stats.pearson_p(1.0, 50) == 0.0
    assert stats.pearson_p(-1.0, 50) == 0.0


def test_normal_ppf_round_trips_normal_sf():
    for p in (0.001, 0.01, 0.3, 0.5, 0.8, 0.975, 0.9999):
        z = stats.normal_ppf(p)
        assert 1.0 - stats.normal_sf(z) == pytest.approx(p, abs=1e-8)


@pytest.mark.parametrize(
    ("xs", "ys", "tau", "p"),
    [(row[0], row[1], row[2], row[3]) for row in _REF["kendall"]],
    ids=["continuous", "heavy-ties", "small-n"],
)
def test_kendall_tau_matches_scipy(xs, ys, tau, p):
    got_tau, got_p = stats.kendall_tau(xs, ys)
    assert got_tau == pytest.approx(tau, abs=1e-9)
    assert got_p == pytest.approx(p, rel=1e-3, abs=1e-6)


def test_kendall_degenerate():
    assert stats.kendall_tau([1.0, 2.0], [1.0, 2.0]) == (None, None)
    assert stats.kendall_tau([1.0, 1.0, 1.0, 1.0], [1.0, 2.0, 3.0, 4.0]) == (None, None)


def _kendall_tau_brute(xs, ys):
    """O(n²) tau-b straight from the definition — the reference for the fast path."""
    n = len(xs)
    s = 0
    for i in range(n):
        for j in range(i + 1, n):
            dx = (xs[i] > xs[j]) - (xs[i] < xs[j])
            dy = (ys[i] > ys[j]) - (ys[i] < ys[j])
            s += dx * dy
    n0 = n * (n - 1) // 2

    def tie_pairs(values):
        return sum(c * (c - 1) // 2 for c in Counter(values).values())

    denom = math.sqrt(n0 - tie_pairs(xs)) * math.sqrt(n0 - tie_pairs(ys))
    return s / denom if denom else None


@pytest.mark.parametrize("distinct_values", [2, 3, 5, 1000])
def test_kendall_tau_merge_sort_matches_the_definition(distinct_values):
    """Knight's O(n log n) tau-b must equal the all-pairs definition exactly.

    Swept across tie densities — `distinct_values=2` makes nearly every pair
    tied, which is where the n1/n2/n3 bookkeeping earns its keep.
    """
    rng = random.Random(17 + distinct_values)
    for _ in range(60):
        n = rng.randint(3, 60)
        xs = [float(rng.randint(0, distinct_values)) for _ in range(n)]
        ys = [float(rng.randint(0, distinct_values)) for _ in range(n)]
        got, _ = stats.kendall_tau(xs, ys)
        expected = _kendall_tau_brute(xs, ys)
        if expected is None:
            assert got is None
        else:
            assert got == pytest.approx(expected, abs=1e-12)


def test_kendall_tau_stays_cheap_at_the_scatter_sample_ceiling():
    """20 000 points — the API's scatter cap — must not cost seconds.

    The O(n²) predecessor took ~17 s here, on every scatter render, inside a
    request holding a heavy-scan slot.
    """
    rng = random.Random(3)
    n = 20_000
    xs = [rng.random() for _ in range(n)]
    ys = [rng.random() for _ in range(n)]
    started = time.perf_counter()
    tau, p = stats.kendall_tau(xs, ys)
    elapsed = time.perf_counter() - started
    assert tau is not None and p is not None
    assert elapsed < 2.0, f"kendall_tau took {elapsed:.2f}s at n={n}"


@pytest.mark.parametrize(
    ("xs", "w", "p"),
    [(row[1], row[2], row[3]) for row in _REF["shapiro"]],
    ids=[row[0] for row in _REF["shapiro"]],
)
def test_shapiro_wilk_matches_scipy(xs, w, p):
    got_w, got_p = stats.shapiro_wilk(xs)
    assert got_w == pytest.approx(w, abs=1e-4)
    assert got_p == pytest.approx(p, rel=2e-2, abs=1e-3)


def test_shapiro_wilk_rejects_out_of_range():
    assert stats.shapiro_wilk([1.0, 2.0]) == (None, None)
    assert stats.shapiro_wilk([0.0] * 5001) == (None, None)
    assert stats.shapiro_wilk([3.0, 3.0, 3.0, 3.0]) == (None, None)


def test_fd_bin_count():
    # 1000 points, IQR 10, span 100 -> width = 2*10*1000^(-1/3) = 2.0 -> 50 bins.
    assert stats.fd_bin_count(10.0, 1000, 100.0) == 50
    assert stats.fd_bin_count(0.0, 1000, 100.0) is None
    assert stats.fd_bin_count(10.0, 1, 100.0) is None
    assert stats.fd_bin_count(10.0, 1000, 0.0) is None
    # Rounds up, never returns 0.
    assert stats.fd_bin_count(50.0, 8, 1.0) == 1
