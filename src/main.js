import "./styles.css";

import * as d3 from "d3";
import { feature, mesh } from "topojson-client";
import statesUrl from "us-atlas/states-10m.json?url";

const DATA_URLS = {
  nameFrequency: "./data/name_frequency.json",
  nameLookup: "./data/name_lookup.json",
  metadata: "./data/metadata.json",
};

const VISIBLE_ROWS = 11;
const CENTER_INDEX = 5;
const ROW_HEIGHT = 44;
const RAIL_HEIGHT = VISIBLE_ROWS * ROW_HEIGHT;
const MAP_WIDTH = 1120;
const MAP_HEIGHT = 760;
const SEARCH_DEFAULT = "Franklin";
const ROW_TRANSITION_MS = 240;
const JUMP_TRANSITION_MS = 520;
const INTRO_TYPING_STAGGER_MS = 34;
const INTRO_TYPING_MIN_DURATION_MS = 420;
const INTRO_TYPING_MAX_DURATION_MS = 980;
const INTRO_GAP_AFTER_EDITORIAL_MS = 180;
const INTRO_GAP_AFTER_PREFIX_MS = 130;
const INTRO_SEARCH_REVEAL_MS = 420;
const INTRO_GAP_BEFORE_CITY_MS = 170;
const INTRO_GAP_BEFORE_QUESTION_MS = 110;
const INTRO_QUESTION_REVEAL_MS = 280;
const INTRO_GAP_BEFORE_MAP_MS = 150;
const INITIAL_MAP_STAGGER_MS = 14;
const INITIAL_MAP_STATE_DURATION_MS = 420;
const INITIAL_MAP_SETTLE_MS = 220;
const INITIAL_HIGHLIGHT_REVEAL_DELAY_MS = 170;
const INTRO_GAP_BEFORE_RAIL_MS = 180;
const INTRO_RAIL_ARROW_REVEAL_MS = 260;
const INTRO_RAIL_ROW_INITIAL_GAP_MS = 230;
const INTRO_RAIL_ROW_GAP_DECAY_MS = 24;
const INTRO_RAIL_ROW_MIN_GAP_MS = 92;
const INTRO_RAIL_ROW_TYPING_STAGGER_MS = 22;
const INTRO_RAIL_ROW_MIN_DURATION_MS = 340;
const INTRO_RAIL_ROW_MAX_DURATION_MS = 760;
const INTRO_COPY = "Some city names appear again and again.";
const TITLE_PREFIX_COPY = "How common is";

const app = d3.select("#app");
app.html(`
  <div class="page-shell">
    <div class="composition-layer">
      <div class="layout">
      <aside class="rail-column">
        <div class="focus-rail-shell" aria-label="Focused place-name rail">
          <div class="rail-control-stack rail-control-stack-top" aria-label="Rank navigation controls">
            <button
              id="rail-arrow-top"
              class="rail-arrow rail-arrow-top"
              type="button"
              aria-label="Jump to the top of the ranked list"
              data-arrow="up-double"
            ></button>
            <button
              id="rail-arrow-up"
              class="rail-arrow rail-arrow-up"
              type="button"
              aria-label="Move focus up one row"
              data-arrow="up-single"
            ></button>
          </div>
          <div
            id="focus-rail-window"
            class="focus-rail-window"
            tabindex="0"
            aria-label="Place-name focus rail"
          >
            <div id="focus-rail-track" class="focus-rail-track"></div>
          </div>
          <div class="rail-control-stack rail-control-stack-bottom" aria-label="Rank navigation controls">
            <button
              id="rail-arrow-down"
              class="rail-arrow rail-arrow-down"
              type="button"
              aria-label="Move focus down one row"
              data-arrow="down-single"
            ></button>
            <button
              id="rail-arrow-bottom"
              class="rail-arrow rail-arrow-bottom"
              type="button"
              aria-label="Jump to the bottom of the ranked list"
              data-arrow="down-double"
            ></button>
          </div>
        </div>
      </aside>

      <main class="main-column">
        <header class="intro">
          <p id="intro-small" class="intro-small"></p>
          <h1 class="title-line">
            <span id="title-prefix" class="title-prefix"></span>
            <span id="search-shell" class="search-shell">
              <span id="search-entrance-text" class="search-entrance-text" aria-hidden="true"></span>
              <input
                id="title-search"
                class="title-search"
                type="search"
                autocomplete="off"
                autocapitalize="words"
                spellcheck="false"
                aria-label="Search incorporated place name"
              />
              <span class="title-caret" aria-hidden="true"></span>
            </span>
            <span id="title-question" class="title-question">?</span>
          </h1>
        </header>

        <section class="map-stage">
          <div class="map-figure">
            <div class="map-frame">
              <svg
                id="map-svg"
                class="map-svg"
                viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}"
                preserveAspectRatio="xMidYMid meet"
                aria-label="United States map highlighting states that share the focused place name"
              ></svg>
            </div>
          </div>
        </section>
        <div
          id="state-labels"
          class="state-labels"
          aria-live="polite"
          aria-label="Highlighted states"
        ></div>
      </main>
    </div>
    </div>
  </div>
`);

