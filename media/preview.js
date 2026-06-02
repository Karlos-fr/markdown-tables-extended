(function () {
  const ENHANCED = "data-mte-enhanced";
  const FILTER_ICON = "\u25be";
  const SORT_NONE_ICON = "\u21c5";
  const SORT_ASC_ICON = "\u2191";
  const SORT_DESC_ICON = "\u2193";
  const MIN_COLUMN_WIDTH = 56;

  let activePopover = null;

  function normalize(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function enhanceTables() {
    document.querySelectorAll("table.mte-table:not([" + ENHANCED + "])").forEach(enhanceTable);
  }

  function enhanceTable(table) {
    const headers = Array.from(table.querySelectorAll("thead th"));
    const body = table.tBodies[0];

    if (!headers.length || !body) {
      table.setAttribute(ENHANCED, "true");
      return;
    }

    if (!table.parentElement || !table.parentElement.classList.contains("mte-table-wrapper")) {
      const wrapper = document.createElement("div");
      wrapper.className = "mte-table-wrapper";
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }

    const state = {
      filters: new Map(),
      originalRows: Array.from(body.rows),
      rows: Array.from(body.rows),
      sort: null
    };

    headers.forEach((header, columnIndex) => {
      const originalContent = Array.from(header.childNodes);
      const label = document.createElement("span");
      label.className = "mte-header-label";
      originalContent.forEach((node) => label.appendChild(node));

      const sortButton = document.createElement("button");
      sortButton.type = "button";
      sortButton.className = "mte-sort-button";
      sortButton.setAttribute("aria-label", "Trier cette colonne");
      sortButton.title = "Trier";
      sortButton.textContent = SORT_NONE_ICON;
      sortButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleSort(table, state, columnIndex);
      });

      const button = document.createElement("button");
      button.type = "button";
      button.className = "mte-filter-button";
      button.setAttribute("aria-label", "Filtrer cette colonne");
      button.setAttribute("aria-haspopup", "dialog");
      button.setAttribute("aria-expanded", "false");
      button.textContent = FILTER_ICON;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openFilterPopover(table, state, header, button, columnIndex);
      });

      const content = document.createElement("span");
      content.className = "mte-header";
      content.addEventListener("click", () => toggleSort(table, state, columnIndex));
      content.append(label, sortButton, button);
      header.appendChild(content);

      const resizeHandle = document.createElement("span");
      resizeHandle.className = "mte-resize-handle";
      resizeHandle.setAttribute("role", "separator");
      resizeHandle.setAttribute("aria-orientation", "vertical");
      resizeHandle.setAttribute("aria-label", "Redimensionner la colonne");
      resizeHandle.addEventListener("click", (event) => event.stopPropagation());
      resizeHandle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startColumnResize(table, columnIndex, event.clientX);
      });
      header.appendChild(resizeHandle);
    });

    table.setAttribute(ENHANCED, "true");
  }

  function openFilterPopover(table, state, header, button, columnIndex) {
    closePopover();

    const popover = document.createElement("div");
    popover.className = "mte-filter-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Filtre de colonne");

    const search = document.createElement("input");
    search.type = "search";
    search.className = "mte-filter-search";
    search.placeholder = "Rechercher...";

    const valuesContainer = document.createElement("div");
    valuesContainer.className = "mte-filter-values";

    const values = getColumnValues(state.rows, columnIndex);
    const selected = new Set(state.filters.get(columnIndex) || values);

    const renderValues = () => {
      const query = normalize(search.value).toLocaleLowerCase();
      valuesContainer.replaceChildren();

      values
        .filter((value) => value.toLocaleLowerCase().includes(query))
        .forEach((value) => {
          const id = "mte-filter-" + Math.random().toString(36).slice(2);
          const option = document.createElement("label");
          option.className = "mte-filter-option";

          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = selected.has(value);
          checkbox.id = id;
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
              selected.add(value);
            } else {
              selected.delete(value);
            }
          });

          const text = document.createElement("span");
          text.textContent = value || "(vide)";
          text.title = value || "(vide)";

          option.append(checkbox, text);
          valuesContainer.appendChild(option);
        });

      if (!valuesContainer.childElementCount) {
        const empty = document.createElement("div");
        empty.className = "mte-filter-empty";
        empty.textContent = "Aucune valeur";
        valuesContainer.appendChild(empty);
      }
    };

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "secondary";
    clearButton.textContent = "Effacer";
    clearButton.addEventListener("click", () => {
      state.filters.delete(columnIndex);
      applyTableState(table, state);
      closePopover();
    });

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.textContent = "Appliquer";
    applyButton.addEventListener("click", () => {
      if (selected.size === values.length) {
        state.filters.delete(columnIndex);
      } else {
        state.filters.set(columnIndex, selected);
      }
      applyTableState(table, state);
      closePopover();
    });

    const actions = document.createElement("div");
    actions.className = "mte-filter-actions";
    actions.append(clearButton, applyButton);

    search.addEventListener("input", renderValues);
    popover.append(search, valuesContainer, actions);
    document.body.appendChild(popover);
    positionPopover(popover, button);

    button.setAttribute("aria-expanded", "true");
    activePopover = { popover, button };
    renderValues();
    search.focus();

    function outsideClick(event) {
      if (!popover.contains(event.target) && event.target !== button) {
        closePopover();
      }
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        closePopover();
      }
    }

    activePopover.cleanup = () => {
      document.removeEventListener("click", outsideClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };

    setTimeout(() => document.addEventListener("click", outsideClick, true), 0);
    document.addEventListener("keydown", onKeyDown, true);
  }

  function closePopover() {
    if (!activePopover) {
      return;
    }

    activePopover.button.setAttribute("aria-expanded", "false");
    activePopover.cleanup?.();
    activePopover.popover.remove();
    activePopover = null;
  }

  function positionPopover(popover, anchor) {
    const rect = anchor.getBoundingClientRect();
    const gap = 6;
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const left = Math.max(gap, Math.min(rect.left, window.innerWidth - width - gap));
    const below = rect.bottom + gap;
    const top = below + height < window.innerHeight ? below : Math.max(gap, rect.top - height - gap);

    popover.style.left = left + "px";
    popover.style.top = top + "px";
  }

  function getColumnValues(rows, columnIndex) {
    return Array.from(
      new Set(
        rows.map((row) => normalize((row.cells[columnIndex]?.textContent || "")))
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }

  function startColumnResize(table, columnIndex, startX) {
    closePopover();

    const header = table.querySelectorAll("thead th")[columnIndex];
    const startWidth = header.getBoundingClientRect().width;

    table.classList.add("mte-resizing");

    function onMouseMove(event) {
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + event.clientX - startX);
      setColumnWidth(table, columnIndex, nextWidth);
    }

    function onMouseUp() {
      table.classList.remove("mte-resizing");
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
    }

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
  }

  function setColumnWidth(table, columnIndex, width) {
    const pixelWidth = Math.round(width) + "px";
    table.querySelectorAll("tr").forEach((row) => {
      const cell = row.cells[columnIndex];
      if (!cell) {
        return;
      }

      cell.style.width = pixelWidth;
      cell.style.minWidth = pixelWidth;
      cell.style.maxWidth = pixelWidth;
    });
  }

  function toggleSort(table, state, columnIndex) {
    if (!state.sort || state.sort.columnIndex !== columnIndex) {
      state.sort = { columnIndex, direction: "asc" };
    } else if (state.sort.direction === "asc") {
      state.sort = { columnIndex, direction: "desc" };
    } else {
      state.sort = null;
    }

    applyTableState(table, state);
  }

  function applyTableState(table, state) {
    applySort(table, state);
    applyFilters(table, state);
    applyHeaderState(table, state);
  }

  function applySort(table, state) {
    const body = table.tBodies[0];
    const rows = state.sort ? getSortedRows(state) : state.originalRows;

    rows.forEach((row) => body.appendChild(row));
    state.rows = rows;
  }

  function getSortedRows(state) {
    const { columnIndex, direction } = state.sort;
    const multiplier = direction === "asc" ? 1 : -1;

    return [...state.originalRows].sort((left, right) => {
      const leftValue = normalize(left.cells[columnIndex]?.textContent || "");
      const rightValue = normalize(right.cells[columnIndex]?.textContent || "");
      const comparison = leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: "base"
      });

      return comparison * multiplier;
    });
  }

  function applyFilters(table, state) {
    state.rows.forEach((row) => {
      const isVisible = Array.from(state.filters.entries()).every(([columnIndex, allowed]) => {
        const value = normalize(row.cells[columnIndex]?.textContent || "");
        return allowed.has(value);
      });
      row.hidden = !isVisible;
    });
  }

  function applyHeaderState(table, state) {
    table.querySelectorAll("thead th").forEach((header, index) => {
      header.classList.toggle("mte-filtered", state.filters.has(index));
      header.classList.toggle("mte-sorted", state.sort?.columnIndex === index);

      const sortButton = header.querySelector(".mte-sort-button");
      if (!sortButton) {
        return;
      }

      const isSorted = state.sort?.columnIndex === index;
      sortButton.textContent = SORT_NONE_ICON;
      sortButton.textContent = isSorted && state.sort.direction === "asc" ? SORT_ASC_ICON : sortButton.textContent;
      sortButton.textContent = isSorted && state.sort.direction === "desc" ? SORT_DESC_ICON : sortButton.textContent;
      sortButton.setAttribute("aria-sort", isSorted ? state.sort.direction : "none");
      sortButton.title = isSorted ? "Tri " + (state.sort.direction === "asc" ? "ascendant" : "descendant") : "Trier";
    });
  }

  const observer = new MutationObserver(enhanceTables);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("resize", closePopover);
  document.addEventListener("DOMContentLoaded", enhanceTables);
  enhanceTables();
})();
