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

const app = d3.select("#app");
app.html(`
  <div class="page-shell">
    <div class="layout">
      <aside class="rail-column">
        <div class="focus-rail-shell" aria-label="Focused place-name rail">
          <button
            id="rail-arrow-top"
            class="rail-arrow rail-arrow-top"
            type="button"
            aria-label="Move focus up one row"
          ></button>
          <div
            id="focus-rail-window"
            class="focus-rail-window"
            tabindex="0"
            aria-label="Place-name focus rail"
          >
            <div id="focus-rail-track" class="focus-rail-track"></div>
          </div>
          <button
            id="rail-arrow-bottom"
            class="rail-arrow rail-arrow-bottom"
            type="button"
            aria-label="Move focus down one row"
          ></button>
        </div>
      </aside>

      <main class="main-column">
        <header class="intro">
          <p class="intro-small">Some city names appear again and again.</p>
          <h1 class="title-line">
            <span>How common is </span>
            <input
              id="title-search"
              class="title-search"
              type="search"
              autocomplete="off"
              autocapitalize="words"
              spellcheck="false"
              aria-label="Search incorporated place name"
            />
            <span>?</span>
          </h1>
        </header>

        <section class="map-stage">
          <div class="map-figure">
            <div class="map-tilt">
              <svg
                id="map-svg"
                class="map-svg"
                viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}"
                preserveAspectRatio="xMidYMid meet"
                aria-label="United States map highlighting states that share the focused place name"
              ></svg>
            </div>
            <div
              id="state-labels"
              class="state-labels"
              aria-live="polite"
              aria-label="Highlighted states"
            ></div>
          </div>
        </section>
      </main>
    </div>
  </div>
`);

const railWindow = d3.select("#focus-rail-window");
const railTrack = d3.select("#focus-rail-track");
const railArrowTop = d3.select("#rail-arrow-top");
const railArrowBottom = d3.select("#rail-arrow-bottom");
const searchInput = d3.select("#title-search");
const svg = d3.select("#map-svg");
const stateLabels = d3.select("#state-labels");
const mapPlane = svg.append("g").attr("class", "map-plane");
const statesLayer = mapPlane.append("g").attr("class", "states-layer");
const bordersLayer = mapPlane.append("g").attr("class", "borders-layer");

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
    const stateMesh = mesh(
      statesTopo,
      statesTopo.objects.states,
      (a, b) => a !== b && !excludedStateIds.has(a.id) && !excludedStateIds.has(b.id),
    );

    const stateIndex = new Map(stateFeatures.map((state) => [state.id, state]));
    const projection = d3.geoAlbersUsa().fitExtent(
      [
        [18, 28],
        [MAP_WIDTH - 18, MAP_HEIGHT - 34],
      ],
      { type: "FeatureCollection", features: stateFeatures },
    );
    const path = d3.geoPath(projection);

    statesLayer
      .selectAll("path")
      .data(stateFeatures)
      .join("path")
      .attr("class", "state-shape")
      .attr("d", path);

    bordersLayer
      .append("path")
      .datum(stateMesh)
      .attr("class", "state-borders")
      .attr("d", path);

    const lookup = new Map(
      Object.entries(nameLookup).map(([normalizedName, index]) => [normalizedName, Number(index)]),
    );

    let focusedIndex =
      lookup.get(normalizeName(metadata.defaultFocusedName ?? SEARCH_DEFAULT)) ??
      lookup.get(normalizeName(SEARCH_DEFAULT)) ??
      0;
    let previousIndex = focusedIndex;
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
      const travel = Math.sign(delta) * Math.min(VISIBLE_ROWS, Math.abs(delta)) * ROW_HEIGHT;
      const duration = Math.abs(delta) <= 1 ? 220 : 320;

      railTrack.style("height", `${RAIL_HEIGHT}px`);

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
                  .ease(d3.easeCubicOut)
                  .style("transform", (d) => `translateY(${d.slot * ROW_HEIGHT}px)`)
                  .style("opacity", 1),
              ),
          (update) => update,
          (exit) =>
            exit
              .transition()
              .duration(duration)
              .ease(d3.easeCubicIn)
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
        .ease(d3.easeCubicOut)
        .style("transform", (d) => `translateY(${d.slot * ROW_HEIGHT}px)`)
        .style("opacity", (d) => (d.record ? 1 : 0));

      railArrowTop.classed("is-dimmed", focusedIndex <= 0);
      railArrowBottom.classed("is-dimmed", focusedIndex >= nameFrequency.length - 1);
    }

    function updateMap() {
      const focused = getFocusedRecord();
      const highlightedIds = new Set(focused?.mappedStateIds ?? []);

      statesLayer
        .selectAll(".state-shape")
        .attr("class", (d) =>
          highlightedIds.has(d.id) ? "state-shape is-highlighted" : "state-shape",
        );

      const highlightedStates = (focused?.mappedStateIds ?? [])
        .map((stateId) => stateIndex.get(stateId))
        .filter(Boolean);
      const labelData = highlightedStates
        .map((state) => ({ id: state.id, name: state.properties.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      stateLabels
        .selectAll(".state-label")
        .data(labelData, (d) => d.id)
        .join(
          (enter) =>
            enter
              .append("div")
              .attr("class", "state-label")
              .call((selection) => {
                selection.append("span").attr("class", "state-label-bullet").attr("aria-hidden", "true");
                selection.append("span").attr("class", "state-label-text");
              }),
          (update) => update,
          (exit) => exit.remove(),
        )
        .select(".state-label-text")
        .text((d) => d.name);
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

      render(focusedIndex - previousIndex);
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
      }, 230);
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

    railArrowTop.on("click", () => {
      moveFocus(-1);
      railWindow.node()?.focus();
    });

    railArrowBottom.on("click", () => {
      moveFocus(1);
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
