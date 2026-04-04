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
          <p class="intro-small">Some city names appear again and again.</p>
          <h1 class="title-line">
            <span class="title-prefix">How common is </span>
            <span id="search-shell" class="search-shell">
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
            <span>?</span>
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
const svg = d3.select("#map-svg");
const stateLabels = d3.select("#state-labels");
const mapPlane = svg.append("g").attr("class", "map-plane");
const baseStatesLayer = mapPlane.append("g").attr("class", "base-states-layer");
const highlightedStatesLayer = mapPlane.append("g").attr("class", "highlighted-states-layer");
const bordersLayer = mapPlane.append("g").attr("class", "borders-layer");
const highlightBordersLayer = mapPlane.append("g").attr("class", "highlight-borders-layer");

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
    let inputValue = nameFrequency[focusedIndex]?.displayName ?? SEARCH_DEFAULT;
    let interactionLocked = false;
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
        .html((d) =>
          d.record
            ? `<span class="rail-count">${d.record.count}</span><span class="rail-name">${d.record.displayName}</span>`
            : "",
        )
        .on("click", (_, d) => {
          if (!d.record) {
            return;
          }
          setFocusedIndex(d.recordIndex);
        })
        .transition()
        .duration(duration)
        .ease(ease)
        .style("transform", (d) => `translateY(${d.slot * ROW_HEIGHT}px)`)
        .style("opacity", (d) => (d.record ? 1 : 0));

      railArrowUp.classed("is-dimmed", focusedIndex <= 0);
      railArrowTop.classed("is-dimmed", focusedIndex <= 0);
      railArrowDown.classed("is-dimmed", focusedIndex >= nameFrequency.length - 1);
      railArrowBottom.classed("is-dimmed", focusedIndex >= nameFrequency.length - 1);
    }

    function updateMap() {
      const focused = getFocusedRecord();
      const highlightedIds = new Set(focused?.mappedStateIds ?? []);
      if (hoveredStateId != null && !highlightedIds.has(hoveredStateId)) {
        hoveredStateId = null;
      }

      const highlightedStates = stateFeatures.filter((state) => highlightedIds.has(state.id));

      highlightedStatesLayer
        .selectAll(".highlighted-state-shape")
        .data(highlightedStates, (d) => d.id)
        .join("path")
        .attr("class", "highlighted-state-shape")
        .attr("data-state-id", (d) => d.id)
        .attr("d", path)
        .classed("is-hovered", (d) => d.id === hoveredStateId)
        .on("mouseenter", (_, d) => {
          hoveredStateId = d.id;
          updateHoverState();
        })
        .on("mouseleave", () => {
          hoveredStateId = null;
          updateHoverState();
        });

      const visibleBorderMesh = mesh(
        statesTopo,
        statesTopo.objects.states,
        (a, b) =>
          Boolean(a) &&
          !excludedStateIds.has(a.id) &&
          (!b ||
            (!excludedStateIds.has(b.id) &&
              (!highlightedIds.has(a.id) || !highlightedIds.has(b.id)))),
      );

      bordersLayer
        .selectAll(".state-borders")
        .data(visibleBorderMesh ? [visibleBorderMesh] : [])
        .join("path")
        .attr("class", "state-borders")
        .attr("d", path);

      const highlightedBorderMesh =
        highlightedIds.size > 1
          ? mesh(
              statesTopo,
              statesTopo.objects.states,
              (a, b) =>
                Boolean(a) &&
                Boolean(b) &&
                highlightedIds.has(a.id) &&
                highlightedIds.has(b.id) &&
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
        .data(sortedLabels, (d) => d.id)
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
    }

    function updateHoverState() {
      highlightedStatesLayer
        .selectAll(".highlighted-state-shape")
        .classed("is-hovered", (d) => d.id === hoveredStateId);

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

    render(0);
  })
  .catch((error) => {
    console.error(error);
    renderError(
      "Data assets are missing or unreadable. Rebuild them with `python3 scripts/build_data.py`, then run `npm run build` or `npm run dev`.",
    );
  });
