<script lang="ts">
  import { caffeineRemaining, totalCaffeineRemaining } from "$lib/caffeine";
  import { SvelteDate } from "svelte/reactivity";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const chartWidth = 920;
  const chartHeight = 330;
  const plotLeft = 52;
  const plotRight = 16;
  const plotTop = 20;
  const plotBottom = 42;
  const chartHours = 24;
  const sampleCount = 97;
  const colors = ["#ff7a45", "#22a06b", "#6e5bd7", "#e2a72e", "#2878bd", "#cf4d7d"];

  let now = $derived(new SvelteDate(data.now));

  let intakes = $derived(
    data.intakes.map((intake, index) => {
      return {
        ...intake,
        color: colors[index % colors.length],
        consumedAt: new Date(intake.consumedAt),
      };
    }),
  );

  let chartIntakes = $derived(
    [...intakes].sort((firstIntake, secondIntake) => {
      return firstIntake.consumedAt.getTime() - secondIntake.consumedAt.getTime();
    }),
  );

  let currentAmount = $derived(totalCaffeineRemaining(intakes, now));

  let todayTotal = $derived.by(() => {
    const todayStart = new SvelteDate(now);

    todayStart.setHours(0, 0, 0, 0);

    return intakes.reduce((total, intake) => {
      if (intake.consumedAt >= todayStart && intake.consumedAt <= now) {
        return total + intake.amountMg;
      }

      return total;
    }, 0);
  });

  let chartStart = $derived.by(() => {
    const start = new SvelteDate(now);

    start.setHours(start.getHours() - 12, 0, 0, 0);

    return start;
  });

  let chartEnd = $derived(new Date(chartStart.getTime() + chartHours * 60 * 60 * 1000));

  let chartSamples = $derived.by(() => {
    return Array.from({ length: sampleCount }, (_, index) => {
      const progress = index / (sampleCount - 1);
      const time = new Date(
        chartStart.getTime() + progress * (chartEnd.getTime() - chartStart.getTime()),
      );

      return {
        time,
        values: chartIntakes.map((intake) => caffeineRemaining(intake, time)),
      };
    });
  });

  let chartMaximum = $derived.by(() => {
    const totals = chartSamples.map((sample) => {
      return sample.values.reduce((total, value) => total + value, 0);
    });
    const maximum = Math.max(...totals, 100);

    return Math.ceil(maximum / 50) * 50;
  });

  let stackedAreas = $derived.by(() => {
    const plotWidth = chartWidth - plotLeft - plotRight;
    const plotHeight = chartHeight - plotTop - plotBottom;
    const runningValues = new Array(sampleCount).fill(0) as number[];

    return chartIntakes.map((intake, intakeIndex) => {
      const topPoints = chartSamples.map((sample, sampleIndex) => {
        runningValues[sampleIndex] += sample.values[intakeIndex];

        const x = plotLeft + (sampleIndex / (sampleCount - 1)) * plotWidth;
        const y = plotTop + plotHeight - (runningValues[sampleIndex] / chartMaximum) * plotHeight;

        return `${x.toFixed(2)},${y.toFixed(2)}`;
      });

      const bottomPoints = chartSamples
        .map((_, sampleIndex) => {
          const value = runningValues[sampleIndex] - chartSamples[sampleIndex].values[intakeIndex];
          const x = plotLeft + (sampleIndex / (sampleCount - 1)) * plotWidth;
          const y = plotTop + plotHeight - (value / chartMaximum) * plotHeight;

          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .reverse();

      return {
        id: intake.id,
        color: intake.color,
        points: [...topPoints, ...bottomPoints].join(" "),
      };
    });
  });

  let timeTicks = $derived(
    Array.from({ length: 7 }, (_, index) => {
      const progress = index / 6;
      const time = new Date(
        chartStart.getTime() + progress * (chartEnd.getTime() - chartStart.getTime()),
      );

      return {
        x: plotLeft + progress * (chartWidth - plotLeft - plotRight),
        label: time.toLocaleTimeString([], {
          hour: "numeric",
        }),
      };
    }),
  );

  let nowX = $derived.by(() => {
    const plotWidth = chartWidth - plotLeft - plotRight;
    const progress =
      (now.getTime() - chartStart.getTime()) / (chartEnd.getTime() - chartStart.getTime());

    return plotLeft + progress * plotWidth;
  });

  let defaultConsumedAt = $derived(toLocalInputValue(now));

  $effect(() => {
    const interval = window.setInterval(() => {
      now.setTime(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  });

  function toLocalInputValue(date: Date): string {
    const offset = date.getTimezoneOffset() * 60_000;
    const localDate = new Date(date.getTime() - offset);

    return localDate.toISOString().slice(0, 16);
  }

  function formatMg(value: number): string {
    return `${Math.round(value)} mg`;
  }

  function formatDate(date: Date): string {
    return date.toLocaleString([], {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
</script>

<svelte:head>
  <title>Caffeine log</title>
  <meta name="description" content="A personal caffeine intake and half-life dashboard" />
</svelte:head>

<main>
  <header class="page-header">
    <div>
      <p class="eyebrow">PERSONAL CAFFEINE LOG</p>
    </div>

    <div class="status-dot" aria-label="Dashboard is running locally">
      <span></span>
      LOCAL
    </div>
  </header>

  <section class="summary-grid" aria-label="Current caffeine summary">
    <article class="hero-stat">
      <p>ESTIMATED IN YOUR BODY</p>
      <strong>{formatMg(currentAmount)}</strong>
      <span>as of {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
    </article>

    <article class="summary-stat">
      <p>TODAY’S INTAKE</p>
      <strong>{formatMg(todayTotal)}</strong>
      <span
        >{intakes.filter((intake) => intake.consumedAt.toDateString() === now.toDateString())
          .length} logged doses</span
      >
    </article>

    <article class="summary-stat">
      <p>ACTIVE DOSES</p>
      <strong>{intakes.filter((intake) => caffeineRemaining(intake, now) >= 1).length}</strong>
      <span>with at least 1 mg remaining</span>
    </article>
  </section>

  <div class="dashboard-grid">
    <section class="panel log-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">QUICK ENTRY</p>
          <h2>Log caffeine</h2>
        </div>
        <span class="cup-mark" aria-hidden="true">☕</span>
      </div>

      <form method="POST" action="?/add">
        <label>
          <span>Amount</span>
          <div class="input-with-unit">
            <input name="amountMg" type="number" min="1" max="1000" step="1" value="95" required />
            <span>mg</span>
          </div>
        </label>

        <label>
          <span>What was it? <small>optional</small></span>
          <input name="label" type="text" maxlength="80" placeholder="Morning coffee" />
        </label>

        <label>
          <span>Consumed at</span>
          <input name="consumedAt" type="datetime-local" value={defaultConsumedAt} required />
        </label>

        {#if form?.message}
          <p class="form-error">{form.message}</p>
        {/if}

        <button type="submit">ADD TO LOG <span aria-hidden="true">→</span></button>
      </form>
    </section>

    <section class="panel chart-panel">
      <div class="panel-heading chart-heading">
        <div>
          <p class="eyebrow">24-HOUR OUTLOOK</p>
          <h2>Caffeine in your body</h2>
        </div>
        <p>Each color is one intake</p>
      </div>

      <div class="chart-scroll">
        <svg
          class="chart"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-label="Stacked area chart of estimated caffeine remaining over 24 hours"
        >
          {#each [0, 0.25, 0.5, 0.75, 1] as fraction (fraction)}
            {@const y = plotTop + (1 - fraction) * (chartHeight - plotTop - plotBottom)}
            <line class="grid-line" x1={plotLeft} x2={chartWidth - plotRight} y1={y} y2={y}></line>
            <text class="axis-label" x={plotLeft - 10} {y}
              >{Math.round(chartMaximum * fraction)}</text
            >
          {/each}

          {#each stackedAreas as area (area.id)}
            <polygon points={area.points} fill={area.color} fill-opacity="0.72"></polygon>
          {/each}

          <line class="now-line" x1={nowX} x2={nowX} y1={plotTop} y2={chartHeight - plotBottom}
          ></line>
          <text class="now-label" x={nowX} y={plotTop + 2}>NOW</text>

          {#each timeTicks as tick (tick.x)}
            <text class="time-label" x={tick.x} y={chartHeight - 14}>{tick.label}</text>
          {/each}

          <text class="unit-label" x="8" y="14">MG</text>
        </svg>
      </div>
    </section>
  </div>

  <section class="panel history-panel">
    <div class="panel-heading history-heading">
      <div>
        <p class="eyebrow">RECENT HISTORY</p>
        <h2>Your intakes</h2>
      </div>
      <span>Showing the last 3 days</span>
    </div>

    <div class="intake-list">
      {#each intakes as intake (intake.id)}
        <article class="intake-row">
          <span class="color-key" style:background={intake.color}></span>
          <div class="intake-name">
            <strong>{intake.label || "Caffeine"}</strong>
            <span>{formatDate(intake.consumedAt)}</span>
          </div>
          <div class="intake-dose">
            <strong>{formatMg(intake.amountMg)}</strong>
            <span>original dose</span>
          </div>
          <div class="intake-remaining">
            <strong>{formatMg(caffeineRemaining(intake, now))}</strong>
            <span>remaining</span>
          </div>
          <form method="POST" action="?/delete">
            <input type="hidden" name="id" value={intake.id} />
            <button
              class="delete-button"
              type="submit"
              aria-label={`Delete ${intake.label || "caffeine intake"}`}
            >
              ×
            </button>
          </form>
        </article>
      {:else}
        <div class="empty-state">
          <span aria-hidden="true">☕</span>
          <strong>No caffeine logged yet</strong>
          <p>Your first dose will appear here and on the chart.</p>
        </div>
      {/each}
    </div>
  </section>
</main>