const railWindow = d3.select("#focus-rail-window");
const railTrack = d3.select("#focus-rail-track");
const railArrowUp = d3.select("#rail-arrow-up");
const railArrowTop = d3.select("#rail-arrow-top");
const railArrowDown = d3.select("#rail-arrow-down");
const railArrowBottom = d3.select("#rail-arrow-bottom");
const searchInput = d3.select("#title-search");
const searchShell = d3.select("#search-shell");
const introSmall = d3.select("#intro-small");
const titlePrefix = d3.select("#title-prefix");
const searchEntranceText = d3.select("#search-entrance-text");
const titleQuestion = d3.select("#title-question");
const svg = d3.select("#map-svg");
const stateLabels = d3.select("#state-labels");
const railShell = d3.select(".focus-rail-shell");
const mapPlane = svg.append("g").attr("class", "map-plane");
const baseStatesLayer = mapPlane.append("g").attr("class", "base-states-layer");
const highlightedStatesLayer = mapPlane.append("g").attr("class", "highlighted-states-layer");
const entranceBordersLayer = mapPlane.append("g").attr("class", "entrance-borders-layer");
const bordersLayer = mapPlane.append("g").attr("class", "borders-layer");
const highlightBordersLayer = mapPlane.append("g").attr("class", "highlight-borders-layer");
const hoveredStateOverlayLayer = mapPlane.append("g").attr("class", "hovered-state-overlay-layer");
const HOVERED_STATE_FALL_DURATION_MS = 220;

