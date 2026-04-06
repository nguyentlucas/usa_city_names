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
const LOCAL_TRANSITION_MS = 220;
const PAGE_TRANSITION_MS = 340;
const JUMP_TRANSITION_MS = 520;
const PAGE_STEP = VISIBLE_ROWS;
const INTRO_TYPING_STAGGER_MS = 42;
const INTRO_TYPING_MIN_DURATION_MS = 760;
const INTRO_TYPING_MAX_DURATION_MS = 1600;
const INTRO_GAP_AFTER_EDITORIAL_MS = 340;
const INTRO_GAP_AFTER_PREFIX_MS = 280;
const INTRO_SEARCH_REVEAL_MS = 760;
const INTRO_GAP_BEFORE_CITY_MS = 300;
const INTRO_GAP_BEFORE_QUESTION_MS = 220;
const INTRO_QUESTION_REVEAL_MS = 420;
const INTRO_GAP_BEFORE_MAP_MS = 300;
const INITIAL_MAP_STAGGER_MS = 22;
const INITIAL_MAP_STATE_DURATION_MS = 680;
const INITIAL_MAP_SETTLE_MS = 340;
const INITIAL_HIGHLIGHT_REVEAL_DELAY_MS = 220;
const INITIAL_HIGHLIGHT_FILL_MS = 380;
const INITIAL_HIGHLIGHT_GROUP_OVERLAP_MS = 132;
const INITIAL_HIGHLIGHT_WITHIN_GROUP_MS = 62;
const INITIAL_HIGHLIGHT_GROUP_MIN = 2;
const INITIAL_HIGHLIGHT_GROUP_MAX = 3;
const STATE_LABEL_TYPING_STAGGER_MS = 28;
const STATE_LABEL_TYPING_MIN_DURATION_MS = 220;
const STATE_LABEL_TYPING_MAX_DURATION_MS = 640;
const INTRO_GAP_BEFORE_RAIL_MS = 260;
const INTRO_RAIL_ARROW_REVEAL_MS = 240;
const INTRO_RAIL_ROW_CASCADE_GAP_MS = 96;
const INTRO_RAIL_ROW_TYPING_STAGGER_MS = 20;
const INTRO_RAIL_ROW_MIN_DURATION_MS = 340;
const INTRO_RAIL_ROW_MAX_DURATION_MS = 720;
const INTRO_RAIL_SELECTION_SWIPE_MS = 320;
const SPRITE_MIN_LIFETIME_MS = 1500;
const SPRITE_MAX_LIFETIME_MS = 2700;
const SPRITE_COOLDOWN_MS = 320;
const SPRITE_MAX_ACTIVE = 5;
const SPRITE_ORIGIN_OFFSET_X = -6;
const SPRITE_ORIGIN_OFFSET_Y = -5;
const SPRITE_TYPES = [
  {
    name: "bird",
    weight: 0.35,
    viewBox: "0 0 16 16",
    markup:
      '<path d="M1 8H4V7H6V6H7V5H8V4H9V5H10V6H12V7H15V8H12V9H10V10H8V9H7V10H5V9H4V8H1Z" />',
  },
  {
    name: "plane",
    weight: 0.35,
    viewBox: "0 0 16 16",
    markup:
      '<path d="M1 8H6V5H9V3H11V5H15V6H12V8H15V9H11V11H9V9H6V8H1Z" />',
  },
  {
    name: "spark",
    weight: 0.3,
    viewBox: "0 0 16 16",
    markup:
      '<path d="M8 1H9V3H11V5H13V6H11V8H9V10H11V12H13V13H11V15H9V13H7V11H5V13H3V12H5V10H7V8H5V6H3V5H5V3H7V1H8Z" />',
  },
];
const BACKGROUND_SPRITE_BLOCKED_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[role='link']",
  ".intro",
  ".title-line",
  ".search-shell",
  ".rail-row",
  ".rail-arrow",
  ".focus-rail-shell",
  ".focus-rail-window",
  ".focus-rail-track",
  ".state-summary",
  ".state-summary-card",
  ".state-summary-count",
  ".state-summary-label",
  ".base-state-shape",
  ".highlighted-state",
  ".highlighted-state-fill",
  ".highlighted-state-outline",
  ".hovered-state-overlay",
  ".hovered-state-fill",
  ".hovered-state-outline",
  ".state-borders",
  ".highlight-borders",
  ".entrance-state-border",
  ".state-label",
  "[data-state-id]",
].join(", ");
const INTRO_COPY = "Some city's name appear again and again.";
const TITLE_PREFIX_COPY = "How common is";

