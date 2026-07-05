"""CLI progress reporting for large ingestion runs.

The Kalman-filtered ETA estimator, block-bar renderer, and duration formatter
below are ported near-verbatim from ScalarForensic
(https://github.com/ScalarForensic/ScalarForensic, ``src/scalar_forensic/cli.py``)
at the user's request, so the CLI's progress display matches that tool's
look and feel. ``BytesProgressPrinter`` is TraceSignal-specific glue that
adapts ``IngestionPipeline``'s byte-based ``progress_callback(total, processed)``
signal (see ``ingestion/pipeline.py``) into that widget.
"""

from __future__ import annotations

import sys
import time

import typer


def _progress_bar(pct: float, width: int = 28) -> str:
    """Unicode block-element progress bar."""
    filled = round(width * min(max(pct, 0.0), 100.0) / 100)
    return "█" * filled + "░" * (width - filled)


def _fmt_duration(seconds: float) -> str:
    s = int(seconds)
    if s < 60:
        return f"{s}s"
    m, s = divmod(s, 60)
    if m < 60:
        return f"{m}m {s:02d}s"
    h, m = divmod(m, 60)
    return f"{h}h {m:02d}m {s:02d}s"


class _ETATracker:
    """Kalman-filtered throughput estimator — Θ(1) time and space per update.

    State space: x ∈ ℝ₊ (throughput, bytes/s), A = H = 1 (scalar random walk):

        Predict:  x̂ₜ⁻  = x̂ₜ₋₁                         Φ := 1
                  Pₜ⁻  = Pₜ₋₁ + Q,    Q ∈ ℝ₊

        Update:   Kₜ   = Pₜ⁻ (Pₜ⁻ + R)⁻¹               Kₜ ∈ (0, 1)
                  x̂ₜ   = x̂ₜ⁻ + Kₜ(zₜ − x̂ₜ⁻)
                  Pₜ   = (1 − Kₜ)Pₜ⁻                   (Joseph form, H = 1)

        DARE (t → ∞, unique ℝ₊ root of P∞² + QP∞ − QR = 0):
                  P∞   = ½(√(Q² + 4QR) − Q)
                  K∞   = Q / (Q + √(Q² + 4QR))
          ∀ Q = R/2 :  K∞ = ½                           equal-weight equilibrium ✓

        δ-method (first-order error propagation, η̂ := N_rem / x̂):
                  Var[η̂] ≈ (∂η/∂x)²|_{x=x̂} · Pₜ
                           = (N_rem · x̂⁻²)² · Pₜ
                  σ_η    = N_rem · √Pₜ / x̂²            ±1σ confidence band
    """

    _Q: float = 50.0  # process-noise variance  (bytes/s)²
    _R: float = 100.0  # measurement-noise variance (bytes/s)²

    def __init__(self) -> None:
        self._x: float | None = None  # x̂: current rate estimate (bytes/s)
        self._P: float = 1e8  # P: estimate error variance (diffuse prior)
        self._k: float = 1.0  # Kₜ: Kalman gain at last update (1 = full trust)
        self._n: int = 0  # number of updates applied

    def update(self, n_bytes: int, elapsed_s: float) -> None:
        """Incorporate a new observation.  Θ(1) — scalar predict-update cycle."""
        if elapsed_s <= 0 or n_bytes <= 0:
            return
        z = n_bytes / elapsed_s  # zₜ: observed throughput
        self._n += 1
        if self._x is None:
            self._x = z
            self._P = self._R  # P₁ = R: certainty = measurement quality
            return
        p_pred = self._P + self._Q  # Pₜ⁻ = Pₜ₋₁ + Q
        k = p_pred / (p_pred + self._R)  # Kₜ = Pₜ⁻(Pₜ⁻ + R)⁻¹
        self._x = self._x + k * (z - self._x)  # x̂ₜ = x̂ₜ⁻ + Kₜ(zₜ − x̂ₜ⁻)
        self._P = (1.0 - k) * p_pred  # Pₜ = (1 − Kₜ)Pₜ⁻
        self._k = k

    @property
    def rate(self) -> float | None:
        """x̂ₜ — current optimal rate estimate (bytes/s)."""
        return self._x

    @property
    def rate_std(self) -> float:
        """√Pₜ — 1σ uncertainty on the rate estimate (bytes/s)."""
        return self._P**0.5

    @property
    def kalman_gain(self) -> float:
        """Kₜ — Kalman gain at the most recent update.

        Converges toward K∞ = ½ at steady state (Q = R/2).
        """
        return self._k

    def eta(self, remaining: int) -> tuple[float, float] | None:
        """Return (η̂, σ_η) in seconds, or None if not enough data.

        Θ(1) — closed-form δ-method propagation:
            η̂   = N_rem / x̂
            σ_η = N_rem · √Pₜ / x̂²
        """
        if self._x is None or self._x <= 0 or self._n < 2:
            return None
        eta_s = remaining / self._x  # η̂
        sigma_s = remaining * self.rate_std / self._x**2  # σ_η
        return eta_s, sigma_s


