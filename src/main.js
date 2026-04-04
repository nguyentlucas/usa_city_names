import "./styles.css";

import * as d3 from "d3";
import { feature, mesh } from "topojson-client";
import statesUrl from "us-atlas/states-10m.json?url";

const DATA_URLS = {
  places: "./data/places.topo.json",
  nameFrequency: "./data/name_frequency.json",
  topNames: "./data/top_names.json",
  nameLookup: "./data/name_lookup.json",
  metadata: "./data/metadata.json",
};

const SMALL_PLACE_AREA = 2_500_000;

const app = d3.select("#app");
app.html(`
  <div class="page-shell">
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">U.S. incorporated place names</p>
        <h1>Where the same city name appears again and again</h1>
        <p class="hero-text" id="summary-text"></p>
      </div>
      <div class="search-panel">
        <label class="search-label" for="name-search">Search an exact incorporated place name</label>
        <div class="search-wrap">
          <input id="name-search" class="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Try Franklin, Greenville, Springfield..." />
          <button id="search-clear" class="search-clear" type="button" aria-label="Clear search">Clear</button>
        </div>
        <div id="search-status" class="search-status"></div>
        <div id="chip-row" class="chip-row" aria-label="Example repeated names"></div>
        <div id="suggestions" class="suggestions" aria-live="polite"></div>
      </div>
    </header>

    <main class="content-grid">
      <section class="panel panel-rankings">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Most repeated</p>
            <h2>Ranked incorporated names</h2>
          </div>
        </div>
        <div id="ranking-list" class="ranking-list"></div>
      </section>

      <section class="panel panel-map">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Linked map</p>
            <h2>All incorporated place boundaries</h2>
          </div>
        </div>
        <div id="map-wrap" class="map-wrap">
          <svg id="map-svg" class="map-svg" viewBox="0 0 980 640" preserveAspectRatio="xMidYMid meet"></svg>
        </div>
      </section>

      <aside class="panel panel-details">
        <div class="panel-head">
          <div>
            <p class="panel-kicker">Selection</p>
            <h2>Name details</h2>
          </div>
        </div>
        <div id="details-card" class="details-card"></div>
      </aside>
    </main>
  </div>
`);

const summaryText = d3.select("#summary-text");
const searchInput = d3.select("#name-search");
const searchClear = d3.select("#search-clear");
const searchStatus = d3.select("#search-status");
const chipRow = d3.select("#chip-row");
const suggestions = d3.select("#suggestions");
const rankingList = d3.select("#ranking-list");
const detailsCard = d3.select("#details-card");

const svg = d3.select("#map-svg");
const width = 980;
const height = 640;
const rootLayer = svg.append("g");
const statesLayer = rootLayer.append("g").attr("class", "states-layer");
const placesLayer = rootLayer.append("g").attr("class", "places-layer");
const markersLayer = rootLayer.append("g").attr("class", "markers-layer");

const zoomBehavior = d3
  .zoom()
  .scaleExtent([1, 10])
  .translateExtent([
    [0, 0],
    [width, height],
  ])
  .extent([
    [0, 0],
    [width, height],
  ])
  .on("zoom", (event) => {
    rootLayer.attr("transform", event.transform);
  });

svg.call(zoomBehavior);

function normalizeName(value) {
  return value.trim().toLocaleLowerCase();
}

function renderError(message) {
  app.append("div").attr("class", "error-banner").text(message);
}

function buildProjection(placesFeatures, statesFeatures) {
  const collection = {
    type: "FeatureCollection",
    features: [...statesFeatures, ...placesFeatures],
  };
  return d3.geoMercator().fitExtent(
    [
      [18, 18],
      [width - 18, height - 18],
    ],
    collection,
  );
}

function createDetailsMarkup(record) {
  const stateMarkup = record.states
    .map((state) => `<span class="state-pill">${state}</span>`)
    .join("");

  const placeMarkup = record.places
    .map(
      (place) => `
        <li class="place-row">
          <span>${place.name}</span>
          <span class="place-state">${place.stateAbbr}</span>
        </li>
      `,
    )
    .join("");

  return `
    <div class="details-headline">
      <h3>${record.displayName}</h3>
      <p>${record.count} incorporated places across ${record.stateCount} states or territories.</p>
    </div>
    <div class="detail-stats">
      <div class="stat-block">
        <span class="stat-value">${record.count}</span>
        <span class="stat-label">places</span>
      </div>
      <div class="stat-block">
        <span class="stat-value">${record.stateCount}</span>
        <span class="stat-label">states / territories</span>
      </div>
    </div>
    <div class="details-section">
      <p class="details-section-title">States represented</p>
      <div class="state-pill-wrap">${stateMarkup}</div>
    </div>
    <div class="details-section">
      <p class="details-section-title">Matching incorporated places</p>
      <ul class="place-list">${placeMarkup}</ul>
    </div>
  `;
}