const app = d3.select("#app");
app.html(`
  <div class="page-shell">
    <div class="composition-layer">
      <div class="layout">
      <aside class="rail-column">
        <div class="focus-rail-shell is-pristine-hidden" aria-label="Focused place-name rail">
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
              aria-label="Move focus up by the previous visible set"
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
              aria-label="Move focus down by the next visible set"
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
          <p id="intro-small" class="intro-small is-intro-hidden"></p>
          <h1 class="title-line">
            <span id="title-prefix" class="title-prefix is-intro-hidden"></span>
            <span id="search-shell" class="search-shell is-intro-hidden">
              <span id="search-entrance-text" class="search-entrance-text" aria-hidden="true"></span>
              <input
                id="title-search"
                class="title-search"
                type="search"
                autocomplete="off"
                autocapitalize="words"
                spellcheck="false"
                aria-label="Search place name"
              />
              <span class="title-caret" aria-hidden="true"></span>
            </span>
            <span id="title-question" class="title-question is-intro-hidden">?</span>
          </h1>
        </header>
        <section class="map-stage is-pristine-hidden">
          <div class="map-figure">
            <div class="map-frame">
              <section
                id="state-summary"
                class="state-summary is-pristine-hidden"
                aria-live="polite"
                aria-label="Number of states represented"
              >
                <div id="state-summary-card" class="state-summary-card">
                  <div id="state-summary-count" class="state-summary-count"></div>
                  <div id="state-summary-label" class="state-summary-label"></div>
                </div>
              </section>
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
          class="state-labels is-pristine-hidden"
          aria-live="polite"
          aria-label="Highlighted states"
        ></div>
      </main>
    </div>
    <div id="sprite-layer" class="sprite-layer" aria-hidden="true"></div>
    </div>
  </div>
`);

const pageShell = d3.select(".page-shell");
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
const stateSummary = d3.select("#state-summary");
const stateSummaryCard = d3.select("#state-summary-card");
const stateSummaryCount = d3.select("#state-summary-count");
const stateSummaryLabel = d3.select("#state-summary-label");
const svg = d3.select("#map-svg");
const stateLabels = d3.select("#state-labels");
const railShell = d3.select(".focus-rail-shell");
const mapStage = d3.select(".map-stage");
const spriteLayer = d3.select("#sprite-layer");
const mapPlane = svg.append("g").attr("class", "map-plane");
const defs = svg.append("defs");
const baseStatesLayer = mapPlane.append("g").attr("class", "base-states-layer");
const highlightedStatesLayer = mapPlane.append("g").attr("class", "highlighted-states-layer");
const entranceBordersLayer = mapPlane.append("g").attr("class", "entrance-borders-layer");
const bordersLayer = mapPlane.append("g").attr("class", "borders-layer");
const highlightBordersLayer = mapPlane.append("g").attr("class", "highlight-borders-layer");
const hoveredStateOverlayLayer = mapPlane.append("g").attr("class", "hovered-state-overlay-layer");
const HOVERED_STATE_FALL_DURATION_MS = 220;
const MAP_FIT_TOP_INSET = 4;
const MAP_FIT_RIGHT_INSET = 4;
const MAP_FIT_BOTTOM_INSET = 6;
const MAP_FIT_LEFT_INSET = 4;

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

function revealPristineNode(selection) {
  selection.classed("is-pristine-hidden", false).classed("is-pristine-entered", true);
}

function getStateSummaryCopy(record) {
  const stateCount = record?.stateCount ?? 0;
  return {
    count: String(stateCount),
    label: stateCount === 1 ? "state" : "states",
  };
}

function prepareStateSummaryIntro() {
  stateSummaryCard.classed("is-intro-hidden", true).classed("is-intro-entered", false);
  stateSummaryCount.classed("is-intro-hidden", true).classed("is-intro-entered", false).text("");
  stateSummaryLabel.classed("is-intro-hidden", true).classed("is-intro-entered", false).text("");
}

function revealStateSummaryInstant(record) {
  const { count, label } = getStateSummaryCopy(record);
  stateSummaryCard.classed("is-intro-hidden", false).classed("is-intro-entered", true);
  stateSummaryCount.classed("is-intro-hidden", false).classed("is-intro-entered", true).text(count);
  stateSummaryLabel.classed("is-intro-hidden", false).classed("is-intro-entered", true).text(label);
  stateSummaryCard.attr("aria-label", `${count} ${label}`);
}

