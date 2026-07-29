// STL Business Directory - Main Application
(function () {
  "use strict";

  // === Config ===
  const PAGE_SIZE = 20;
  const DEBOUNCE_MS = 300;
  const FUSE_OPTIONS = {
    keys: [
      { name: "name", weight: 2.0 },
      { name: "tags", weight: 1.5 },
      { name: "description", weight: 1.0 },
      { name: "category", weight: 1.0 },
      { name: "sic_description", weight: 0.5 },
      { name: "naics_description", weight: 0.5 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 2,
  };

  const CATEGORY_ICONS = {
    "Healthcare & Medical": { icon: "ti-stethoscope", family: "cat-blue" },
    "Restaurants & Food": { icon: "ti-pizza", family: "cat-coral" },
    "Religious Organizations": { icon: "ti-building-church", family: "cat-plum" },
    "Legal Services": { icon: "ti-scale", family: "cat-blue" },
    "Home Services": { icon: "ti-home-2", family: "cat-amber" },
    "Construction & Trades": { icon: "ti-hammer", family: "cat-amber" },
    "Real Estate & Property": { icon: "ti-building-estate", family: "cat-amber" },
    "Education": { icon: "ti-school", family: "cat-blue" },
    "Government": { icon: "ti-building-bank", family: "cat-blue" },
    "Auto Services": { icon: "ti-car", family: "cat-teal" },
    "Retail & Shopping": { icon: "ti-shopping-bag", family: "cat-slate" },
    "Wholesale Trade": { icon: "ti-building-warehouse", family: "cat-teal" },
    "Beauty & Personal Care": { icon: "ti-scissors", family: "cat-plum" },
    "Social Services & Nonprofits": { icon: "ti-heart-handshake", family: "cat-plum" },
    "Childcare": { icon: "ti-baby-carriage", family: "cat-plum" },
    "Finance & Insurance": { icon: "ti-cash", family: "cat-blue" },
    "Fitness & Recreation": { icon: "ti-barbell", family: "cat-coral" },
    "Professional Services": { icon: "ti-briefcase", family: "cat-slate" },
    "IT & Telecommunications": { icon: "ti-device-laptop", family: "cat-slate" },
    "Arts & Entertainment": { icon: "ti-palette", family: "cat-coral" },
    "Lodging & Hospitality": { icon: "ti-bed", family: "cat-coral" },
    "Transportation & Logistics": { icon: "ti-truck", family: "cat-teal" },
    "Manufacturing": { icon: "ti-building-factory-2", family: "cat-teal" },
    "Agriculture, Mining & Utilities": { icon: "ti-plant-2", family: "cat-teal" },
    "Pets & Veterinary": { icon: "ti-paw", family: "cat-plum" },
    "Cleaning & Maintenance": { icon: "ti-spray", family: "cat-teal" },
    "Other": { icon: "ti-dots", family: "cat-slate" },
  };

  function categoryMeta(cat) {
    return CATEGORY_ICONS[cat] || CATEGORY_ICONS["Other"];
  }

  const SOCIAL_LINKS = [
    { field: "facebook", icon: "ti-brand-facebook", label: "Facebook" },
    { field: "linkedin", icon: "ti-brand-linkedin", label: "LinkedIn" },
    { field: "instagram", icon: "ti-brand-instagram", label: "Instagram" },
  ];

  function socialLinksHtml(b) {
    const links = SOCIAL_LINKS.filter((s) => b[s.field]);
    if (!links.length) return "";
    const items = links
      .map(
        (s) =>
          `<a class="social-link" href="${escapeHtml(b[s.field])}" target="_blank" rel="noopener noreferrer" aria-label="${s.label}" onclick="event.stopPropagation()"><i class="ti ${s.icon}" aria-hidden="true"></i></a>`
      )
      .join("");
    return `<div class="social-links">${items}</div>`;
  }

  // === State ===
  let allBusinesses = [];
  let filteredResults = [];
  let fuse = null;
  let currentPage = 1;
  let categories = [];
  let neighborhoods = [];
  let selectedNeighborhood = "";

  // === DOM Elements ===
  const $loading = document.getElementById("loading");
  const $searchInput = document.getElementById("search-input");
  const $categoryFilter = document.getElementById("category-filter");
  const $neighborhoodFilter = document.getElementById("neighborhood-filter");
  const $neighborhoodSuggestions = document.getElementById("neighborhood-suggestions");
  const $clearFilters = document.getElementById("clear-filters");
  const $activeFilters = document.getElementById("active-filters");
  const $resultsInfo = document.getElementById("results-info");
  const $categoryBrowse = document.getElementById("category-browse");
  const $categoryTiles = document.getElementById("category-tiles");
  const $resultsGrid = document.getElementById("results-grid");
  const $noResults = document.getElementById("no-results");
  const $pagination = document.getElementById("pagination");
  const $prevPage = document.getElementById("prev-page");
  const $nextPage = document.getElementById("next-page");
  const $pageInfo = document.getElementById("page-info");
  const $modal = document.getElementById("business-modal");
  const $modalBody = document.getElementById("modal-body");
  const $clearFromEmpty = document.getElementById("clear-from-empty");

  // === Init ===
  async function init() {
    try {
      const resp = await fetch("businesses.json", { cache: "no-cache" });
      if (!resp.ok) throw new Error("Failed to load data");
      allBusinesses = await resp.json();

      // Build Fuse index
      fuse = new Fuse(allBusinesses, FUSE_OPTIONS);

      // Extract unique categories and neighborhoods
      const catSet = new Set();
      const hoodSet = new Set();
      for (const b of allBusinesses) {
        if (b.category) catSet.add(b.category);
        if (b.neighborhood) hoodSet.add(b.neighborhood);
      }
      categories = Array.from(catSet).sort();
      neighborhoods = Array.from(hoodSet).sort();

      // Populate category dropdown
      for (const cat of categories) {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        $categoryFilter.appendChild(opt);
      }

      // Hide loading, show UI
      $loading.hidden = true;

      // Check URL params
      applyUrlState();

      // If no active search/filter, show category browse
      if (!hasActiveFilters()) {
        showCategoryBrowse();
      }

      // Bind events
      bindEvents();
    } catch (err) {
      $loading.innerHTML =
        '<p style="color:#dc2626">Failed to load business data. Please try refreshing the page.</p>';
      console.error(err);
    }
  }

  // === Events ===
  function bindEvents() {
    // Search input with debounce
    let debounceTimer;
    $searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentPage = 1;
        performSearch();
      }, DEBOUNCE_MS);
    });

    $searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(debounceTimer);
        currentPage = 1;
        performSearch();
      }
    });

    // Category filter
    $categoryFilter.addEventListener("change", () => {
      currentPage = 1;
      performSearch();
    });

    // Neighborhood autocomplete
    $neighborhoodFilter.addEventListener("input", () => {
      showNeighborhoodSuggestions();
    });

    $neighborhoodFilter.addEventListener("focus", () => {
      showNeighborhoodSuggestions();
    });

    // Close suggestions on click outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".autocomplete-wrapper")) {
        $neighborhoodSuggestions.hidden = true;
      }
    });

    // Keyboard navigation for suggestions
    $neighborhoodFilter.addEventListener("keydown", (e) => {
      const items = $neighborhoodSuggestions.querySelectorAll("li");
      const active = $neighborhoodSuggestions.querySelector("li.active");
      let idx = Array.from(items).indexOf(active);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (idx < items.length - 1) idx++;
        else idx = 0;
        items.forEach((li) => li.classList.remove("active"));
        items[idx]?.classList.add("active");
        items[idx]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (idx > 0) idx--;
        else idx = items.length - 1;
        items.forEach((li) => li.classList.remove("active"));
        items[idx]?.classList.add("active");
        items[idx]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && active) {
        e.preventDefault();
        selectNeighborhood(active.textContent);
      } else if (e.key === "Escape") {
        $neighborhoodSuggestions.hidden = true;
      }
    });

    // Clear filters
    $clearFilters.addEventListener("click", clearAllFilters);
    $clearFromEmpty.addEventListener("click", clearAllFilters);

    // Pagination
    $prevPage.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderResults();
        scrollToResults();
      }
    });

    $nextPage.addEventListener("click", () => {
      const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE);
      if (currentPage < totalPages) {
        currentPage++;
        renderResults();
        scrollToResults();
      }
    });

    // Modal close
    $modal.querySelector(".modal-close").addEventListener("click", () => {
      $modal.close();
    });

    $modal.addEventListener("click", (e) => {
      // Close on backdrop click
      if (e.target === $modal) {
        $modal.close();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $modal.open) {
        $modal.close();
      }
    });
  }

  // === Search & Filter ===
  function performSearch() {
    const query = $searchInput.value.trim();
    const category = $categoryFilter.value;
    const neighborhood = selectedNeighborhood;

    // Determine result set
    let results;
    if (query) {
      results = fuse.search(query).map((r) => r.item);
    } else {
      results = allBusinesses;
    }

    // Apply category filter
    if (category) {
      results = results.filter((b) => b.category === category);
    }

    // Apply neighborhood filter
    if (neighborhood) {
      results = results.filter((b) => b.neighborhood === neighborhood);
    }

    filteredResults = results;

    // Update URL
    updateUrl();

    // Update UI
    updateActiveFilters();
    $categoryBrowse.hidden = true;

    if (filteredResults.length === 0 && hasActiveFilters()) {
      $resultsGrid.hidden = true;
      $noResults.hidden = false;
      $pagination.hidden = true;
      $resultsInfo.textContent = "No results found";
    } else if (!hasActiveFilters()) {
      showCategoryBrowse();
      return;
    } else {
      $noResults.hidden = true;
      renderResults();
    }
  }

  function renderResults() {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    const page = filteredResults.slice(start, end);
    const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE);

    // Results info
    $resultsInfo.textContent = `Showing ${start + 1}\u2013${Math.min(end, filteredResults.length)} of ${filteredResults.length} businesses`;

    // Build cards
    $resultsGrid.innerHTML = "";
    for (const business of page) {
      $resultsGrid.appendChild(createCard(business));
    }
    $resultsGrid.hidden = false;

    // Pagination
    $prevPage.disabled = currentPage <= 1;
    $nextPage.disabled = currentPage >= totalPages;
    $pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    $pagination.hidden = totalPages <= 1;
  }

  // === Card ===
  function createCard(b) {
    const card = document.createElement("article");
    card.className = "business-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `View details for ${b.name}`);

    let detailsHtml = "";
    if (b.address || b.city) {
      const addr = b.address
        ? `${b.address}, ${b.city}, ${b.state} ${b.zip}`
        : `${b.city}, ${b.state} ${b.zip}`;
      detailsHtml += `<div class="detail-row"><i class="ti ti-map-pin" aria-hidden="true"></i><span>${escapeHtml(addr)}</span></div>`;
    }
    if (b.phone) {
      detailsHtml += `<div class="detail-row"><i class="ti ti-phone" aria-hidden="true"></i><a href="tel:${b.phone}" onclick="event.stopPropagation()">${escapeHtml(b.phone)}</a></div>`;
    }
    if (b.website) {
      const displayUrl = b.website.replace(/^https?:\/\//, "");
      detailsHtml += `<div class="detail-row"><i class="ti ti-external-link" aria-hidden="true"></i><a href="${escapeHtml(b.website)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${escapeHtml(displayUrl)}</a></div>`;
    }

    let descHtml = "";
    if (b.description) {
      const desc =
        b.description.length > 120
          ? b.description.slice(0, 120) + "..."
          : b.description;
      descHtml = `<p class="card-description">${escapeHtml(desc)}</p>`;
    }

    const meta = categoryMeta(b.category);

    card.innerHTML = `
      <div class="card-top">
        <div class="cat-icon-badge ${meta.family}"><i class="ti ${meta.icon}" aria-hidden="true"></i></div>
        <span class="cat-pill ${meta.family}">${escapeHtml(b.category)}</span>
      </div>
      <div class="card-name">${escapeHtml(b.name)}</div>
      <div class="card-details">${detailsHtml}</div>
      ${descHtml}
      ${socialLinksHtml(b)}
    `;

    card.addEventListener("click", () => openModal(b));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(b);
      }
    });

    return card;
  }

  // === Modal ===
  function openModal(b) {
    const meta = categoryMeta(b.category);
    let html = `<div class="modal-top">
      <div class="cat-icon-badge ${meta.family}"><i class="ti ${meta.icon}" aria-hidden="true"></i></div>
      <div>
        <h2 class="modal-name">${escapeHtml(b.name)}</h2>
        <span class="cat-pill ${meta.family}">${escapeHtml(b.category)}</span>
      </div>
    </div>`;
    html += `<dl class="modal-details">`;

    if (b.address || b.city) {
      const addr = b.address
        ? `${b.address}, ${b.city}, ${b.state} ${b.zip}`
        : `${b.city}, ${b.state} ${b.zip}`;
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
      html += `<dt>Address</dt><dd><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(addr)}</a></dd>`;
    }

    if (b.phone) {
      html += `<dt>Phone</dt><dd><a href="tel:${b.phone}">${escapeHtml(b.phone)}</a></dd>`;
    }

    if (b.website) {
      const displayUrl = b.website.replace(/^https?:\/\//, "");
      html += `<dt>Website</dt><dd><a href="${escapeHtml(b.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(displayUrl)}</a></dd>`;
    }

    const modalSocial = socialLinksHtml(b);
    if (modalSocial) {
      html += `<dt>Social</dt><dd>${modalSocial}</dd>`;
    }

    if (b.description) {
      html += `<dt>About</dt><dd>${escapeHtml(b.description)}</dd>`;
    }

    if (b.naics_description && b.naics_description !== "Unclassified Establishments") {
      html += `<dt>Industry</dt><dd>${escapeHtml(b.naics_description)}</dd>`;
    }

    if (b.employee_size) {
      html += `<dt>Size</dt><dd>${escapeHtml(b.employee_size)} employees</dd>`;
    }

    if (b.year_established) {
      html += `<dt>Established</dt><dd>${escapeHtml(b.year_established)}</dd>`;
    }

    if (b.tags && b.tags.length > 0) {
      html += `<dt>Tags</dt><dd><div class="modal-tags">`;
      for (const tag of b.tags) {
        html += `<span class="tag">${escapeHtml(tag)}</span>`;
      }
      html += `</div></dd>`;
    }

    html += `</dl>`;

    $modalBody.innerHTML = html;
    $modal.showModal();
  }

  // === Neighborhood Autocomplete ===
  function showNeighborhoodSuggestions() {
    const query = $neighborhoodFilter.value.trim().toLowerCase();

    let matches;
    if (!query) {
      matches = neighborhoods.slice(0, 15);
    } else {
      matches = neighborhoods
        .filter((n) => n.toLowerCase().includes(query))
        .slice(0, 15);
    }

    if (matches.length === 0) {
      $neighborhoodSuggestions.hidden = true;
      return;
    }

    $neighborhoodSuggestions.innerHTML = "";
    for (const name of matches) {
      const li = document.createElement("li");
      li.textContent = name;
      li.setAttribute("role", "option");
      li.addEventListener("click", () => selectNeighborhood(name));
      $neighborhoodSuggestions.appendChild(li);
    }
    $neighborhoodSuggestions.hidden = false;
  }

  function selectNeighborhood(name) {
    selectedNeighborhood = name;
    $neighborhoodFilter.value = name;
    $neighborhoodSuggestions.hidden = true;
    currentPage = 1;
    performSearch();
  }

  // === Category Browse ===
  function showCategoryBrowse() {
    // Count businesses per category
    const counts = {};
    for (const b of allBusinesses) {
      counts[b.category] = (counts[b.category] || 0) + 1;
    }

    $categoryTiles.innerHTML = "";
    const sorted = categories
      .filter((c) => c !== "Other")
      .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

    for (const cat of sorted) {
      const meta = categoryMeta(cat);
      const tile = document.createElement("button");
      tile.className = "category-tile";
      tile.innerHTML = `
        <div class="cat-icon-badge ${meta.family}"><i class="ti ${meta.icon}" aria-hidden="true"></i></div>
        <div>
          <div class="tile-name">${escapeHtml(cat)}</div>
          <div class="tile-count">${counts[cat] || 0} businesses</div>
        </div>
      `;
      tile.addEventListener("click", () => {
        $categoryFilter.value = cat;
        currentPage = 1;
        performSearch();
        $searchInput.focus();
      });
      $categoryTiles.appendChild(tile);
    }

    // Add "Other" at the end
    if (counts["Other"]) {
      const meta = categoryMeta("Other");
      const tile = document.createElement("button");
      tile.className = "category-tile";
      tile.innerHTML = `
        <div class="cat-icon-badge ${meta.family}"><i class="ti ${meta.icon}" aria-hidden="true"></i></div>
        <div>
          <div class="tile-name">Other</div>
          <div class="tile-count">${counts["Other"]} businesses</div>
        </div>
      `;
      tile.addEventListener("click", () => {
        $categoryFilter.value = "Other";
        currentPage = 1;
        performSearch();
      });
      $categoryTiles.appendChild(tile);
    }

    $categoryBrowse.hidden = false;
    $resultsGrid.hidden = true;
    $noResults.hidden = true;
    $pagination.hidden = true;
    $resultsInfo.textContent = `${allBusinesses.length} businesses in the directory`;
  }

  // === Active Filters ===
  function updateActiveFilters() {
    const query = $searchInput.value.trim();
    const category = $categoryFilter.value;
    const neighborhood = selectedNeighborhood;

    $activeFilters.innerHTML = "";
    let hasFilters = false;

    if (query) {
      hasFilters = true;
      $activeFilters.appendChild(
        createPill(`Search: "${query}"`, () => {
          $searchInput.value = "";
          currentPage = 1;
          performSearch();
        })
      );
    }

    if (category) {
      hasFilters = true;
      $activeFilters.appendChild(
        createPill(`Category: ${category}`, () => {
          $categoryFilter.value = "";
          currentPage = 1;
          performSearch();
        })
      );
    }

    if (neighborhood) {
      hasFilters = true;
      $activeFilters.appendChild(
        createPill(`ZIP: ${neighborhood}`, () => {
          selectedNeighborhood = "";
          $neighborhoodFilter.value = "";
          currentPage = 1;
          performSearch();
        })
      );
    }

    $activeFilters.hidden = !hasFilters;
    $clearFilters.hidden = !hasFilters;
  }

  function createPill(text, onRemove) {
    const pill = document.createElement("button");
    pill.className = "filter-pill";
    pill.innerHTML = `<span>${escapeHtml(text)}</span><span class="pill-remove">&times;</span>`;
    pill.addEventListener("click", onRemove);
    return pill;
  }

  // === Helpers ===
  function hasActiveFilters() {
    return (
      $searchInput.value.trim() !== "" ||
      $categoryFilter.value !== "" ||
      selectedNeighborhood !== ""
    );
  }

  function clearAllFilters() {
    $searchInput.value = "";
    $categoryFilter.value = "";
    $neighborhoodFilter.value = "";
    selectedNeighborhood = "";
    currentPage = 1;
    updateUrl();
    updateActiveFilters();
    showCategoryBrowse();
  }

  function scrollToResults() {
    $resultsGrid.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // === URL State ===
  function updateUrl() {
    const params = new URLSearchParams();
    const query = $searchInput.value.trim();
    const category = $categoryFilter.value;
    const neighborhood = selectedNeighborhood;

    if (query) params.set("q", query);
    if (category) params.set("cat", category);
    if (neighborhood) params.set("hood", neighborhood);

    const url = params.toString()
      ? `${window.location.pathname}?${params}`
      : window.location.pathname;

    history.replaceState(null, "", url);
  }

  function applyUrlState() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const cat = params.get("cat");
    const hood = params.get("hood");

    if (q) $searchInput.value = q;
    if (cat) $categoryFilter.value = cat;
    if (hood) {
      selectedNeighborhood = hood;
      $neighborhoodFilter.value = hood;
    }

    if (q || cat || hood) {
      performSearch();
    }
  }

  // === Start ===
  init();
})();