class BytesProgressPrinter:
    """Adapts ``IngestionPipeline``'s byte-based progress callback to the
    ScalarForensic-style Kalman progress box.

    Call ``on_progress(total=..., processed=...)`` — the exact signature
    ``IngestionPipeline``/``EmbeddingPipeline`` invoke their callback with.
    """

    _REFRESH_INTERVAL_S = 0.5
    _BAR_WIDTH = 28
    _SEP = "─" * 68

    def __init__(self, label: str = "") -> None:
        self.label = label
        self._tracker = _ETATracker()
        self._last_processed = 0
        self._last_t = time.perf_counter()
        self._last_render_t = 0.0
        self._is_tty = sys.stdout.isatty()
        self._started = False

    def on_progress(self, total: int, processed: int) -> None:
        now = time.perf_counter()
        if not self._started:
            self._started = True
            self._last_processed = processed
            self._last_t = now
            self._render(total, processed, force=True)
            return

        d_bytes = processed - self._last_processed
        d_t = now - self._last_t
        self._tracker.update(d_bytes, d_t)
        self._last_processed = processed
        self._last_t = now

        done = total > 0 and processed >= total
        if done or (now - self._last_render_t) >= self._REFRESH_INTERVAL_S:
            self._render(total, processed, force=done)

    def _render(self, total: int, processed: int, force: bool = False) -> None:
        self._last_render_t = time.perf_counter()
        pct = (processed / total * 100) if total > 0 else 0.0
        bar = _progress_bar(pct, width=self._BAR_WIDTH)
        processed_mb = processed / 1e6
        total_mb = total / 1e6

        eta_part = ""
        rate = self._tracker.rate
        if rate is not None:
            result = self._tracker.eta(max(total - processed, 0))
            eta_s, sigma_s = result if result is not None else (None, None)
            eta_str = f"~ {_fmt_duration(eta_s)}" if eta_s is not None else "~ —"
            sigma_str = f"± {_fmt_duration(sigma_s)}" if sigma_s is not None else "± —"
            eta_part = (
                f"  x̂ = {rate / 1e6:.1f} MB/s"
                f"  √P = {self._tracker.rate_std / 1e6:.1f}"
                f"  K = {self._tracker.kalman_gain:.3f}"
                f"  ·  η̂ {eta_str}"
                f"  σ_η {sigma_str}"
            )

        line1 = f"  [{bar}]  {processed_mb:,.1f} / {total_mb:,.1f} MB  ({pct:.1f}%)"

        if self._is_tty and not force:
            typer.echo(f"\r{line1}{eta_part}" + " " * 8, nl=False)
        elif self._is_tty and force:
            typer.echo(f"\r{line1}{eta_part}" + " " * 8)
        else:
            # Non-TTY (piped/redirected): emit stable multi-line boxes instead
            # of carriage-return redraws.
            typer.echo(f"  {self._SEP}")
            typer.echo(line1)
            if eta_part:
                typer.echo(eta_part.strip())
            typer.echo(f"  {self._SEP}")