function normalizeName(value) {
  return value.trim().toLocaleLowerCase();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderError(message) {
  app.append("div").attr("class", "error-banner").text(message);
}

function buildVisibleRows(records, focusedIndex) {
  return d3.range(VISIBLE_ROWS).map((slot) => {
    const recordIndex = focusedIndex + (slot - CENTER_INDEX);
    const record = records[recordIndex] ?? null;

    return {
      key: record ? record.normalizedName : `empty-${slot}`,
      slot,
      recordIndex,
      record,
      isFocused: slot === CENTER_INDEX && Boolean(record),
    };
  });
}

function pulseSelection(selection, className) {
  const node = selection.node();
  if (!node) {
    return;
  }

  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function getTypingDuration(text) {
  return clamp(
    text.length * INTRO_TYPING_STAGGER_MS + 120,
    INTRO_TYPING_MIN_DURATION_MS,
    INTRO_TYPING_MAX_DURATION_MS,
  );
}

function animateTypingText(selection, text, options = {}) {
  const node = selection.node();
  if (!node) {
    return 0;
  }

  const delay = options.delay ?? 0;
  const duration = options.duration ?? getTypingDuration(text);
  const onComplete = options.onComplete ?? null;
  const startAt = performance.now() + delay;

  node.textContent = "";

  function frame(now) {
    if (now < startAt) {
      window.requestAnimationFrame(frame);
      return;
    }

    const progress = Math.min((now - startAt) / duration, 1);
    const nextLength = Math.ceil(progress * text.length);
    const nextText = text.slice(0, nextLength);

    if (node.textContent !== nextText) {
      node.textContent = nextText;
    }

    if (progress < 1) {
      window.requestAnimationFrame(frame);
      return;
    }

    if (onComplete) {
      onComplete();
    }
  }

  window.requestAnimationFrame(frame);
  return delay + duration;
}

function wait(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function animateTypingTextAsync(selection, text, options = {}) {
  return new Promise((resolve) => {
    animateTypingText(selection, text, {
      ...options,
      onComplete: resolve,
    });
  });
}

function revealIntroNode(selection) {
  selection.classed("is-intro-hidden", false).classed("is-intro-entered", true);
}

function revealRailRow(rowSelection, slot) {
  rowSelection.classed("is-intro-hidden", false).classed("is-intro-entered", true);
  rowSelection
    .interrupt()
    .transition()
    .duration(340)
    .ease(d3.easeCubicOut)
    .style("opacity", 1)
    .style("transform", `translateY(${slot * ROW_HEIGHT}px)`);
}

function animateRailRowText(rowSelection, record) {
  const node = rowSelection.node();
  if (!node || !record) {
    return Promise.resolve();
  }

  const countNode = rowSelection.select(".rail-count").node();
  const nameNode = rowSelection.select(".rail-name").node();
  if (!countNode || !nameNode) {
    return Promise.resolve();
  }

  const countText = String(record.count);
  const fullText = `${countText} ${record.displayName}`;
  const duration = clamp(
    fullText.length * INTRO_RAIL_ROW_TYPING_STAGGER_MS + 140,
    INTRO_RAIL_ROW_MIN_DURATION_MS,
    INTRO_RAIL_ROW_MAX_DURATION_MS,
  );
  const startAt = performance.now();

  countNode.textContent = "";
  nameNode.textContent = "";

  return new Promise((resolve) => {
    function frame(now) {
      const progress = Math.min((now - startAt) / duration, 1);
      const nextLength = Math.ceil(progress * fullText.length);
      const nextText = fullText.slice(0, nextLength);
      const countSlice = nextText.slice(0, countText.length);
      const nameSlice =
        nextText.length > countText.length ? nextText.slice(countText.length + 1) : "";

      if (countNode.textContent !== countSlice) {
        countNode.textContent = countSlice;
      }
      if (nameNode.textContent !== nameSlice) {
        nameNode.textContent = nameSlice;
      }

      if (progress < 1) {
        window.requestAnimationFrame(frame);
        return;
      }

      resolve();
    }

    window.requestAnimationFrame(frame);
  });
}

Promise.all([
  d3.json(DATA_URLS.nameFrequency),
  d3.json(DATA_URLS.nameLookup),
  d3.json(DATA_URLS.metadata),
  d3.json(statesUrl),
])
  .then(([nameFrequency, nameLookup, metadata, statesTopo]) => {
    const excludedStateIds = new Set(metadata.excludedMapStateIds ?? []);
    const stateFeatures = feature(statesTopo, statesTopo.objects.states).features.filter(
      (state) => !excludedStateIds.has(state.id),
    );
    const stateIndex = new Map(stateFeatures.map((state) => [state.id, state]));
    const projection = d3.geoAlbersUsa().fitExtent(
      [
        [8, 16],
        [MAP_WIDTH - 8, MAP_HEIGHT - 18],
      ],
      { type: "FeatureCollection", features: stateFeatures },
    );
    const path = d3.geoPath(projection);

    baseStatesLayer
      .selectAll("path")
      .data(stateFeatures)
      .join("path")
      .attr("class", "base-state-shape")
      .attr("d", path);

    const lookup = new Map(
      Object.entries(nameLookup).map(([normalizedName, index]) => [normalizedName, Number(index)]),
    );

    let focusedIndex =
      lookup.get(normalizeName(metadata.defaultFocusedName ?? SEARCH_DEFAULT)) ??
      lookup.get(normalizeName(SEARCH_DEFAULT)) ??
      0;
    let previousIndex = focusedIndex;
    let hoveredStateId = null;
    let currentHighlightedIds = new Set();
    let currentHighlightedStates = [];
    let inputValue = nameFrequency[focusedIndex]?.displayName ?? SEARCH_DEFAULT;
    let interactionLocked = false;
    let initialEntranceActive = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let initialHighlightRevealPending = false;
    let initialRailRevealPending = initialEntranceActive;
    const longestDisplayName = nameFrequency.reduce(
      (longest, record) =>
        record.displayName.length > longest.length ? record.displayName : longest,
      SEARCH_DEFAULT,
    );

    searchInput.property("value", inputValue);
    searchInput.property("size", longestDisplayName.length + 2);
    searchInput.style("--search-chars", longestDisplayName.length + 2);

    function getFocusedRecord() {
      return nameFrequency[focusedIndex] ?? null;
    }

    function syncSearchValue() {
      const focused = getFocusedRecord();
      inputValue = focused?.displayName ?? "";
      searchInput.property("value", inputValue);
    }

    function updateRail(delta = 0) {
      const rows = buildVisibleRows(nameFrequency, focusedIndex);
      const stepCount = Math.min(VISIBLE_ROWS, Math.abs(delta));
      const travel = Math.sign(delta) * stepCount * ROW_HEIGHT;
      const isJump = Math.abs(delta) > 1;
      const duration = isJump ? JUMP_TRANSITION_MS : ROW_TRANSITION_MS;
      const ease = isJump ? d3.easeCubicInOut : d3.easeCubicOut;

      railTrack.style("height", `${RAIL_HEIGHT}px`);
      railTrack.classed("is-jumping", isJump);

      const rowSelection = railTrack
        .selectAll(".rail-row")
        .data(rows, (d) => d.key)
        .join(
          (enter) =>
            enter
              .append("button")
              .attr("type", "button")
              .attr("class", "rail-row")
              .call((selection) => {
                selection.append("span").attr("class", "rail-count");
                selection.append("span").attr("class", "rail-name");
              })
              .style("transform", (d) => {
                const startY = d.slot * ROW_HEIGHT + travel;
                return `translateY(${startY}px)`;
              })
              .style("opacity", 0)
              .call((selection) =>
                selection
                  .transition()
                  .duration(duration)
                  .ease(ease)
                  .style("transform", (d) => `translateY(${d.slot * ROW_HEIGHT}px)`)
                  .style("opacity", 1),
              ),
          (update) => update,
          (exit) =>
            exit
              .transition()
              .duration(duration)
              .ease(isJump ? d3.easeCubicInOut : d3.easeCubicIn)
              .style("transform", (d) => `translateY(${d.slot * ROW_HEIGHT - travel}px)`)
              .style("opacity", 0)
              .remove(),
        );

      rowSelection
        .attr("class", (d) => (d.isFocused ? "rail-row is-focused" : "rail-row"))
        .attr("disabled", (d) => (d.record ? null : true))
        .attr("aria-label", (d) =>
          d.record ? `${d.record.displayName}, ${d.record.count} occurrences` : "Empty row",
        )
        .on("click", (_, d) => {
          if (!d.record || interactionLocked) {
            return;
          }
          setFocusedIndex(d.recordIndex);
        })
        .transition()
        .duration(duration)
        .ease(ease)
        .style("transform", (d) => `translateY(${d.slot * ROW_HEIGHT}px)`)
        .style("opacity", (d) => (d.record ? 1 : 0));

      rowSelection.each(function (d) {
        const row = d3.select(this);
        row.select(".rail-count").text(d.record && !initialRailRevealPending ? d.record.count : "");
        row
          .select(".rail-name")
          .text(d.record && !initialRailRevealPending ? d.record.displayName : "");
      });

      railArrowUp.classed("is-dimmed", focusedIndex <= 0);
      railArrowTop.classed("is-dimmed", focusedIndex <= 0);
      railArrowDown.classed("is-dimmed", focusedIndex >= nameFrequency.length - 1);
      railArrowBottom.classed("is-dimmed", focusedIndex >= nameFrequency.length - 1);
    }

    function syncHighlightedStateLayers() {
      const nonHoveredStates =
        hoveredStateId == null
          ? currentHighlightedStates
          : currentHighlightedStates.filter((state) => state.id !== hoveredStateId);
      const hoveredState =
        hoveredStateId == null
          ? []
          : currentHighlightedStates.filter((state) => state.id === hoveredStateId);

      highlightedStatesLayer
        .selectAll(".highlighted-state-shape")
        .data(nonHoveredStates, (d) => d.id)
        .join(
          (enter) =>
            enter
              .append("path")
              .attr("class", "highlighted-state-shape")
              .attr("data-state-id", (d) => d.id)
              .attr("d", path)
              .call((selection) => {
                if (!initialHighlightRevealPending) {
                  return;
                }

                selection
                  .style("opacity", 0)
                  .attr("transform", "translate(0,-4)")
                  .transition()
                  .delay((_, index) => index * 24)
                  .duration(220)
                  .ease(d3.easeCubicOut)
                  .style("opacity", 0.88)
                  .attr("transform", "translate(0,0)");
              }),
          (update) => update,
          (exit) => exit.remove(),
        )
        .attr("class", "highlighted-state-shape")
        .attr("data-state-id", (d) => d.id)
        .attr("d", path)
        .on("mouseenter", (_, d) => {
          hoveredStateId = d.id;
          updateHoverState();
        })
        .on("mouseleave", () => {
          hoveredStateId = null;
          updateHoverState();
        });

      const hoveredSelection = hoveredStateOverlayLayer
        .selectAll(".hovered-state-overlay")
        .data(hoveredState, (d) => d.id)
        .join(
          (enter) => {
            const group = enter
              .append("g")
              .attr("class", "hovered-state-overlay is-entering")
              .attr("data-state-id", (d) => d.id);

            const body = group.append("g").attr("class", "hovered-state-overlay-body");
            body.append("path").attr("class", "hovered-state-fill");
            body.append("path").attr("class", "hovered-state-outline hovered-state-outline-white");
            body.append("path").attr("class", "hovered-state-outline hovered-state-outline-black");

            return group;
          },
          (update) => update,
          (exit) =>
            exit.each(function () {
              if (this.hoverLiftFrame != null) {
                cancelAnimationFrame(this.hoverLiftFrame);
                this.hoverLiftFrame = null;
              }
              if (this.hoverExitTimer != null) {
                clearTimeout(this.hoverExitTimer);
              }

              d3.select(this)
                .classed("is-entering", false)
                .classed("is-lifted", false)
                .classed("is-exiting", true)
                .on("mouseenter", null)
                .on("mouseleave", null);

              this.hoverExitTimer = window.setTimeout(() => {
                d3.select(this).remove();
              }, HOVERED_STATE_FALL_DURATION_MS);
            }),
        );

      hoveredSelection
        .attr("data-state-id", (d) => d.id)
        .on("mouseenter", (_, d) => {
          hoveredStateId = d.id;
          updateHoverState();
        })
        .on("mouseleave", () => {
          hoveredStateId = null;
          updateHoverState();
        });

      hoveredSelection.each(function () {
        if (this.hoverExitTimer != null) {
          clearTimeout(this.hoverExitTimer);
          this.hoverExitTimer = null;
        }
        if (this.hoverLiftFrame != null) {
          cancelAnimationFrame(this.hoverLiftFrame);
        }

        const selection = d3.select(this);
        selection.classed("is-exiting", false);

        if (!selection.classed("is-lifted")) {
          this.hoverLiftFrame = window.requestAnimationFrame(() => {
            selection.classed("is-entering", false).classed("is-lifted", true);
            this.hoverLiftFrame = null;
          });
        }
      });

      hoveredSelection.select(".hovered-state-fill").attr("d", path);
      hoveredSelection.select(".hovered-state-outline").attr("d", path);
    }

    function updateMap() {
      const focused = getFocusedRecord();
      currentHighlightedIds = new Set(focused?.mappedStateIds ?? []);
      if (hoveredStateId != null && !currentHighlightedIds.has(hoveredStateId)) {
        hoveredStateId = null;
      }

      currentHighlightedStates = stateFeatures.filter((state) => currentHighlightedIds.has(state.id));
      if (initialEntranceActive) {
        currentHighlightedStates = [];
      }
      syncHighlightedStateLayers();
      const activeHighlightedIds = initialEntranceActive ? new Set() : currentHighlightedIds;

      const visibleBorderMesh = mesh(
        statesTopo,
        statesTopo.objects.states,
        (a, b) =>
          Boolean(a) &&
          a.id !== hoveredStateId &&
          !excludedStateIds.has(a.id) &&
          (!b || b.id !== hoveredStateId) &&
          (!b ||
            (!excludedStateIds.has(b.id) &&
              (!activeHighlightedIds.has(a.id) || !activeHighlightedIds.has(b.id)))),
      );

      bordersLayer
        .selectAll(".state-borders")
        .data(visibleBorderMesh ? [visibleBorderMesh] : [])
        .join("path")
        .attr("class", "state-borders")
        .attr("d", path);

      const highlightedBorderMesh =
        activeHighlightedIds.size > 1
          ? mesh(
              statesTopo,
              statesTopo.objects.states,
              (a, b) =>
                Boolean(a) &&
                Boolean(b) &&
                a.id !== hoveredStateId &&
                b.id !== hoveredStateId &&
                activeHighlightedIds.has(a.id) &&
                activeHighlightedIds.has(b.id) &&
                !excludedStateIds.has(a.id) &&
                !excludedStateIds.has(b.id),
            )
          : null;

      highlightBordersLayer
        .selectAll(".highlight-borders")
        .data(highlightedBorderMesh ? [highlightedBorderMesh] : [])
        .join("path")
        .attr("class", "highlight-borders")
        .attr("d", path);

      const labelData = (focused?.mappedStateIds ?? [])
        .map((stateId) => stateIndex.get(stateId))
        .filter(Boolean);
      const sortedLabels = labelData
        .map((state) => ({ id: state.id, name: state.properties.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      stateLabels
        .selectAll(".state-label")
        .data(initialEntranceActive ? [] : sortedLabels, (d) => d.id)
        .join(
          (enter) =>
            enter
              .append("div")
              .attr("class", "state-label")
              .attr("tabindex", "0")
              .call((selection) => {
                selection
                  .append("span")
                  .attr("class", "state-label-bullet")
                  .attr("aria-hidden", "true");
                selection.append("span").attr("class", "state-label-text");
                if (initialHighlightRevealPending) {
                  selection
                    .style("opacity", 0)
                    .style("transform", "translateY(4px)")
                    .transition()
                    .delay((_, index) => 80 + index * 20)
                    .duration(220)
                    .ease(d3.easeCubicOut)
                    .style("opacity", null)
                    .style("transform", null);
                }
              }),
          (update) => update,
          (exit) => exit.remove(),
        )
        .attr("data-state-id", (d) => d.id)
        .classed("is-hovered", (d) => d.id === hoveredStateId)
        .on("mouseenter", (_, d) => {
          hoveredStateId = d.id;
          updateHoverState();
        })
        .on("mouseleave", () => {
          hoveredStateId = null;
          updateHoverState();
        })
        .on("focus", (_, d) => {
          hoveredStateId = d.id;
          updateHoverState();
        })
        .on("blur", () => {
          hoveredStateId = null;
          updateHoverState();
        })
        .select(".state-label-text")
        .text((d) => d.name);

      initialHighlightRevealPending = false;
    }

    function updateHoverState() {
      syncHighlightedStateLayers();
      const activeHighlightedIds = initialEntranceActive ? new Set() : currentHighlightedIds;

      const visibleBorderMesh = mesh(
        statesTopo,
        statesTopo.objects.states,
        (a, b) =>
          Boolean(a) &&
          a.id !== hoveredStateId &&
          !excludedStateIds.has(a.id) &&
          (!b || b.id !== hoveredStateId) &&
          (!b ||
            (!excludedStateIds.has(b.id) &&
              (!activeHighlightedIds.has(a.id) || !activeHighlightedIds.has(b.id)))),
      );

      bordersLayer
        .selectAll(".state-borders")
        .data(visibleBorderMesh ? [visibleBorderMesh] : [])
        .join("path")
        .attr("class", "state-borders")
        .attr("d", path);

      const highlightedBorderMesh =
        activeHighlightedIds.size > 1
          ? mesh(
              statesTopo,
              statesTopo.objects.states,
              (a, b) =>
                Boolean(a) &&
                Boolean(b) &&
                a.id !== hoveredStateId &&
                b.id !== hoveredStateId &&
                activeHighlightedIds.has(a.id) &&
                activeHighlightedIds.has(b.id) &&
                !excludedStateIds.has(a.id) &&
                !excludedStateIds.has(b.id),
            )
          : null;

      highlightBordersLayer
        .selectAll(".highlight-borders")
        .data(highlightedBorderMesh ? [highlightedBorderMesh] : [])
        .join("path")
        .attr("class", "highlight-borders")
        .attr("d", path);

      stateLabels
        .selectAll(".state-label")
        .classed("is-hovered", (d) => d.id === hoveredStateId);
    }

    function render(delta = 0) {
      updateRail(delta);
      updateMap();
    }

    function setFocusedIndex(nextIndex, options = {}) {
      const boundedIndex = clamp(nextIndex, 0, nameFrequency.length - 1);
      if (boundedIndex === focusedIndex && !options.force) {
        if (!options.preserveInput) {
          syncSearchValue();
        }
        render(0);
        return;
      }

      previousIndex = focusedIndex;
      focusedIndex = boundedIndex;

      if (!options.preserveInput) {
        syncSearchValue();
      }

      pulseSelection(searchShell, "is-settling");
      pulseSelection(stateLabels, "is-settling");
      svg.classed("is-settling", true);
      render(focusedIndex - previousIndex);
      window.setTimeout(() => {
        svg.classed("is-settling", false);
      }, JUMP_TRANSITION_MS);
    }

    function moveFocus(step) {
      if (interactionLocked) {
        return;
      }

      const nextIndex = clamp(focusedIndex + step, 0, nameFrequency.length - 1);
      if (nextIndex === focusedIndex) {
        return;
      }

      interactionLocked = true;
      setFocusedIndex(nextIndex);
      window.setTimeout(() => {
        interactionLocked = false;
      }, ROW_TRANSITION_MS + 40);
    }

    function jumpFocus(targetIndex) {
      if (interactionLocked || targetIndex === focusedIndex) {
        return;
      }

      interactionLocked = true;
      setFocusedIndex(targetIndex);
      window.setTimeout(() => {
        interactionLocked = false;
      }, JUMP_TRANSITION_MS + 60);
    }

    function handleSearchCommit() {
      const normalized = normalizeName(searchInput.property("value"));
      const matchedIndex = lookup.get(normalized);

      if (matchedIndex == null) {
        syncSearchValue();
        return;
      }

      setFocusedIndex(matchedIndex);
    }

    async function playInitialEntrance() {
      const focused = getFocusedRecord();
      const cityName = focused?.displayName ?? SEARCH_DEFAULT;
      const stateEntranceOrder = [...stateFeatures]
        .map((state) => ({ state, centroid: path.centroid(state) }))
        .sort((a, b) => a.centroid[1] - b.centroid[1] || a.centroid[0] - b.centroid[0])
        .map(({ state }) => state);
      const railRows = railTrack
        .selectAll(".rail-row")
        .filter((d) => d.record)
        .classed("is-intro-hidden", true)
        .style("opacity", 0)
        .style("transform", (d) => `translateY(${d.slot * ROW_HEIGHT - 6}px)`);
      railArrowTop.classed("is-intro-hidden", true);
      railArrowUp.classed("is-intro-hidden", true);
      railArrowDown.classed("is-intro-hidden", true);
      railArrowBottom.classed("is-intro-hidden", true);

      introSmall.attr("aria-label", INTRO_COPY);
      titlePrefix.attr("aria-label", TITLE_PREFIX_COPY);
      interactionLocked = true;
      introSmall.classed("is-intro-hidden", false);
      titlePrefix.classed("is-intro-hidden", false);
      searchShell.classed("is-entrance-active", true);
      searchShell.classed("is-intro-hidden", true);
      titleQuestion.classed("is-intro-hidden", true);
      railShell.classed("is-intro-ready", true);
      searchInput.attr("disabled", true);
      searchInput.property("value", "");
      searchEntranceText.text("");

      await animateTypingTextAsync(introSmall, INTRO_COPY);
      await wait(INTRO_GAP_AFTER_EDITORIAL_MS);
      await animateTypingTextAsync(titlePrefix, TITLE_PREFIX_COPY);
      await wait(INTRO_GAP_AFTER_PREFIX_MS);

      revealIntroNode(searchShell);
      await wait(INTRO_SEARCH_REVEAL_MS + INTRO_GAP_BEFORE_CITY_MS);
      await animateTypingTextAsync(searchEntranceText, cityName);
      await wait(INTRO_GAP_BEFORE_QUESTION_MS);
      revealIntroNode(titleQuestion);
      await wait(INTRO_QUESTION_REVEAL_MS + INTRO_GAP_BEFORE_MAP_MS);

      svg.classed("is-entrance-active", true);
      entranceBordersLayer
        .selectAll(".entrance-state-border")
        .data(stateEntranceOrder, (d) => d.id)
        .join("path")
        .attr("class", "entrance-state-border")
        .attr("d", path)
        .attr("transform", "translate(0,-6)")
        .style("opacity", 0)
        .transition()
        .delay((_, index) => index * INITIAL_MAP_STAGGER_MS)
        .duration(INITIAL_MAP_STATE_DURATION_MS)
        .ease(d3.easeCubicOut)
        .attr("transform", "translate(0,0)")
        .style("opacity", 1);

      await wait(
        (stateEntranceOrder.length - 1) * INITIAL_MAP_STAGGER_MS +
          INITIAL_MAP_STATE_DURATION_MS +
          INITIAL_MAP_SETTLE_MS,
      );

      initialEntranceActive = false;
      initialHighlightRevealPending = true;
      svg.classed("is-entrance-active", false);
      searchShell.classed("is-entrance-active", false);
      searchEntranceText.text("");
      searchInput.property("value", cityName);
      searchInput.attr("disabled", null);
      render(0);

      await wait(INITIAL_HIGHLIGHT_REVEAL_DELAY_MS + INTRO_GAP_BEFORE_RAIL_MS);
      entranceBordersLayer.selectAll(".entrance-state-border").remove();

      revealIntroNode(railArrowTop);
      await wait(INTRO_RAIL_ARROW_REVEAL_MS * 0.75);
      revealIntroNode(railArrowUp);
      await wait(INTRO_RAIL_ARROW_REVEAL_MS);

      const rowAnimations = [];
      railRows.each(function (d, index) {
        const row = d3.select(this);
        const startDelay = d3.sum(
          d3.range(index).map((rowIndex) =>
            Math.max(
              INTRO_RAIL_ROW_MIN_GAP_MS,
              INTRO_RAIL_ROW_INITIAL_GAP_MS - rowIndex * INTRO_RAIL_ROW_GAP_DECAY_MS,
            ),
          ),
        );

        rowAnimations.push(
          (async () => {
            await wait(startDelay);
            revealRailRow(row, d.slot);
            await animateRailRowText(row, d.record);
          })(),
        );
      });

      await Promise.all(rowAnimations);
      revealIntroNode(railArrowDown);
      await wait(INTRO_RAIL_ARROW_REVEAL_MS * 0.75);
      revealIntroNode(railArrowBottom);
      await wait(INTRO_RAIL_ARROW_REVEAL_MS * 0.7);

      initialRailRevealPending = false;
      railShell.classed("is-intro-ready", false);
      interactionLocked = false;
      render(0);
    }

    railWindow.on("wheel", (event) => {
      event.preventDefault();
      event.stopPropagation();
      moveFocus(event.deltaY > 0 ? 1 : -1);
    });

    railArrowUp.on("click", () => {
      moveFocus(-1);
      railWindow.node()?.focus();
    });

    railArrowTop.on("click", () => {
      jumpFocus(0);
      railWindow.node()?.focus();
    });

    railArrowDown.on("click", () => {
      moveFocus(1);
      railWindow.node()?.focus();
    });

    railArrowBottom.on("click", () => {
      jumpFocus(nameFrequency.length - 1);
      railWindow.node()?.focus();
    });

    railWindow.on("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(1);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(-1);
      }
      if (event.key === "PageDown") {
        event.preventDefault();
        jumpFocus(nameFrequency.length - 1);
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        jumpFocus(0);
      }
      if (event.key === "Home") {
        event.preventDefault();
        jumpFocus(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        jumpFocus(nameFrequency.length - 1);
      }
    });

    d3.select(window).on("keydown.focus-rail", (event) => {
      const activeElement = document.activeElement;
      if (activeElement === searchInput.node()) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(1);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(-1);
      }
      if (event.key === "Home") {
        event.preventDefault();
        jumpFocus(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        jumpFocus(nameFrequency.length - 1);
      }
    });

    d3.select(window).on("wheel.focus-rail", (event) => {
      if (window.innerWidth <= 980) {
        return;
      }

      const activeElement = document.activeElement;
      if (activeElement === searchInput.node()) {
        return;
      }

      event.preventDefault();
      moveFocus(event.deltaY > 0 ? 1 : -1);
    });

    searchInput
      .on("focus", (event) => {
        event.target.select();
      })
      .on("input", (event) => {
        inputValue = event.target.value;
        const matchedIndex = lookup.get(normalizeName(inputValue));
        if (matchedIndex != null) {
          setFocusedIndex(matchedIndex, { preserveInput: false });
        }
      })
      .on("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          handleSearchCommit();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          syncSearchValue();
          searchInput.node().blur();
        }
      })
      .on("blur", () => {
        handleSearchCommit();
      });

    if (initialEntranceActive) {
      render(0);
      playInitialEntrance();
      return;
    }

    introSmall.text(INTRO_COPY);
    titlePrefix.text(TITLE_PREFIX_COPY);
    render(0);
  })
  .catch((error) => {
    console.error(error);
    renderError(
      "Data assets are missing or unreadable. Rebuild them with `python3 scripts/build_data.py`, then run `npm run build` or `npm run dev`.",
    );
  });
