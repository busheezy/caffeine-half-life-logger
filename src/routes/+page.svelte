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
  const colors = ["#ff8a5b", "#4fd19b", "#9b87f5", "#f0bd4f", "#55a7e8", "#eb78a6"];
  const eyebrowClasses = "mb-1.5 text-[0.72rem] font-extrabold tracking-[0.14em] text-[#ff8a5b]";
  const headingClasses =
    "m-0 text-[clamp(1.4rem,2vw,1.9rem)] font-medium tracking-[-0.055em] [font-family:Georgia,'Times_New_Roman',serif]";
  const panelClasses = "border border-[#343d3a] bg-[#141918]";
  const panelHeadingClasses =
    "flex items-start justify-between gap-6 border-b border-[#2d3633] px-5 py-4 max-[560px]:px-[19px]";
  const labelTitleClasses = "mb-[5px] block text-xs font-[750]";
  const inputClasses = [
    "min-h-[38px] w-full !rounded-none !border-[#3b4642] !bg-[#1b211f]",
    "text-[#edf3ee] !shadow-none focus:!border-[#ff8a5b]",
    "focus:!outline-2 focus:!outline-[#ff8a5b]/20",
  ];
  const fieldsetClasses = "m-0 flex gap-2 border-0 p-0";
  const fieldsetLabelClasses = [
    "relative flex flex-1 cursor-pointer items-center justify-center gap-[7px]",
    "border border-[#3b4642] bg-[#1b211f] px-[9px] py-1.5 text-[0.83rem] text-[#b7c1bb]",
    "has-[:checked]:border-[#ff8a5b] has-[:checked]:bg-[#ff8a5b] has-[:checked]:text-[#111513]",
    "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#ff8a5b]/35",
  ];
  const radioClasses = "pointer-events-none absolute size-px min-h-0 opacity-0";
  const controlButtonClasses = [
    "min-h-[34px] border border-[#3b4642] bg-transparent px-[9px]",
    "text-[0.65rem] font-extrabold tracking-[0.06em] text-[#b7c1bb]",
  ];

  let now = $derived(new SvelteDate(data.now));
  let consumptionType = $state<"instant" | "ongoing">("instant");
  let quickEntryOpen = $derived(Boolean(form?.message));
  let finishedAt = $state("");
  let finishLater = $state(false);
  let editingId = $state<number | null>(null);
  let editConsumptionType = $state<"instant" | "ongoing">("instant");
  let editFinishedAt = $state("");
  let editFinishLater = $state(false);
  let hoveredChartPoint = $state<{
    time: Date;
    total: number;
    x: number;
    y: number;
  } | null>(null);

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

  function positionMobileChart(element: HTMLDivElement): () => void {
    const scrollFrame = window.requestAnimationFrame(() => {
      const isMobile = window.matchMedia("(max-width: 560px)").matches;

      if (isMobile) {
        const nowPosition = (nowX / chartWidth) * element.scrollWidth;
        const leadingSpace = element.clientWidth * 0.2;

        element.scrollLeft = Math.max(0, nowPosition - leadingSpace);
      }
    });

    return () => {
      window.cancelAnimationFrame(scrollFrame);
    };
  }

  function updateChartHover(event: PointerEvent): void {
    const chart = event.currentTarget as SVGSVGElement;
    const bounds = chart.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * chartWidth;
    const plotWidth = chartWidth - plotLeft - plotRight;
    const plotHeight = chartHeight - plotTop - plotBottom;
    const clampedX = Math.min(Math.max(pointerX, plotLeft), chartWidth - plotRight);
    const progress = (clampedX - plotLeft) / plotWidth;
    const chartDuration = chartEnd.getTime() - chartStart.getTime();
    const time = new Date(chartStart.getTime() + progress * chartDuration);
    const total = totalCaffeineRemaining(chartIntakes, time, now);
    const calculatedY = plotTop + plotHeight - (total / chartMaximum) * plotHeight;
    const y = Math.max(calculatedY, plotTop);

    hoveredChartPoint = {
      time,
      total,
      x: clampedX,
      y,
    };
  }

  function clearChartHover(): void {
    hoveredChartPoint = null;
  }

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

  function formatChartTime(date: Date): string {
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

<main
  class="mx-auto w-[min(1480px,calc(100%_-_48px))] pt-6 pb-10 max-[900px]:w-[min(calc(100%_-_28px),720px)] max-[900px]:pt-[22px] max-[560px]:w-[min(calc(100%_-_20px),520px)] max-[560px]:pt-4"
>
  <header class="mb-3.5 flex items-start justify-between gap-6 max-[560px]:block">
    <p class={eyebrowClasses}>PERSONAL CAFFEINE LOG</p>
  </header>

  <section
    class="grid grid-cols-[1.5fr_1fr_1fr] border border-[#343d3a] bg-[#141918] max-[900px]:grid-cols-1"
    aria-label="Current caffeine summary"
  >
    <article
      class="min-h-[116px] px-[22px] py-[18px] max-[900px]:min-h-[104px] max-[560px]:px-[19px]"
    >
      <p class="mb-2 text-[0.68rem] font-extrabold tracking-[0.12em] text-[#9aa69f]">
        ESTIMATED IN YOUR BODY
      </p>
      <strong
        class="mb-[5px] block text-[clamp(2.25rem,4vw,3.7rem)] leading-none font-medium tracking-[-0.055em] [font-family:Georgia,'Times_New_Roman',serif]"
        >{formatMg(currentAmount)}</strong
      >
      <span class="text-[0.83rem] text-[#9aa69f]"
        >as of {now.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}</span
      >
    </article>

    <article
      class="min-h-[116px] border-l border-[#343d3a] px-[22px] py-[18px] max-[900px]:min-h-[104px] max-[900px]:border-t max-[900px]:border-l-0 max-[560px]:px-[19px]"
    >
      <p class="mb-2 text-[0.68rem] font-extrabold tracking-[0.12em] text-[#9aa69f]">
        TODAY’S INTAKE
      </p>
      <strong
        class="mb-[5px] block text-[clamp(2.25rem,4vw,3.7rem)] leading-none font-medium tracking-[-0.055em] [font-family:Georgia,'Times_New_Roman',serif]"
        >{formatMg(todayTotal)}</strong
      >
      <span class="text-[0.83rem] text-[#9aa69f]">{todayIntakeCount} logged doses</span>
    </article>

    <article
      class="min-h-[116px] border-l border-[#343d3a] px-[22px] py-[18px] max-[900px]:min-h-[104px] max-[900px]:border-t max-[900px]:border-l-0 max-[560px]:px-[19px]"
    >
      <p class="mb-2 text-[0.68rem] font-extrabold tracking-[0.12em] text-[#9aa69f]">
        ACTIVE DOSES
      </p>
      <strong
        class="mb-[5px] block text-[clamp(2.25rem,4vw,3.7rem)] leading-none font-medium tracking-[-0.055em] [font-family:Georgia,'Times_New_Roman',serif]"
        >{activeIntakeCount}</strong
      >
      <span class="text-[0.83rem] text-[#9aa69f]">with at least 1 mg remaining</span>
    </article>
  </section>

  <div
    class="mt-[18px] grid grid-cols-[minmax(300px,0.68fr)_minmax(0,1.9fr)] gap-4 max-[900px]:grid-cols-1"
  >
    <section class={[panelClasses, "min-w-0"]}>
      <div class={panelHeadingClasses}>
        <div>
          <p class={eyebrowClasses}>QUICK ENTRY</p>
          <h2 class={headingClasses}>Log caffeine</h2>
        </div>
        <span class="text-[1.55rem] grayscale max-[560px]:hidden" aria-hidden="true">☕</span>
        <button
          class={[
            "hidden min-h-9 items-center gap-2 px-3 max-[560px]:flex",
            "cursor-pointer border border-[#3b4642] bg-[#1b211f] text-[#b7c1bb]",
            "text-[0.68rem] font-extrabold tracking-[0.06em]",
          ]}
          type="button"
          aria-controls="quick-entry-form"
          aria-expanded={quickEntryOpen}
          onclick={() => {
            quickEntryOpen = !quickEntryOpen;
          }}
        >
          {quickEntryOpen ? "CLOSE" : "OPEN"}
          <span aria-hidden="true">{quickEntryOpen ? "↑" : "↓"}</span>
        </button>
      </div>

      <div id="quick-entry-form" class={{ "max-[560px]:hidden": !quickEntryOpen }}>
        <form class="grid gap-3 px-5 pt-4 pb-5 max-[560px]:px-[19px]" method="POST" action="?/add">
          <label>
            <span class={labelTitleClasses}>Amount</span>
            <div class="flex items-stretch">
              <input
                class={[inputClasses, "!border-r-0"]}
                name="amountMg"
                type="number"
                min="1"
                max="1000"
                step="1"
                value="100"
                required
              />
              <span
                class="grid min-w-[62px] place-items-center border border-[#3b4642] bg-[#252d2a] text-xs font-bold text-[#aab5ae]"
                >mg</span
              >
            </div>
          </label>

          <label>
            <span class={labelTitleClasses}
              >What was it? <small class="font-medium text-[#89958e]">optional</small></span
            >
            <input
              class={inputClasses}
              name="label"
              type="text"
              maxlength="80"
              placeholder="Morning coffee"
            />
          </label>

          <fieldset class={fieldsetClasses}>
            <legend class={labelTitleClasses}>Consumption type</legend>
            <label class={fieldsetLabelClasses}>
              <input
                class={radioClasses}
                type="radio"
                name="consumptionType"
                value="instant"
                bind:group={consumptionType}
              />
              <span>Chug</span>
            </label>
            <label class={fieldsetLabelClasses}>
              <input
                class={radioClasses}
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
            <span class={labelTitleClasses}>Started at</span>
            <input
              class={inputClasses}
              name="consumedAt"
              type="datetime-local"
              value={defaultConsumedAt}
              required
            />
          </label>

          {#if consumptionType === "ongoing"}
            <label>
              <span class={[labelTitleClasses, "flex items-center justify-between gap-4"]}>
                <span>Finished at</span>
                <span
                  class="flex cursor-pointer items-center gap-1.5 text-[0.72rem] font-[650] text-[#b7c1bb]"
                >
                  <input
                    class="size-3.5 min-h-3.5 accent-[#ff8a5b]"
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
                  class={inputClasses}
                  name="finishedAt"
                  type="datetime-local"
                  bind:value={finishedAt}
                  required
                />
              {/if}
            </label>
          {/if}

          {#if form?.message}
            <p class="m-0 text-[0.82rem] text-[#ff8b83]">{form.message}</p>
          {/if}

          <button
            class="mt-[3px] flex min-h-[42px] cursor-pointer items-center justify-between border border-[#ff8a5b] bg-[#ff8a5b] px-[18px] text-[0.74rem] font-extrabold tracking-[0.1em] text-[#111513] hover:border-[#ffad8c] hover:bg-[#ffad8c]"
            type="submit">ADD TO LOG <span aria-hidden="true">→</span></button
          >
        </form>
      </div>
    </section>

    <section class={[panelClasses, "min-w-0"]}>
      <div class={[panelHeadingClasses, "items-center"]}>
        <div>
          <p class={eyebrowClasses}>24-HOUR OUTLOOK</p>
          <h2 class={headingClasses}>Caffeine in your body</h2>
        </div>
        <p class="m-0 text-[0.76rem] text-[#9aa69f] max-[560px]:hidden">Each color is one intake</p>
      </div>

      <p
        class="m-0 hidden px-5 pt-3 text-[0.72rem] font-bold tracking-wide text-[#9aa69f] max-[560px]:block"
      >
        Swipe to explore the full 24 hours →
      </p>

      <div
        class="max-w-full scroll-smooth px-4 pt-2 pb-0.5 overflow-x-auto"
        {@attach positionMobileChart}
      >
        <svg
          class="block h-auto w-full min-w-[650px] max-[560px]:!min-w-[920px]"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-label="Stacked area chart of estimated caffeine remaining over 24 hours"
          onpointermove={updateChartHover}
          onpointerleave={clearChartHover}
        >
          {#each [0, 0.25, 0.5, 0.75, 1] as fraction (fraction)}
            {@const y = plotTop + (1 - fraction) * (chartHeight - plotTop - plotBottom)}
            <line
              class="[stroke-dasharray:3_5] stroke-[#303936] stroke-1"
              x1={plotLeft}
              x2={chartWidth - plotRight}
              y1={y}
              y2={y}
            ></line>
            <text
              class="fill-[#9aa69f] text-[10px] [dominant-baseline:middle] [text-anchor:end]"
              x={plotLeft - 10}
              {y}>{Math.round(chartMaximum * fraction)}</text
            >
          {/each}

          {#each stackedAreas as area (area.id)}
            <polygon points={area.points} fill={area.color} fill-opacity="0.72"></polygon>
          {/each}

          <line
            class="[stroke-dasharray:4_3] stroke-[#edf3ee] stroke-[1.5]"
            x1={nowX}
            x2={nowX}
            y1={plotTop}
            y2={chartHeight - plotBottom}
          ></line>
          <text
            class="fill-[#9aa69f] text-[9px] font-extrabold tracking-[0.08em]"
            x={nowX}
            y={plotTop + 2}
            transform="translate(-13 -5)">NOW</text
          >

          {#each timeTicks as tick (tick.x)}
            <text
              class="fill-[#9aa69f] text-[10px] [text-anchor:middle]"
              x={tick.x}
              y={chartHeight - 14}>{tick.label}</text
            >
          {/each}

          <text class="fill-[#9aa69f] text-[9px] font-extrabold tracking-[0.08em]" x="8" y="14"
            >MG</text
          >

          <rect
            class="cursor-crosshair fill-transparent"
            x={plotLeft}
            y={plotTop}
            width={chartWidth - plotLeft - plotRight}
            height={chartHeight - plotTop - plotBottom}
          ></rect>

          {#if hoveredChartPoint}
            {@const tooltipWidth = 132}
            {@const tooltipHeight = 48}
            {@const tooltipX =
              hoveredChartPoint.x > chartWidth - tooltipWidth - plotRight - 12
                ? hoveredChartPoint.x - tooltipWidth - 10
                : hoveredChartPoint.x + 10}
            {@const tooltipY = Math.min(
              Math.max(hoveredChartPoint.y - tooltipHeight - 10, plotTop),
              chartHeight - plotBottom - tooltipHeight,
            )}

            <line
              class="pointer-events-none [stroke-dasharray:2_3] stroke-[#edf3ee] stroke-1"
              x1={hoveredChartPoint.x}
              x2={hoveredChartPoint.x}
              y1={plotTop}
              y2={chartHeight - plotBottom}
            ></line>
            <circle
              class="pointer-events-none fill-[#edf3ee] stroke-[#141918] stroke-2"
              cx={hoveredChartPoint.x}
              cy={hoveredChartPoint.y}
              r="4"
            ></circle>
            <g class="pointer-events-none" transform={`translate(${tooltipX} ${tooltipY})`}>
              <rect
                class="fill-[#090c0b] stroke-[#4a5752] stroke-1"
                width={tooltipWidth}
                height={tooltipHeight}
                rx="4"
              ></rect>
              <text class="fill-[#aab5ae] text-[10px]" x="10" y="18">
                {formatChartTime(hoveredChartPoint.time)}
              </text>
              <text class="fill-white text-sm font-extrabold" x="10" y="37">
                {formatMg(hoveredChartPoint.total)}
              </text>
            </g>
          {/if}
        </svg>
      </div>
    </section>
  </div>

  <section class={[panelClasses, "mt-4 min-w-0"]}>
    <div class={[panelHeadingClasses, "items-center"]}>
      <div>
        <p class={eyebrowClasses}>RECENT HISTORY</p>
        <h2 class={headingClasses}>Your intakes</h2>
      </div>
      <span class="text-[0.76rem] text-[#9aa69f] max-[560px]:hidden">
        Showing the last 3 days
      </span>
    </div>

    <div class="grid">
      {#each intakes as intake (intake.id)}
        <article
          class={[
            "grid min-h-[62px] grid-cols-[12px_minmax(180px,1.7fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(42px,auto)] items-center gap-[18px] px-5 py-2.5 not-first:border-t not-first:border-[#2d3633]",
            "max-[900px]:grid-cols-[10px_1fr_auto_minmax(36px,auto)]",
            "max-[560px]:grid-cols-[8px_1fr_34px] max-[560px]:gap-3 max-[560px]:px-[15px]",
            editingId === intake.id && "pb-[18px]",
          ]}
        >
          <span class="h-[30px] w-3" style:background={intake.color}></span>
          <div>
            <strong class="mb-1 block">{intake.label || "Caffeine"}</strong>
            {#if !intake.isDistributed}
              <span class="text-xs text-[#9aa69f]">{formatDate(intake.consumedAt)}</span>
            {:else if intake.finishedAt === null}
              <span class="block text-xs text-[#9aa69f]">{formatDate(intake.consumedAt)}</span>
              <span class="text-xs text-[#9aa69f]">Still drinking</span>
            {:else}
              <span class="text-xs text-[#9aa69f]"
                >{formatDate(intake.consumedAt)} · {formatDuration(
                  intake.consumedAt,
                  intake.finishedAt,
                )}
                duration</span
              >
            {/if}
          </div>
          <div class="max-[900px]:hidden">
            <strong class="mb-1 block">{formatMg(intake.amountMg)}</strong>
            <span class="text-xs text-[#9aa69f]">original dose</span>
          </div>
          <div class="max-[560px]:hidden">
            <strong class="mb-1 block">{formatMg(caffeineRemaining(intake, now))}</strong>
            <span class="text-xs text-[#9aa69f]">remaining</span>
          </div>
          <div
            class="flex min-w-[190px] items-center justify-end gap-2 max-[900px]:min-w-[154px] max-[560px]:min-w-0"
          >
            {#if intake.isDistributed && intake.finishedAt === null}
              <form method="POST" action="?/finish">
                <input type="hidden" name="id" value={intake.id} />
                <button
                  class="min-h-[34px] cursor-pointer border border-[#ff8a5b] bg-transparent px-[9px] text-[0.65rem] font-extrabold tracking-[0.06em] text-[#ff8a5b] hover:bg-[#ff8a5b] hover:text-[#111513] max-[560px]:text-[0.6rem]"
                  type="submit">FINISH<span class="max-[560px]:hidden"> NOW</span></button
                >
              </form>
            {/if}
            <button
              class={[
                controlButtonClasses,
                "cursor-pointer hover:border-[#8e9b94] hover:bg-[#202825] hover:text-[#edf3ee] max-[560px]:text-[0.6rem]",
              ]}
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
                class="size-[34px] cursor-pointer border border-transparent bg-transparent text-[1.35rem] leading-none text-[#89958e] hover:border-[#4a5752] hover:bg-[#202825] hover:text-[#ff8b83]"
                type="submit"
                aria-label={`Delete ${intake.label || "caffeine intake"}`}
              >
                ×
              </button>
            </form>
          </div>

          {#if editingId === intake.id}
            <form
              class="col-[2/-1] grid w-full grid-cols-[repeat(4,minmax(140px,1fr))] gap-3 border-t border-[#2d3633] pt-2 max-[900px]:grid-cols-[repeat(2,minmax(140px,1fr))] max-[560px]:grid-cols-1"
              method="POST"
              action="?/edit"
            >
              <input type="hidden" name="id" value={intake.id} />

              <label>
                <span class={labelTitleClasses}>Amount</span>
                <div class="flex items-stretch">
                  <input
                    class={[inputClasses, "!border-r-0"]}
                    name="amountMg"
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={intake.amountMg}
                    required
                  />
                  <span
                    class="grid min-w-[62px] place-items-center border border-[#3b4642] bg-[#252d2a] text-xs font-bold text-[#aab5ae]"
                    >mg</span
                  >
                </div>
              </label>

              <label>
                <span class={labelTitleClasses}>What was it?</span>
                <input
                  class={inputClasses}
                  name="label"
                  type="text"
                  maxlength="80"
                  value={intake.label || ""}
                />
              </label>

              <fieldset class={fieldsetClasses}>
                <legend class={labelTitleClasses}>Consumption type</legend>
                <label class={fieldsetLabelClasses}>
                  <input
                    class={radioClasses}
                    type="radio"
                    name="consumptionType"
                    value="instant"
                    bind:group={editConsumptionType}
                  />
                  <span>Chug</span>
                </label>
                <label class={fieldsetLabelClasses}>
                  <input
                    class={radioClasses}
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
                <span class={labelTitleClasses}>Started at</span>
                <input
                  class={inputClasses}
                  name="consumedAt"
                  type="datetime-local"
                  value={toLocalInputValue(intake.consumedAt)}
                  required
                />
              </label>

              {#if editConsumptionType === "ongoing"}
                <label>
                  <span class={[labelTitleClasses, "flex items-center justify-between gap-4"]}>
                    <span>Finished at</span>
                    <span
                      class="flex cursor-pointer items-center gap-1.5 text-[0.72rem] font-[650] text-[#b7c1bb]"
                    >
                      <input
                        class="size-3.5 min-h-3.5 accent-[#ff8a5b]"
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
                      class={inputClasses}
                      name="finishedAt"
                      type="datetime-local"
                      bind:value={editFinishedAt}
                      required
                    />
                  {/if}
                </label>
              {/if}

              <div class="flex items-end gap-2">
                <button
                  class={[
                    controlButtonClasses,
                    "cursor-pointer border-[#ff8a5b] bg-[#ff8a5b] text-[#111513] hover:bg-[#ffad8c]",
                  ]}
                  type="submit">SAVE</button
                >
                <button
                  class={[
                    controlButtonClasses,
                    "cursor-pointer hover:border-[#8e9b94] hover:bg-[#202825] hover:text-[#edf3ee]",
                  ]}
                  type="button"
                  onclick={cancelEditing}
                >
                  CANCEL
                </button>
              </div>
            </form>
          {/if}
        </article>
      {:else}
        <div class="grid place-items-center px-6 py-9 text-center">
          <span class="mb-2.5 text-[2rem] opacity-55 grayscale" aria-hidden="true">☕</span>
          <strong>No caffeine logged yet</strong>
          <p class="mt-[5px] mb-0 text-[0.85rem] text-[#9aa69f]">
            Your first dose will appear here and on the chart.
          </p>
        </div>
      {/each}
    </div>
  </section>
</main>
