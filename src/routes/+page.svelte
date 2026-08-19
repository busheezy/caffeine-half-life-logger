<script lang="ts">
  import { caffeineRemaining, totalCaffeineRemaining } from "$lib/caffeine";
  import { onMount } from "svelte";
  import { SvelteDate } from "svelte/reactivity";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const chartWidth = 920;
  const chartHeight = 280;
  const plotLeft = 52;
  const plotRight = 16;
  const plotTop = 20;
  const plotBottom = 42;
  const chartHours = 24;
  const sampleCount = 97;
  const colors = ["#ff7a45", "#22a06b", "#6e5bd7", "#e2a72e", "#2878bd", "#cf4d7d"];

  let now = $derived(new SvelteDate(data.now));
  let consumptionType = $state<"instant" | "ongoing">("instant");
  let finishedAt = $state("");
  let finishLater = $state(false);
  let editingId = $state<number | null>(null);
  let editConsumptionType = $state<"instant" | "ongoing">("instant");
  let editFinishedAt = $state("");
  let editFinishLater = $state(false);

  type ServerIntake = (typeof data.intakes)[number] & {
    finishedAt: Date | string | null;
  };

  let intakes = $derived(
    (data.intakes as ServerIntake[]).map((intake, index) => {
      return {
        ...intake,
        color: colors[index % colors.length],
        consumedAt: new Date(intake.consumedAt),
        finishedAt: intake.finishedAt ? new Date(intake.finishedAt) : null,
      };
    }),
  );

  let chartIntakes = $derived(
    [...intakes].sort((firstIntake, secondIntake) => {
      return firstIntake.consumedAt.getTime() - secondIntake.consumedAt.getTime();
    }),
  );

  let currentAmount = $derived(totalCaffeineRemaining(intakes, now));

  let todayIntakeCount = $derived(
    intakes.filter((intake) => {
      return intake.consumedAt.toDateString() === now.toDateString();
    }).length,
  );

  let activeIntakeCount = $derived(
    intakes.filter((intake) => {
      return caffeineRemaining(intake, now) >= 1;
    }).length,
  );

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
        values: chartIntakes.map((intake) => {
          return caffeineRemaining(intake, time, now);
        }),
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
    const runningValues = Array.from({ length: sampleCount }, () => 0) as number[];

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

  onMount(() => {
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

  function selectOngoing(): void {
    consumptionType = "ongoing";

    if (!finishedAt && !finishLater) {
      finishedAt = toLocalInputValue(new Date());
    }
  }

  function updateFinishLater(value: boolean): void {
    finishLater = value;

    if (!finishLater && !finishedAt) {
      finishedAt = toLocalInputValue(new Date());
    }
  }

  function startEditing(intake: (typeof intakes)[number]): void {
    if (editingId === intake.id) {
      cancelEditing();

      return;
    }

    editingId = intake.id;
    editConsumptionType = intake.isDistributed ? "ongoing" : "instant";
    editFinishedAt = intake.finishedAt ? toLocalInputValue(intake.finishedAt) : "";
    editFinishLater = intake.isDistributed && intake.finishedAt === null;
  }

  function cancelEditing(): void {
    editingId = null;
  }

  function selectEditOngoing(): void {
    editConsumptionType = "ongoing";

    if (!editFinishedAt && !editFinishLater) {
      editFinishedAt = toLocalInputValue(new Date());
    }
  }

  function updateEditFinishLater(value: boolean): void {
    editFinishLater = value;

    if (!editFinishLater && !editFinishedAt) {
      editFinishedAt = toLocalInputValue(new Date());
    }
  }

  function formatDate(date: Date): string {
    return date.toLocaleString([], {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatDuration(start: Date, end: Date): string {
    const elapsedMilliseconds = end.getTime() - start.getTime();
    const durationMinutes = Math.max(0, Math.round(elapsedMilliseconds / 60_000));
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    if (hours === 0) {
      return `${minutes} min`;
    }

    return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
  }
</script>

<svelte:head>
  <title>Caffeine log</title>
  <meta name="description" content="A personal caffeine intake and half-life dashboard" />
</svelte:head>

<main>
  <header class="page-header">
    <p class="eyebrow">PERSONAL CAFFEINE LOG</p>
  </header>

  <section class="summary-grid" aria-label="Current caffeine summary">
    <article class="hero-stat">
      <p>ESTIMATED IN YOUR BODY</p>
      <strong>{formatMg(currentAmount)}</strong>
      <span
        >as of {now.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}</span
      >
    </article>

    <article class="summary-stat">
      <p>TODAY’S INTAKE</p>
      <strong>{formatMg(todayTotal)}</strong>
      <span>{todayIntakeCount} logged doses</span>
    </article>

    <article class="summary-stat">
      <p>ACTIVE DOSES</p>
      <strong>{activeIntakeCount}</strong>
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
            <input name="amountMg" type="number" min="1" max="1000" step="1" value="100" required />
            <span>mg</span>
          </div>
        </label>

        <label>
          <span>What was it? <small>optional</small></span>
          <input name="label" type="text" maxlength="80" placeholder="Morning coffee" />
        </label>

        <fieldset>
          <legend>Consumption type</legend>
          <label>
            <input
              type="radio"
              name="consumptionType"
              value="instant"
              bind:group={consumptionType}
            />
            <span>Chug</span>
          </label>
          <label>
            <input
              type="radio"
              name="consumptionType"
              value="ongoing"
              bind:group={consumptionType}
              onclick={selectOngoing}
            />
            <span>Sip</span>
          </label>
        </fieldset>

        <label>
          <span>Started at</span>
          <input name="consumedAt" type="datetime-local" value={defaultConsumedAt} required />
        </label>

        {#if consumptionType === "ongoing"}
          <label>
            <span class="finish-label">
              <span>Finished at</span>
              <span class="finish-later-option">
                <input
                  name="finishLater"
                  type="checkbox"
                  checked={finishLater}
                  onchange={(event) => {
                    updateFinishLater(event.currentTarget.checked);
                  }}
                />
                Finish later
              </span>
            </span>
            {#if !finishLater}
              <input
                name="finishedAt"
                type="datetime-local"
                bind:value={finishedAt}
                required
              />
            {/if}
          </label>
        {/if}

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
        <article class:editing={editingId === intake.id} class="intake-row">
          <span class="color-key" style:background={intake.color}></span>
          <div class="intake-name">
            <strong>{intake.label || "Caffeine"}</strong>
            {#if !intake.isDistributed}
              <span>{formatDate(intake.consumedAt)}</span>
            {:else if intake.finishedAt === null}
              <span>{formatDate(intake.consumedAt)}</span>
              <span>Still drinking</span>
            {:else}
              <span
                >{formatDate(intake.consumedAt)} · {formatDuration(
                  intake.consumedAt,
                  intake.finishedAt,
                )}
                duration</span
              >
            {/if}
          </div>
          <div class="intake-dose">
            <strong>{formatMg(intake.amountMg)}</strong>
            <span>original dose</span>
          </div>
          <div class="intake-remaining">
            <strong>{formatMg(caffeineRemaining(intake, now))}</strong>
            <span>remaining</span>
          </div>
          <div class="intake-actions">
            {#if intake.isDistributed && intake.finishedAt === null}
              <form method="POST" action="?/finish">
                <input type="hidden" name="id" value={intake.id} />
                <button class="finish-button" type="submit">FINISH NOW</button>
              </form>
            {/if}
            <button
              class:active={editingId === intake.id}
              class="edit-button"
              type="button"
              aria-label={`${editingId === intake.id ? "Close editor for" : "Edit"} ${
                intake.label || "caffeine intake"
              }`}
              onclick={() => startEditing(intake)}
            >
              {editingId === intake.id ? "CLOSE" : "EDIT"}
            </button>
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
          </div>

          {#if editingId === intake.id}
            <form class="edit-intake-form" method="POST" action="?/edit">
              <input type="hidden" name="id" value={intake.id} />

              <label>
                <span>Amount</span>
                <div class="input-with-unit">
                  <input
                    name="amountMg"
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={intake.amountMg}
                    required
                  />
                  <span>mg</span>
                </div>
              </label>

              <label>
                <span>What was it?</span>
                <input name="label" type="text" maxlength="80" value={intake.label || ""} />
              </label>

              <fieldset>
                <legend>Consumption type</legend>
                <label>
                  <input
                    type="radio"
                    name="consumptionType"
                    value="instant"
                    bind:group={editConsumptionType}
                  />
                  <span>Chug</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="consumptionType"
                    value="ongoing"
                    bind:group={editConsumptionType}
                    onclick={selectEditOngoing}
                  />
                  <span>Sip</span>
                </label>
              </fieldset>

              <label>
                <span>Started at</span>
                <input
                  name="consumedAt"
                  type="datetime-local"
                  value={toLocalInputValue(intake.consumedAt)}
                  required
                />
              </label>

              {#if editConsumptionType === "ongoing"}
                <label>
                  <span class="finish-label">
                    <span>Finished at</span>
                    <span class="finish-later-option">
                      <input
                        name="finishLater"
                        type="checkbox"
                        checked={editFinishLater}
                        onchange={(event) => {
                          updateEditFinishLater(event.currentTarget.checked);
                        }}
                      />
                      Finish later
                    </span>
                  </span>
                  {#if !editFinishLater}
                    <input
                      name="finishedAt"
                      type="datetime-local"
                      bind:value={editFinishedAt}
                      required
                    />
                  {/if}
                </label>
              {/if}

              <div class="edit-form-actions">
                <button class="save-button" type="submit">SAVE</button>
                <button class="cancel-button" type="button" onclick={cancelEditing}>
                  CANCEL
                </button>
              </div>
            </form>
          {/if}
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