Promise.all([
  d3.json(DATA_URLS.places),
  d3.json(DATA_URLS.nameFrequency),
  d3.json(DATA_URLS.topNames),
  d3.json(DATA_URLS.nameLookup),
  d3.json(DATA_URLS.metadata),
  d3.json(statesUrl),
])
  .then(([placesTopo, nameFrequency, topNames, nameLookup, metadata, statesTopo]) => {
    const placeObjectKey = placesTopo.objects.places
      ? "places"
      : Object.keys(placesTopo.objects)[0];
    const placesFeatures = feature(placesTopo, placesTopo.objects[placeObjectKey]).features;
    const statesFeatures = feature(statesTopo, statesTopo.objects.states).features;
    const stateMesh = mesh(statesTopo, statesTopo.objects.states, (a, b) => a !== b);
    const projection = buildProjection(placesFeatures, statesFeatures);
    const path = d3.geoPath(projection);

    const nameIndex = new Map(nameFrequency.map((entry) => [entry.normalizedName, entry]));
    const defaultSelection = topNames[0]?.normalizedName ?? nameFrequency[0]?.normalizedName;
    let selectedName = defaultSelection;
    let searchValue = "";

    summaryText.text(
      `${metadata.placeCount.toLocaleString()} incorporated places from 2025 Census TIGER/Line PLACE files, restricted to CLASSFP ${metadata.includedClassfp.join(", ")}.`,
    );

    statesLayer
      .append("path")
      .datum(stateMesh)
      .attr("class", "state-borders")
      .attr("d", path);

    placesLayer
      .selectAll("path")
      .data(placesFeatures)
      .join("path")
      .attr("class", "place-shape")
      .attr("d", path)
      .append("title")
      .text((d) => `${d.properties.display_name}, ${d.properties.state_abbr}`);

    placesLayer
      .selectAll("path")
      .on("click", (_, d) => {
        setSelection(d.properties.normalized_name, d.properties.display_name);
      });

    const markerSelection = markersLayer
      .selectAll("circle")
      .data(placesFeatures.filter((d) => Number(d.properties.area_m2) <= SMALL_PLACE_AREA))
      .join("circle")
      .attr("class", "place-marker")
      .attr("cx", (d) => projection([d.properties.centroid_lon, d.properties.centroid_lat])[0])
      .attr("cy", (d) => projection([d.properties.centroid_lon, d.properties.centroid_lat])[1])
      .attr("r", 1.8);

    function renderChips() {
      chipRow
        .selectAll("button")
        .data(topNames.slice(0, 6))
        .join("button")
        .attr("type", "button")
        .attr("class", (d) =>
          d.normalizedName === selectedName ? "chip is-active" : "chip",
        )
        .text((d) => d.displayName)
        .on("click", (_, d) => {
          searchInput.property("value", d.displayName);
          setSelection(d.normalizedName, d.displayName);
        });
    }

    function renderRankings() {
      const maxCount = d3.max(topNames, (d) => d.count) ?? 1;
      const rows = rankingList.selectAll("button").data(topNames).join("button");

      rows
        .attr("type", "button")
        .attr("class", (d) =>
          d.normalizedName === selectedName ? "rank-row is-active" : "rank-row",
        )
        .on("click", (_, d) => {
          searchInput.property("value", d.displayName);
          setSelection(d.normalizedName, d.displayName);
        })
        .html(
          (d, index) => `
            <span class="rank-index">${index + 1}</span>
            <span class="rank-meta">
              <span class="rank-name">${d.displayName}</span>
              <span class="rank-sub">${d.stateCount} states / territories</span>
            </span>
            <span class="rank-bar"><span style="width:${(d.count / maxCount) * 100}%"></span></span>
            <span class="rank-count">${d.count}</span>
          `,
        );
    }

    function renderSuggestions() {
      const query = normalizeName(searchValue);
      if (!query) {
        suggestions.html("");
        searchStatus.text("Exact matching, case-insensitive. Click a result or press Enter on an exact name.");
        return;
      }

      const exact = nameLookup[query];
      const matches = nameFrequency
        .filter((entry) => entry.normalizedName.includes(query))
        .slice(0, 6);

      if (exact) {
        searchStatus.text(`Exact match found: ${exact.displayName}`);
      } else {
        searchStatus.text("No exact match yet. Matching uses trimmed, case-insensitive name equality.");
      }

      const items = suggestions.selectAll("button").data(matches, (d) => d.normalizedName).join("button");
      items
        .attr("type", "button")
        .attr("class", "suggestion")
        .text((d) => `${d.displayName} (${d.count})`)
        .on("click", (_, d) => {
          searchInput.property("value", d.displayName);
          setSelection(d.normalizedName, d.displayName);
        });
    }

    function updateMap() {
      const selected = nameIndex.get(selectedName);
      const selectedGeoids = new Set((selected?.places ?? []).map((place) => place.geoid));

      placesLayer
        .selectAll("path")
        .attr("class", (d) => {
          const isSelected = selectedGeoids.has(d.properties.GEOID);
          return isSelected ? "place-shape is-selected" : "place-shape is-muted";
        });

      markerSelection
        .attr("class", (d) => {
          const isSelected = selectedGeoids.has(d.properties.GEOID);
          return isSelected ? "place-marker is-selected" : "place-marker is-muted";
        })
        .attr("r", (d) => (selectedGeoids.has(d.properties.GEOID) ? 2.2 : 1.8));
    }

    function updateDetails() {
      const selected = nameIndex.get(selectedName);
      if (!selected) {
        detailsCard.html(`<p class="empty-state">No matching incorporated place name selected.</p>`);
        return;
      }
      detailsCard.html(createDetailsMarkup(selected));
    }

    function zoomToSelection() {
      const selected = nameIndex.get(selectedName);
      if (!selected) {
        svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
        return;
      }

      const selectedFeatures = placesFeatures.filter(
        (featureItem) => featureItem.properties.normalized_name === selectedName,
      );
      const [[x0, y0], [x1, y1]] = d3.geoPath(projection).bounds({
        type: "FeatureCollection",
        features: selectedFeatures,
      });

      if (![x0, y0, x1, y1].every(Number.isFinite)) {
        return;
      }

      const dx = x1 - x0;
      const dy = y1 - y0;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const scale = Math.max(
        1,
        Math.min(8, 0.82 / Math.max(dx / width, dy / height)),
      );
      const translate = [width / 2 - scale * cx, height / 2 - scale * cy];

      svg
        .transition()
        .duration(650)
        .call(
          zoomBehavior.transform,
          d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale),
        );
    }

    function setSelection(nextName, displayValue = "") {
      selectedName = nextName;
      searchValue = displayValue || nameIndex.get(nextName)?.displayName || "";
      searchInput.property("value", searchValue);
      renderChips();
      renderRankings();
      renderSuggestions();
      updateMap();
      updateDetails();
      zoomToSelection();
    }

    searchInput.on("input", (event) => {
      searchValue = event.target.value;
      const exact = nameLookup[normalizeName(searchValue)];
      if (exact) {
        selectedName = exact.normalizedName;
        renderChips();
        renderRankings();
        updateMap();
        updateDetails();
        zoomToSelection();
      }
      renderSuggestions();
    });

    searchInput.on("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      const query = normalizeName(searchInput.property("value"));
      const exact = nameLookup[query];
      if (exact) {
        setSelection(exact.normalizedName, exact.displayName);
      }
    });

    searchClear.on("click", () => {
      searchValue = "";
      searchInput.property("value", "");
      setSelection(defaultSelection, nameIndex.get(defaultSelection)?.displayName || "");
      suggestions.html("");
    });

    renderChips();
    renderRankings();
    renderSuggestions();
    updateMap();
    updateDetails();
    zoomToSelection();
  })
  .catch((error) => {
    console.error(error);
    renderError(
      "Data assets are missing or unreadable. Build them with `python3 scripts/build_data.py` after creating the conda environment, then run `npm install` and `npm run dev`.",
    );
  });