function animateStateSummaryIntro(record) {
  const { count, label } = getStateSummaryCopy(record);
  revealIntroNode(stateSummaryCard);
  revealIntroNode(stateSummaryCount);
  revealIntroNode(stateSummaryLabel);
  stateSummaryCard.attr("aria-label", `${count} ${label}`);

  return Promise.all([
    animateTypingTextAsync(stateSummaryCount, count),
    animateTypingTextAsync(stateSummaryLabel, label),
  ]);
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

function getStateLabelTypingDuration(text) {
  return clamp(
    text.length * STATE_LABEL_TYPING_STAGGER_MS + 120,
    STATE_LABEL_TYPING_MIN_DURATION_MS,
    STATE_LABEL_TYPING_MAX_DURATION_MS,
  );
}

function animateStateLabelText(labelSelection, label) {
  const node = labelSelection.node();
  if (!node || !label) {
    return Promise.resolve();
  }

  labelSelection.interrupt();
  labelSelection.style("opacity", 0).style("transform", "translateY(4px)");
  labelSelection
    .transition()
    .duration(220)
    .ease(d3.easeCubicOut)
    .style("opacity", null)
    .style("transform", null);

  return animateTypingTextAsync(labelSelection.select(".state-label-text"), label.name, {
    duration: getStateLabelTypingDuration(label.name),
  });
}

function getHighlightClipId(stateId) {
  return `intro-highlight-clip-${String(stateId).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function ensureHighlightClipRect(stateId) {
  const clipId = getHighlightClipId(stateId);
  let clipPath = defs.select(`clipPath#${clipId}`);

  if (clipPath.empty()) {
    clipPath = defs
      .append("clipPath")
      .attr("id", clipId)
      .attr("clipPathUnits", "objectBoundingBox");

    clipPath
      .append("rect")
      .attr("class", "highlight-fill-clip-rect")
      .attr("x", -0.02)
      .attr("y", -0.02)
      .attr("width", 0)
      .attr("height", 1.04);
  }

  return clipPath.select("rect");
}

function buildHighlightClusters(states) {
  const clusters = [];
  let index = 0;

  while (index < states.length) {
    const remaining = states.length - index;
    let size = INITIAL_HIGHLIGHT_GROUP_MIN + (clusters.length % 2);
    size = Math.min(size, INITIAL_HIGHLIGHT_GROUP_MAX, remaining);

    if (remaining > INITIAL_HIGHLIGHT_GROUP_MAX && remaining - size < INITIAL_HIGHLIGHT_GROUP_MIN) {
      size = remaining - INITIAL_HIGHLIGHT_GROUP_MIN;
    }

    clusters.push(states.slice(index, index + size));
    index += size;
  }

  return clusters;
}

function animateRailSelectionSwipe(rowSelection) {
  const node = rowSelection.node();
  if (!node) {
    return Promise.resolve();
  }

  rowSelection.classed("is-intro-swiping", false);
  void node.offsetWidth;
  rowSelection.classed("is-intro-swiping", true);

  return wait(INTRO_RAIL_SELECTION_SWIPE_MS);
}

function shuffle(items) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function chooseSpriteType() {
  const roll = Math.random();
  let threshold = 0;

  for (const spriteType of SPRITE_TYPES) {
    threshold += spriteType.weight;
    if (roll <= threshold) {
      return spriteType;
    }
  }

  return SPRITE_TYPES[SPRITE_TYPES.length - 1];
}

function getBackgroundClickTarget(target) {
  const element = target instanceof Element ? target : target?.parentElement;
  if (!(element instanceof Element)) {
    return null;
  }

  if (element.closest(BACKGROUND_SPRITE_BLOCKED_SELECTOR)) {
    return null;
  }

  return element.closest(".page-shell");
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
        [MAP_FIT_LEFT_INSET, MAP_FIT_TOP_INSET],
        [MAP_WIDTH - MAP_FIT_RIGHT_INSET, MAP_HEIGHT - MAP_FIT_BOTTOM_INSET],
      ],
      { type: "FeatureCollection", features: stateFeatures },
    );
    const path = d3.geoPath(projection);

    const lookup = new Map(
      Object.entries(nameLookup).map(([normalizedName, index]) => [normalizedName, Number(index)]),
    );

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let focusedIndex =
      lookup.get(normalizeName(metadata.defaultFocusedName ?? SEARCH_DEFAULT)) ??
      lookup.get(normalizeName(SEARCH_DEFAULT)) ??
      0;
    let previousIndex = focusedIndex;
    let hoveredStateId = null;
    let currentHighlightedIds = new Set();
    let introActivatedStateIds = new Set();
    let introAnimatingStateIds = new Set();
    let currentHighlightedStates = [];
    let inputValue = nameFrequency[focusedIndex]?.displayName ?? SEARCH_DEFAULT;
    let interactionLocked = false;
    let initialEntranceActive = !prefersReducedMotion;
    let initialMapRevealPending = initialEntranceActive;
    let initialHighlightRevealPending = false;
    let initialLabelRevealPending = initialEntranceActive;
    let initialRailRevealPending = initialEntranceActive;
    let introRailTextPending = initialEntranceActive;
    let introRailSelectionPending = initialEntranceActive;
    let baseMapReady = false;
    let activeSpriteCount = 0;
    let lastSpriteAt = -Infinity;
    let railMotionTimer = null;
    const longestDisplayName = nameFrequency.reduce(
      (longest, record) =>
        record.displayName.length > longest.length ? record.displayName : longest,
      SEARCH_DEFAULT,
    );

    searchInput.property("value", inputValue);
    searchInput.property("size", longestDisplayName.length + 2);
    searchInput.style("--search-chars", longestDisplayName.length + 2);

    function getRailMotion(delta, mode = "local") {
      if (mode === "jump") {
        return {
          mode,
          duration: JUMP_TRANSITION_MS,
          ease: d3.easeCubicInOut,
          travel: RAIL_HEIGHT,
          lockMs: JUMP_TRANSITION_MS + 60,
        };
      }

      if (mode === "page") {
        return {
          mode,
          duration: PAGE_TRANSITION_MS,
          ease: d3.easePolyOut.exponent(3.2),
          travel: Math.min(Math.abs(delta), PAGE_STEP) * ROW_HEIGHT,
          lockMs: PAGE_TRANSITION_MS + 50,
        };
      }

      return {
        mode: "local",
        duration: LOCAL_TRANSITION_MS,
        ease: d3.easeCubicOut,
        travel: Math.min(Math.abs(delta), VISIBLE_ROWS - 1) * ROW_HEIGHT,
        lockMs: LOCAL_TRANSITION_MS + 40,
      };
    }

    function setRailMotion(mode, duration) {
      if (railMotionTimer != null) {
        window.clearTimeout(railMotionTimer);
      }

      railTrack.attr("data-motion", mode);
      railTrack.classed("is-jumping", mode === "jump");

      railMotionTimer = window.setTimeout(() => {
        railTrack.attr("data-motion", null);
        railTrack.classed("is-jumping", false);
        railMotionTimer = null;
      }, duration + 40);
    }

    function buildVisibleBorderMesh(activeHighlightedIds) {
      return mesh(
        statesTopo,
        statesTopo.objects.states,
        (a, b) =>
          Boolean(a) &&
          a.id !== hoveredStateId &&
          !excludedStateIds.has(a.id) &&
          Boolean(b) &&
          b.id !== hoveredStateId &&
          !excludedStateIds.has(b.id) &&
          (!activeHighlightedIds.has(a.id) || !activeHighlightedIds.has(b.id)),
      );
    }

    function buildHighlightedBorderMesh(activeHighlightedIds) {
      if (activeHighlightedIds.size <= 1) {
        return null;
      }

      return mesh(
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
      );
    }

    function spawnBackgroundSprite(event) {
      if (prefersReducedMotion || initialEntranceActive || activeSpriteCount >= SPRITE_MAX_ACTIVE) {
        return;
      }

      const now = performance.now();
      if (now - lastSpriteAt < SPRITE_COOLDOWN_MS) {
        return;
      }

      const backgroundTarget = getBackgroundClickTarget(event.target);
      if (!backgroundTarget) {
        return;
      }

      const layerNode = spriteLayer.node();
      if (!layerNode) {
        return;
      }

      const layerRect = layerNode.getBoundingClientRect();
      const x = event.clientX - layerRect.left + SPRITE_ORIGIN_OFFSET_X;
      const y = event.clientY - layerRect.top + SPRITE_ORIGIN_OFFSET_Y;

      if (x < 0 || x > layerRect.width || y < 0 || y > layerRect.height) {
        return;
      }

      lastSpriteAt = now;
      activeSpriteCount += 1;

      const spriteType = chooseSpriteType();
      const duration = randomBetween(SPRITE_MIN_LIFETIME_MS, SPRITE_MAX_LIFETIME_MS);
      const travelX = randomBetween(-44, 44);
      const travelY = randomBetween(-72, -34);
      const popX = travelX * randomBetween(0.14, 0.22);
      const popY = travelY * randomBetween(0.12, 0.2);
      const startRotation = randomBetween(-12, 12);
      const endRotation = startRotation + randomBetween(-28, 28);
      const size = randomBetween(49.5, 76.5);

      const sprite = spriteLayer
        .append("div")
        .attr("class", `click-sprite click-sprite-${spriteType.name}`)
        .style("left", `${x}px`)
        .style("top", `${y}px`)
        .style("--sprite-size", `${size}px`);

      sprite.html(`
        <svg
          class="click-sprite-glyph"
          viewBox="${spriteType.viewBox}"
          aria-hidden="true"
          focusable="false"
        >
          ${spriteType.markup}
        </svg>
      `);

      const node = sprite.node();
      window.setTimeout(() => {
        if (node?.isConnected) {
          node.remove();
        }
        activeSpriteCount = Math.max(0, activeSpriteCount - 1);
      }, duration + 80);

      node?.animate(
        [
          {
            transform: `translate(0px, 0px) scale(0.72) rotate(${startRotation}deg)`,
            opacity: 0,
          },
          {
            transform: `translate(${popX}px, ${popY}px) scale(1) rotate(${startRotation}deg)`,
            opacity: 0.92,
            offset: 0.18,
          },
          {
            transform: `translate(${travelX}px, ${travelY}px) scale(0.16) rotate(${endRotation}deg)`,
            opacity: 0,
          },
        ],
        {
          duration,
          easing: "cubic-bezier(0.22, 0.74, 0.2, 1)",
          fill: "forwards",
        },
      );
    }

    function getFocusedRecord() {
      return nameFrequency[focusedIndex] ?? null;
    }

    function syncSearchValue() {
      const focused = getFocusedRecord();
      inputValue = focused?.displayName ?? "";
      searchInput.property("value", inputValue);
    }

    function ensureBaseMapRendered() {
      if (baseMapReady) {
        return;
      }

      baseStatesLayer
        .selectAll("path")
        .data(stateFeatures)
        .join("path")
        .attr("class", "base-state-shape")
        .attr("d", path);

      baseMapReady = true;
    }

    function updateStateSummary(options = {}) {
      const focused = getFocusedRecord();
      const { count, label } = getStateSummaryCopy(focused);

      if (options.skipTextUpdate) {
        stateSummaryCard.attr("aria-label", `${count} ${label}`);
        return;
      }

      stateSummaryCount.text(count);
      stateSummaryLabel.text(label);
      stateSummaryCard.attr("aria-label", `${count} ${label}`);

      if (options.animate) {
        pulseSelection(stateSummaryCard, "is-refreshing");
      }
    }

    function updateRail(delta = 0, motionMode = "local") {
      const rows = buildVisibleRows(nameFrequency, focusedIndex);
      const motion = getRailMotion(delta, motionMode);
      const travel = Math.sign(delta) * motion.travel;
      const duration = motion.duration;
      const ease = motion.ease;
      const isPageMotion = motion.mode === "page";
      const exitDuration = isPageMotion ? Math.round(duration * 0.42) : duration;
      const enterDelay = isPageMotion ? Math.round(duration * 0.46) : 0;
      const enterDuration = isPageMotion ? duration - enterDelay : duration;

      railTrack.style("height", `${RAIL_HEIGHT}px`);
      setRailMotion(motion.mode, duration);

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
                const startY = isPageMotion
                  ? d.slot * ROW_HEIGHT + Math.sign(delta || 1) * 24
                  : d.slot * ROW_HEIGHT + travel;
                return `translateY(${startY}px)`;
              })
              .style("opacity", 0)
              .call((selection) =>
                selection
                  .transition()
                  .delay(enterDelay)
                  .duration(enterDuration)
                  .ease(isPageMotion ? d3.easeLinear : ease)
                  .style("transform", (d) => `translateY(${d.slot * ROW_HEIGHT}px)`)
                  .style("opacity", 1),
              ),
          (update) => update,
          (exit) =>
            exit
              .transition()
              .duration(exitDuration)
              .ease(
                isPageMotion
                  ? d3.easeLinear
                  : motion.mode === "jump"
                    ? d3.easeCubicInOut
                    : d3.easeCubicIn,
              )
              .style("transform", (d) =>
                isPageMotion
                  ? `translateY(${d.slot * ROW_HEIGHT - Math.sign(delta || 1) * 20}px)`
                  : `translateY(${d.slot * ROW_HEIGHT - travel}px)`,
              )
              .style("opacity", 0)
              .remove(),
        );

      rowSelection
        .attr("class", (d) =>
          d.isFocused && !introRailSelectionPending ? "rail-row is-focused" : "rail-row",
        )
        .attr("disabled", (d) => (d.record ? null : true))
        .attr("aria-label", (d) =>
          d.record ? `${d.record.displayName}, ${d.record.count} occurrences` : "Empty row",
        )
        .on("click", (_, d) => {
          if (!d.record || interactionLocked) {
            return;
          }
          setFocusedIndex(d.recordIndex, { motion: "local" });
        })
        .transition()
        .delay(enterDelay)
        .duration(enterDuration)
        .ease(isPageMotion ? d3.easeLinear : ease)
        .style("transform", (d) => `translateY(${d.slot * ROW_HEIGHT}px)`)
        .style("opacity", (d) => (d.record ? 1 : 0));

      rowSelection.each(function (d) {
        const row = d3.select(this);
        row
          .select(".rail-count")
          .text(d.record && !initialRailRevealPending && !introRailTextPending ? d.record.count : "");
        row
          .select(".rail-name")
          .text(
            d.record && !initialRailRevealPending && !introRailTextPending ? d.record.displayName : "",
          );
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
        .selectAll(".highlighted-state")
        .data(nonHoveredStates, (d) => d.id)
        .join(
          (enter) =>
            enter
              .append("g")
              .attr("class", "highlighted-state")
              .attr("data-state-id", (d) => d.id)
              .call((selection) => {
                selection
                  .append("path")
                  .attr("class", "highlighted-state-fill");
                selection
                  .append("path")
                  .attr("class", "highlighted-state-outline");
              }),
          (update) => update,
          (exit) => exit.remove(),
        )
        .attr("class", "highlighted-state")
        .attr("data-state-id", (d) => d.id)
        .on("mouseenter", (_, d) => {
          hoveredStateId = d.id;
          updateHoverState();
        })
        .on("mouseleave", () => {
          hoveredStateId = null;
          updateHoverState();
        });

      highlightedStatesLayer.selectAll(".highlighted-state").each(function (d) {
        const group = d3.select(this);
        const fill = group.select(".highlighted-state-fill");
        const outline = group.select(".highlighted-state-outline");
        const isAnimating = introAnimatingStateIds.has(d.id);

        fill.attr("d", path).style("fill-opacity", 0.88);
        outline.attr("d", path);

        if (isAnimating) {
          ensureHighlightClipRect(d.id);
          fill.attr("clip-path", `url(#${getHighlightClipId(d.id)})`);
        } else {
          fill.attr("clip-path", null);
        }
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
      hoveredSelection.selectAll(".hovered-state-outline").attr("d", path);
    }

    function updateMap() {
      if (initialMapRevealPending) {
        highlightedStatesLayer.selectAll(".highlighted-state").remove();
        hoveredStateOverlayLayer.selectAll(".hovered-state-overlay").remove();
        bordersLayer.selectAll(".state-borders").remove();
        highlightBordersLayer.selectAll(".highlight-borders").remove();
        stateLabels.selectAll(".state-label").remove();
        return;
      }

      ensureBaseMapRendered();
      const focused = getFocusedRecord();
      currentHighlightedIds = new Set(focused?.mappedStateIds ?? []);
      const activeHighlightedIds = initialHighlightRevealPending
        ? introActivatedStateIds
        : currentHighlightedIds;

      if (hoveredStateId != null && !activeHighlightedIds.has(hoveredStateId)) {
        hoveredStateId = null;
      }

      currentHighlightedStates = stateFeatures.filter((state) => activeHighlightedIds.has(state.id));
      if (initialEntranceActive) {
        currentHighlightedStates = [];
      }
      syncHighlightedStateLayers();
      const visibleHighlightedIds = initialEntranceActive ? new Set() : activeHighlightedIds;

      const visibleBorderMesh = buildVisibleBorderMesh(visibleHighlightedIds);

      bordersLayer
        .selectAll(".state-borders")
        .data(visibleBorderMesh ? [visibleBorderMesh] : [])
        .join("path")
        .attr("class", "state-borders")
        .attr("d", path);

      const highlightedBorderMesh = buildHighlightedBorderMesh(visibleHighlightedIds);

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
        .data(initialEntranceActive || initialMapRevealPending ? [] : sortedLabels, (d) => d.id)
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
        .text((d) =>
          initialLabelRevealPending && !introActivatedStateIds.has(d.id) ? "" : d.name,
        );
    }

    function updateHoverState() {
      syncHighlightedStateLayers();
      const activeHighlightedIds = initialEntranceActive
        ? new Set()
        : initialHighlightRevealPending
          ? introActivatedStateIds
          : currentHighlightedIds;

      const visibleBorderMesh = buildVisibleBorderMesh(activeHighlightedIds);

      bordersLayer
        .selectAll(".state-borders")
        .data(visibleBorderMesh ? [visibleBorderMesh] : [])
        .join("path")
        .attr("class", "state-borders")
        .attr("d", path);

      const highlightedBorderMesh = buildHighlightedBorderMesh(activeHighlightedIds);

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

    function render(delta = 0, motionMode = "local") {
      updateRail(delta, motionMode);
      updateStateSummary();
      updateMap();
    }

    function setFocusedIndex(nextIndex, options = {}) {
      const boundedIndex = clamp(nextIndex, 0, nameFrequency.length - 1);
      if (boundedIndex === focusedIndex && !options.force) {
        if (!options.preserveInput) {
          syncSearchValue();
        }
        render(0, options.motion ?? "local");
        return;
      }

      previousIndex = focusedIndex;
      focusedIndex = boundedIndex;

      if (!options.preserveInput) {
        syncSearchValue();
      }

      const delta = focusedIndex - previousIndex;
      const motion =
        options.motion ??
        (Math.abs(delta) >= PAGE_STEP ? "jump" : Math.abs(delta) > 1 ? "page" : "local");

      pulseSelection(searchShell, "is-settling");
      pulseSelection(stateSummaryCard, "is-refreshing");
      pulseSelection(stateLabels, "is-settling");
      svg.classed("is-settling", true);
      render(delta, motion);
      window.setTimeout(() => {
        svg.classed("is-settling", false);
      }, JUMP_TRANSITION_MS);
    }

    function moveFocus(step, options = {}) {
      if (interactionLocked) {
        return;
      }

      const nextIndex = clamp(focusedIndex + step, 0, nameFrequency.length - 1);
      if (nextIndex === focusedIndex) {
        return;
      }

      interactionLocked = true;
      const motion = options.motion ?? (Math.abs(step) >= PAGE_STEP ? "page" : "local");
      const lockMs = getRailMotion(step, motion).lockMs;
      setFocusedIndex(nextIndex, { motion });
      window.setTimeout(() => {
        interactionLocked = false;
      }, lockMs);
    }

    function jumpFocus(targetIndex) {
      if (interactionLocked || targetIndex === focusedIndex) {
        return;
      }

      interactionLocked = true;
      setFocusedIndex(targetIndex, { motion: "jump" });
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
      const focusedStateOrder = shuffle(
        (focused?.mappedStateIds ?? [])
          .map((stateId) => stateIndex.get(stateId))
          .filter(Boolean),
      );
      const stateEntranceOrder = [...stateFeatures]
        .map((state) => ({ state, centroid: path.centroid(state) }))
        .sort((a, b) => a.centroid[1] - b.centroid[1] || a.centroid[0] - b.centroid[0])
        .map(({ state }) => state);
      railArrowTop.classed("is-intro-hidden", true);
      railArrowUp.classed("is-intro-hidden", true);
      railArrowDown.classed("is-intro-hidden", true);
      railArrowBottom.classed("is-intro-hidden", true);
      introSmall.attr("aria-label", INTRO_COPY);
      titlePrefix.attr("aria-label", TITLE_PREFIX_COPY);
      interactionLocked = true;
      introSmall.classed("is-intro-hidden", false);
      searchShell.classed("is-entrance-active", true);
      railShell.classed("is-intro-ready", true);
      searchInput.attr("disabled", true);
      searchInput.property("value", "");
      searchEntranceText.text("");

      await animateTypingTextAsync(introSmall, INTRO_COPY);
      await wait(INTRO_GAP_AFTER_EDITORIAL_MS);
      titlePrefix.classed("is-intro-hidden", false);
      await animateTypingTextAsync(titlePrefix, TITLE_PREFIX_COPY);
      await wait(INTRO_GAP_AFTER_PREFIX_MS);

      revealIntroNode(searchShell);
      await wait(INTRO_SEARCH_REVEAL_MS + INTRO_GAP_BEFORE_CITY_MS);
      await animateTypingTextAsync(searchEntranceText, cityName);
      await wait(INTRO_GAP_BEFORE_QUESTION_MS);
      revealIntroNode(titleQuestion);
      await wait(INTRO_QUESTION_REVEAL_MS + INTRO_GAP_BEFORE_MAP_MS);

      revealPristineNode(mapStage);
      revealPristineNode(stateSummary);
      prepareStateSummaryIntro();
      svg.classed("is-entrance-active", true);
      const summaryIntroPromise = animateStateSummaryIntro(focused);
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
      await summaryIntroPromise;

      initialEntranceActive = false;
      initialMapRevealPending = false;
      initialHighlightRevealPending = true;
      introActivatedStateIds = new Set();
      svg.classed("is-entrance-active", false);
      searchShell.classed("is-entrance-active", false);
      searchEntranceText.text("");
      searchInput.property("value", cityName);
      searchInput.attr("disabled", null);
      updateStateSummary({ skipTextUpdate: true });
      updateMap();

      await wait(INITIAL_HIGHLIGHT_REVEAL_DELAY_MS);
      revealPristineNode(stateLabels);
      updateMap();

      const stateClusters = buildHighlightClusters(focusedStateOrder);
      const stateActivationPromises = [];

      stateClusters.forEach((cluster, clusterIndex) => {
        const clusterStartDelay = clusterIndex * INITIAL_HIGHLIGHT_GROUP_OVERLAP_MS;

        cluster.forEach((state, stateIndex) => {
          stateActivationPromises.push(
            (async () => {
              await wait(clusterStartDelay + stateIndex * INITIAL_HIGHLIGHT_WITHIN_GROUP_MS);
              introActivatedStateIds = new Set([...introActivatedStateIds, state.id]);
              introAnimatingStateIds = new Set([...introAnimatingStateIds, state.id]);
              const clipRect = ensureHighlightClipRect(state.id);

              clipRect.interrupt();
              clipRect.attr("x", -0.02).attr("width", 0.06);
              updateMap();

              const label = stateLabels
                .selectAll(".state-label")
                .filter((d) => d.id === state.id);

              const fillPromise = new Promise((resolve) => {
                clipRect
                  .transition()
                  .duration(INITIAL_HIGHLIGHT_FILL_MS)
                  .ease(d3.easeCubicOut)
                  .attr("width", 1.08)
                  .on("end", () => {
                    introAnimatingStateIds = new Set(
                      [...introAnimatingStateIds].filter((id) => id !== state.id),
                    );
                    updateMap();
                    resolve();
                  });
              });

              await Promise.all([
                fillPromise,
                animateStateLabelText(label, { id: state.id, name: state.properties.name }),
              ]);
            })(),
          );
        });
      });

      await Promise.all(stateActivationPromises);
      initialLabelRevealPending = false;
      initialHighlightRevealPending = false;
      introActivatedStateIds = new Set(currentHighlightedIds);
      introAnimatingStateIds = new Set();
      updateMap();
      entranceBordersLayer.selectAll(".entrance-state-border").remove();
      await wait(INTRO_GAP_BEFORE_RAIL_MS);

      initialRailRevealPending = false;
      introRailTextPending = true;
      updateRail(0, "local");
      revealPristineNode(railShell);
      const introRailRows = railTrack
        .selectAll(".rail-row")
        .filter((d) => d.record)
        .classed("is-intro-hidden", true)
        .style("opacity", 0)
        .style("transform", (d) => `translateY(${d.slot * ROW_HEIGHT - 6}px)`);

      revealIntroNode(railArrowTop);
      await wait(INTRO_RAIL_ARROW_REVEAL_MS * 0.75);
      revealIntroNode(railArrowUp);
      await wait(INTRO_RAIL_ARROW_REVEAL_MS * 0.65);

      const introRailRowQueue = [];
      introRailRows.each(function (d, index) {
        introRailRowQueue.push({
          row: d3.select(this),
          slot: d.slot,
          record: d.record,
          delay: index * INTRO_RAIL_ROW_CASCADE_GAP_MS,
        });
      });

      const railRowAnimations = introRailRowQueue.map(({ row, slot, record, delay }) =>
        (async () => {
          await wait(delay);
          revealRailRow(row, slot);
          await animateRailRowText(row, record);
        })(),
      );

      await Promise.all(railRowAnimations);
      revealIntroNode(railArrowDown);
      await wait(INTRO_RAIL_ARROW_REVEAL_MS * 0.75);
      revealIntroNode(railArrowBottom);
      await wait(INTRO_RAIL_ARROW_REVEAL_MS * 0.7);

      introRailTextPending = false;
      await animateRailSelectionSwipe(
        railTrack.selectAll(".rail-row").filter((d) => d.isFocused && d.record),
      );
      introRailSelectionPending = false;
      railShell.classed("is-intro-ready", false);
      interactionLocked = false;
      render(0, "local");
    }

    railWindow.on("wheel", (event) => {
      event.preventDefault();
      event.stopPropagation();
      moveFocus(event.deltaY > 0 ? 1 : -1);
    });

    railArrowUp.on("click", () => {
      moveFocus(-PAGE_STEP, { motion: "page" });
      railWindow.node()?.focus();
    });

    railArrowTop.on("click", () => {
      jumpFocus(0);
      railWindow.node()?.focus();
    });

    railArrowDown.on("click", () => {
      moveFocus(PAGE_STEP, { motion: "page" });
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
        moveFocus(PAGE_STEP, { motion: "page" });
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        moveFocus(-PAGE_STEP, { motion: "page" });
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

    pageShell.on("click.background-sprite", (event) => {
      if (
        event.button !== 0 ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      spawnBackgroundSprite(event);
    });

    if (initialEntranceActive) {
      playInitialEntrance();
      return;
    }

    introSmall.text(INTRO_COPY);
    titlePrefix.text(TITLE_PREFIX_COPY);
    revealPristineNode(mapStage);
    revealPristineNode(stateSummary);
    revealStateSummaryInstant(getFocusedRecord());
    revealPristineNode(stateLabels);
    revealPristineNode(railShell);
    initialMapRevealPending = false;
    initialLabelRevealPending = false;
    initialRailRevealPending = false;
    introRailTextPending = false;
    introRailSelectionPending = false;
    render(0, "local");
  })
  .catch((error) => {
    console.error(error);
    renderError(
      "Data assets are missing or unreadable. Rebuild them with `python3 scripts/build_data.py`, then run `npm run build` or `npm run dev`.",
    );
  });
